import { ConversationState } from './states.js';
import { User, Conversation, CV } from '@prisma/client';
import { IWhatsAppProvider } from '../../whatsapp/whatsapp.interface.js';
import { ConversationService } from '../../domain/services/conversation.service.js';
import { UserService } from '../../domain/services/user.service.js';
import { CVService } from '../../domain/services/cv.service.js';
import { GeminiService } from '../../ai/gemini.service.js';
import { PDFService } from '../../pdf/pdf.service.js';
import { logger } from '../../utils/logger.js';
import { escapeHtml } from '../../utils/escape.js';
import fs from 'fs';
import path from 'path';

export class FiniteStateMachine {
  constructor(
    private provider: IWhatsAppProvider,
    private convService: ConversationService,
    private userService: UserService,
    private cvService: CVService,
    private geminiService: GeminiService,
    private pdfService: PDFService
  ) {}

  async processMessage(user: User, conversation: Conversation, message: string): Promise<void> {
    try {
      logger.info(`[FSM] Processing message from ${user.phone} in state ${conversation.currentState}`);
      
      let nextState = conversation.currentState as ConversationState;
      let cv = await this.cvService.getActiveCVForUser(user.id);
      
      let runAITaskForSection: string | null = null;
      let runPDFTask = false;

      // Handle AI Processing lock and safe recovery
      if (conversation.currentState === ConversationState.AI_PROCESSING) {
        const timeSinceUpdate = Date.now() - new Date(conversation.updatedAt).getTime();
        if (timeSinceUpdate > 2 * 60 * 1000) { // 2 minutes timeout for recovery
          logger.warn(`[FSM] Recovering stuck AI_PROCESSING state for ${user.phone}`);
          await this.provider.sendMessage(user.phone, 'Samahani, mchakato ulichelewa. Tunakupeleka kwenye uhakiki...');
          conversation.currentState = ConversationState.CV_PREVIEW;
          nextState = ConversationState.CV_PREVIEW;
        } else {
          await this.provider.sendMessage(user.phone, 'Tafadhali subiri, AI bado inachakata CV yako...');
          return;
        }
      }
      
      switch (conversation.currentState as ConversationState) {
        case ConversationState.WELCOME:
          await this.provider.sendMessage(user.phone, 'Karibu CareerBot Tanzania! Je, jina lako nani?');
          nextState = ConversationState.REGISTER_NAME;
          break;
        
        case ConversationState.REGISTER_NAME:
          await this.userService.updateUser(user.id, { fullName: message });
          await this.provider.sendMessage(user.phone, `Asante ${message}. Tafadhali weka barua pepe (email) yako.`);
          nextState = ConversationState.REGISTER_EMAIL;
          break;

        case ConversationState.REGISTER_EMAIL:
          await this.userService.updateUser(user.id, { email: message });
          await this.provider.sendInteractiveMessage(
            user.phone, 
            'Asante! Umesajiliwa kikamilifu. Chagua huduma:', 
            ['1️⃣ Tengeneza CV Mpya', '2️⃣ Rekebisha CV', '3️⃣ My Account', '4️⃣ Help']
          );
          nextState = ConversationState.HOME;
          break;

        case ConversationState.HOME:
          if (message.includes('1') || message.toLowerCase().includes('cv mpya')) {
            cv = await this.cvService.createCV({ userId: user.id });
            await this.provider.sendMessage(user.phone, 'Sawa, tuanze kutengeneza CV. Je, unatafuta kazi gani? (Mfano: Mhasibu, Mwalimu)');
            nextState = ConversationState.CV_JOB_TITLE;
          } else {
            await this.provider.sendMessage(user.phone, 'Samahani, huduma hii bado inatengenezwa. Tafadhali chagua "1️⃣ Tengeneza CV Mpya".');
          }
          break;
          
        case ConversationState.CV_JOB_TITLE:
          if (cv) await this.cvService.updateCV(cv.id, { jobTitle: message });
          await this.provider.sendMessage(user.phone, 'Andika maelezo mafupi (Professional Summary) kukuhusu.');
          nextState = ConversationState.CV_SUMMARY;
          break;

        case ConversationState.CV_SUMMARY:
          if (cv) await this.cvService.updateCV(cv.id, { professionalSummary: message });
          if (cv?.references) {
            await this.provider.sendMessage(user.phone, 'Asante! Tunarekebisha CV yako sasa...');
            nextState = ConversationState.AI_PROCESSING;
            runAITaskForSection = 'summary';
          } else {
            await this.provider.sendMessage(user.phone, 'Tafadhali orodhesha elimu yako.');
            nextState = ConversationState.CV_EDUCATION;
          }
          break;

        case ConversationState.CV_EDUCATION:
          if (cv) await this.cvService.updateCV(cv.id, { education: message }); 
          if (cv?.references) {
            await this.provider.sendMessage(user.phone, 'Asante! Tunarekebisha CV yako sasa...');
            nextState = ConversationState.AI_PROCESSING;
            runAITaskForSection = 'education';
          } else {
            await this.provider.sendMessage(user.phone, 'Tafadhali orodhesha uzoefu wako wa kazi.');
            nextState = ConversationState.CV_EXPERIENCE;
          }
          break;

        case ConversationState.CV_EXPERIENCE:
          if (cv) await this.cvService.updateCV(cv.id, { experience: message });
          if (cv?.references) {
            await this.provider.sendMessage(user.phone, 'Asante! Tunarekebisha CV yako sasa...');
            nextState = ConversationState.AI_PROCESSING;
            runAITaskForSection = 'experience';
          } else {
            await this.provider.sendMessage(user.phone, 'Tafadhali orodhesha ujuzi (skills) wako.');
            nextState = ConversationState.CV_SKILLS;
          }
          break;

        case ConversationState.CV_SKILLS:
          if (cv) await this.cvService.updateCV(cv.id, { skills: message });
          if (cv?.references) {
            await this.provider.sendMessage(user.phone, 'Asante! Tunarekebisha CV yako sasa...');
            nextState = ConversationState.AI_PROCESSING;
            runAITaskForSection = 'skills';
          } else {
            await this.provider.sendMessage(user.phone, 'Tafadhali orodhesha lugha unazozungumza.');
            nextState = ConversationState.CV_LANGUAGES;
          }
          break;

        case ConversationState.CV_LANGUAGES:
          if (cv) await this.cvService.updateCV(cv.id, { languages: message });
          if (cv?.references) {
            await this.provider.sendMessage(user.phone, 'Asante! Tunarekebisha CV yako sasa...');
            nextState = ConversationState.AI_PROCESSING;
            runAITaskForSection = 'languages';
          } else {
            await this.provider.sendMessage(user.phone, 'Tafadhali weka wadhamini (references) wako.');
            nextState = ConversationState.CV_REFERENCES;
          }
          break;

        case ConversationState.CV_REFERENCES: {
          const isEditFlow = !!cv?.references;
          if (cv) await this.cvService.updateCV(cv.id, { references: message });
          await this.provider.sendMessage(user.phone, 'Asante! Tunaiandaa CV yako sasa hivi. Tafadhali subiri kidogo...');
          nextState = ConversationState.AI_PROCESSING;
          runAITaskForSection = isEditFlow ? 'references' : 'all';
          break;
        }

        case ConversationState.CV_PREVIEW:
          if (message.includes('1') || message.toLowerCase().includes('confirm') || message.toLowerCase().includes('ndio')) {
            await this.provider.sendMessage(user.phone, 'Sawa, tunatengeneza PDF ya CV yako...');
            nextState = ConversationState.PDF_READY;
            runPDFTask = true;
          } else if (message.includes('2') || message.toLowerCase().includes('edit') || message.toLowerCase().includes('hapana')) {
            await this.provider.sendInteractiveMessage(
              user.phone, 
              'Je, ungependa kurekebisha sehemu gani?\n1️⃣ Summary\n2️⃣ Experience\n3️⃣ Skills\n4️⃣ Education\n5️⃣ Languages\n6️⃣ References', 
              ['1️⃣ Summary', '2️⃣ Experience', '3️⃣ Skills']
            );
            nextState = ConversationState.EDIT_SECTION_SELECT;
          } else {
            await this.provider.sendInteractiveMessage(
              user.phone, 
              'Je, unathibitisha CV hii?', 
              ['1️⃣ Confirm', '2️⃣ Edit']
            );
          }
          break;

        case ConversationState.EDIT_SECTION_SELECT:
          if (message.includes('1') || message.toLowerCase().includes('summary')) {
            await this.provider.sendMessage(user.phone, 'Andika maelezo mafupi (Professional Summary) mapya.');
            nextState = ConversationState.CV_SUMMARY;
          } else if (message.includes('2') || message.toLowerCase().includes('experience')) {
            await this.provider.sendMessage(user.phone, 'Tafadhali orodhesha uzoefu wako wa kazi mpya.');
            nextState = ConversationState.CV_EXPERIENCE;
          } else if (message.includes('3') || message.toLowerCase().includes('skills')) {
            await this.provider.sendMessage(user.phone, 'Tafadhali orodhesha ujuzi (skills) wako mpya.');
            nextState = ConversationState.CV_SKILLS;
          } else if (message.includes('4') || message.toLowerCase().includes('education')) {
            await this.provider.sendMessage(user.phone, 'Tafadhali orodhesha elimu yako mpya.');
            nextState = ConversationState.CV_EDUCATION;
          } else if (message.includes('5') || message.toLowerCase().includes('languages')) {
            await this.provider.sendMessage(user.phone, 'Tafadhali orodhesha lugha unazozungumza mpya.');
            nextState = ConversationState.CV_LANGUAGES;
          } else if (message.includes('6') || message.toLowerCase().includes('references')) {
            await this.provider.sendMessage(user.phone, 'Tafadhali weka wadhamini (references) wako wapya.');
            nextState = ConversationState.CV_REFERENCES;
          } else {
            await this.provider.sendMessage(user.phone, 'Sikuelewa. Tafadhali chagua: 1 (Summary), 2 (Experience), 3 (Skills), 4 (Education), 5 (Languages), au 6 (References).');
            nextState = ConversationState.EDIT_SECTION_SELECT;
          }
          break;

        case ConversationState.PDF_READY:
          if (message.includes('1') || message.toLowerCase().includes('cv mpya')) {
            cv = await this.cvService.createCV({ userId: user.id });
            await this.provider.sendMessage(user.phone, 'Sawa, tuanze kutengeneza CV. Je, unatafuta kazi gani? (Mfano: Mhasibu, Mwalimu)');
            nextState = ConversationState.CV_JOB_TITLE;
          } else {
            await this.provider.sendMessage(user.phone, `CV yako ipo tayari. Kama unataka CV mpya chagua "1️⃣ Tengeneza CV Mpya" au rudi mwanzo.`);
            nextState = ConversationState.HOME;
          }
          break;

        default:
          await this.provider.sendMessage(user.phone, 'Samahani, sikuelewa. Tutarudi mwanzo.');
          nextState = ConversationState.HOME;
          break;
      }

      // 1) Update conversation state first to prevent race conditions
      await this.convService.updateConversation(conversation.id, {
        currentState: nextState,
        lastMessage: message,
      });
      
      logger.info(`[FSM] Transitioned ${user.phone} to state ${nextState}`);

      // 2) Run background processing only AFTER state is safely persisted
      if (runAITaskForSection) {
        if (cv) {
          const activeCv = await this.cvService.getActiveCVForUser(user.id);
          if (activeCv) {
            this.handleAIProcessing(user, conversation, activeCv, runAITaskForSection).catch(err => {
              logger.error(`[FSM] Background AI processing failed: ${err}`);
            });
          }
        } else {
          logger.warn(`[FSM] Cannot run AI task, no active CV found for user ${user.id}`);
        }
      }

      if (runPDFTask) {
        if (cv) {
          const activeCv = await this.cvService.getActiveCVForUser(user.id);
          if (activeCv) {
            this.handlePDFGeneration(user, conversation, activeCv).catch(err => {
              logger.error(`[FSM] Background PDF processing failed: ${err}`);
            });
          }
        } else {
          logger.warn(`[FSM] Cannot run PDF task, no active CV found for user ${user.id}`);
        }
      }

    } catch (error) {
      logger.error(`[FSM] Exception in processMessage for ${user?.phone}: ${error instanceof Error ? error.message : String(error)}`);
      await this.provider.sendMessage(user.phone, 'Samahani, kumetokea hitilafu ya kiufundi. Tafadhali jaribu tena baadae.');
    }
  }

  private async handleAIProcessing(user: User, conversation: Conversation, cv: CV, section: string) {
    try {
      let enhancedSummary: string | null = cv.professionalSummary;
      let enhancedExperience: string | null = cv.experience as string | null;
      let enhancedSkills: string | null = cv.skills as string | null;
      
      if (section === 'all' || section === 'summary') {
        enhancedSummary = cv.professionalSummary ? await this.geminiService.enhanceSummary(cv.professionalSummary) : null;
      }
      if (section === 'all' || section === 'experience') {
        enhancedExperience = cv.experience ? await this.geminiService.enhanceExperience(cv.experience as string) : null;
      }
      if (section === 'all' || section === 'skills') {
        enhancedSkills = cv.skills ? await this.geminiService.enhanceSkills(cv.skills as string) : null;
      }
      
      let updatedCv = cv;
      if (section === 'all' || section === 'summary' || section === 'experience' || section === 'skills') {
        updatedCv = await this.cvService.updateEnhancedContent(cv.id, {
          professionalSummary: enhancedSummary || cv.professionalSummary || undefined,
          experience: enhancedExperience || (cv.experience as string) || undefined,
          skills: enhancedSkills || (cv.skills as string) || undefined,
        });
      }

      const previewText = `
--- CV PREVIEW ---
*Name:* ${user.fullName}
*Email:* ${user.email}
*Job Title:* ${updatedCv.jobTitle}

*Professional Summary:*
${updatedCv.professionalSummary}

*Education:*
${updatedCv.education}

*Experience:*
${updatedCv.experience}

*Skills:*
${updatedCv.skills}

*Languages:*
${updatedCv.languages}

*References:*
${updatedCv.references}
-------------------
`;
      await this.provider.sendMessage(user.phone, previewText);
      await this.provider.sendInteractiveMessage(
        user.phone, 
        'Je, unathibitisha CV hii?', 
        ['1️⃣ Confirm', '2️⃣ Edit']
      );

      await this.convService.updateConversation(conversation.id, {
        currentState: ConversationState.CV_PREVIEW,
      });
      logger.info(`[FSM] AI Processing completed, transitioned ${user.phone} to CV_PREVIEW`);

    } catch (error) {
      logger.error(`[FSM] AI Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      await this.provider.sendMessage(user.phone, 'Samahani, kumetokea hitilafu wakati wa kuchakata CV yako. Tutarudi kwenye uhakiki na maelezo yako ya awali.');
      
      // Fallback to preview without AI enhancements if it completely failed
      await this.convService.updateConversation(conversation.id, {
        currentState: ConversationState.CV_PREVIEW,
      });
    }
  }

  private async handlePDFGeneration(user: User, conversation: Conversation, cv: CV) {
    try {
      const templatePath = path.resolve('templates', 'cv.html');
      let html = fs.readFileSync(templatePath, 'utf-8');

      html = html.replace('{{fullName}}', escapeHtml(user.fullName || ''));
      html = html.replace('{{email}}', escapeHtml(user.email || ''));
      html = html.replace('{{phone}}', escapeHtml(user.phone || ''));
      html = html.replace('{{jobTitle}}', escapeHtml(cv.jobTitle || ''));
      html = html.replace('{{professionalSummary}}', escapeHtml(cv.professionalSummary || ''));
      html = html.replace('{{experience}}', escapeHtml((cv.experience as string) || ''));
      html = html.replace('{{education}}', escapeHtml((cv.education as string) || ''));
      html = html.replace('{{skills}}', escapeHtml((cv.skills as string) || ''));
      html = html.replace('{{languages}}', escapeHtml((cv.languages as string) || ''));
      html = html.replace('{{references}}', escapeHtml((cv.references as string) || ''));
      
      // Handle optional sections correctly (crude fallback for conditionals)
      html = html.replace(/{{#if.*?}}/g, '');
      html = html.replace(/{{\/if}}/g, '');

      const fileName = `CV_${user.phone}_${cv.id}.pdf`;
      const pdfPath = await this.pdfService.generatePDF(html, fileName);

      if (pdfPath) {
        await this.cvService.savePdfPath(cv.id, pdfPath);
        const downloadLink = pdfPath; // the provider now returns the URL
        await this.provider.sendMessage(user.phone, `CV yako ipo tayari! Unaweza kuipakua hapa: ${downloadLink}`);
      } else {
        await this.provider.sendMessage(user.phone, 'Samahani, kumetokea hitilafu wakati wa kutengeneza PDF. Tafadhali jaribu tena. Chagua 1 (Confirm) au 2 (Edit).');
        await this.convService.updateConversation(conversation.id, {
          currentState: ConversationState.CV_PREVIEW,
        });
      }
    } catch (error) {
      logger.error(`[FSM] PDF generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      await this.provider.sendMessage(user.phone, 'Samahani, kumetokea hitilafu wakati wa kutengeneza PDF. Tafadhali jaribu tena. Chagua 1 (Confirm) au 2 (Edit).');
      await this.convService.updateConversation(conversation.id, {
        currentState: ConversationState.CV_PREVIEW,
      });
    }
  }
}

