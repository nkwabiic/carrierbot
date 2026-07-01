import { ConversationState } from './states.js';
import { User, Conversation, CV } from '@prisma/client';
import { IWhatsAppProvider } from '../../whatsapp/whatsapp.interface.js';
import { ConversationService } from '../../domain/services/conversation.service.js';
import { UserService } from '../../domain/services/user.service.js';
import { CVService } from '../../domain/services/cv.service.js';
import { GeminiService } from '../../ai/gemini.service.js';
import { PDFService } from '../../pdf/pdf.service.js';
import { CvPreviewService } from '../../domain/services/cv-preview.service.js';
import { logger } from '../../utils/logger.js';
import { escapeHtml } from '../../utils/escape.js';
import { t } from '../../utils/i18n.js';
import { isValidEmail, isValidName, isNotEmpty, isMeaningfulText, isValidGradYear } from '../../utils/validators.js';
import fs from 'fs';
import path from 'path';

export class FiniteStateMachine {
  constructor(
    private provider: IWhatsAppProvider,
    private convService: ConversationService,
    private userService: UserService,
    private cvService: CVService,
    private geminiService: GeminiService,
    private pdfService: PDFService,
    private cvPreviewService: CvPreviewService
  ) {}

  async processMessage(user: User, conversation: Conversation, message: string): Promise<void> {
    try {
      logger.info(
        `[FSM] Processing message from ${user.phone} in state ${conversation.currentState}`
      );

      let nextState = conversation.currentState as ConversationState;
      let cv = await this.cvService.getActiveCVForUser(user.id);

      let runAITaskForSection: string | null = null;
      let runPDFTask = false;

      // Handle Session Timeout (2 hours inactive)
      const timeSinceUpdate = Date.now() - new Date(conversation.updatedAt).getTime();
      const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
      const metaDataObj = typeof conversation.metadata === 'object' && conversation.metadata !== null ? conversation.metadata : {};
      const lang = (metaDataObj as any).lang || 'sw';

      if (
        conversation.currentState !== ConversationState.WELCOME &&
        conversation.currentState !== ConversationState.HOME &&
        conversation.currentState !== ConversationState.EXPIRED_PROMPT &&
        timeSinceUpdate >= TWO_HOURS_MS
      ) {
        const meta =
          typeof conversation.metadata === 'object' && conversation.metadata !== null
            ? { ...(conversation.metadata as object) }
            : {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (meta as any).suspendedState = conversation.currentState;
        await this.convService.updateConversation(conversation.id, {
          currentState: ConversationState.EXPIRED_PROMPT,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          metadata: meta as any,
        });
        await this.provider.sendMessage(
          user.phone,
          'Karibu tena 👋\n\nInaonekana uliacha kutengeneza CV yako.'
        );
        await this.provider.sendInteractiveMessage(user.phone, 'Chagua:', [
          '1️⃣ Endelea',
          '2️⃣ Anza Upya',
        ]);
        return;
      }

      const msgLower = message.trim().toLowerCase();

      // Cancel / Restart Command
      if (msgLower === 'cancel' || msgLower === 'restart' || msgLower === '0') {
        if ((msgLower === 'cancel' || msgLower === 'restart') && cv) {
          await this.cvService.deleteCV(cv.id);
        }
        const meta =
          typeof conversation.metadata === 'object' && conversation.metadata !== null
            ? { ...(conversation.metadata as object) }
            : {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (meta as any).suspendedState;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await this.convService.updateConversation(conversation.id, {
          currentState: ConversationState.HOME,
          metadata: meta as any,
        });
        if (msgLower === 'cancel' || msgLower === 'restart') {
          await this.provider.sendMessage(user.phone, t(lang, 'cancelled'));
        }
        await this.sendPromptForState(ConversationState.HOME, user, lang);
        return;
      }

      // Back Command
      if (msgLower === 'back') {
        const backState = this.getBackState(
          conversation.currentState as ConversationState,
          cv as CV
        );
        if (backState) {
          await this.convService.updateConversation(conversation.id, { currentState: backState });
          await this.sendPromptForState(backState, user, lang);
        } else {
          await this.provider.sendMessage(user.phone, 'Huwezi kurudi nyuma zaidi.');
        }
        return;
      }

      // Handle AI Processing lock and safe recovery
      if (conversation.currentState === ConversationState.AI_PROCESSING) {
        if (timeSinceUpdate > 2 * 60 * 1000) {
          // 2 minutes timeout for recovery
          logger.warn(`[FSM] Recovering stuck AI_PROCESSING state for ${user.phone}`);
          await this.provider.sendMessage(
            user.phone,
            'Samahani, mchakato ulichelewa. Tunakupeleka kwenye uhakiki...'
          );
          conversation.currentState = ConversationState.CV_PREVIEW;
          nextState = ConversationState.CV_PREVIEW;
        } else {
          await this.provider.sendMessage(
            user.phone,
            'Tafadhali subiri, AI bado inachakata CV yako...'
          );
          return;
        }
      }

      switch (conversation.currentState as ConversationState) {
        case ConversationState.EXPIRED_PROMPT: {
          const meta =
            typeof conversation.metadata === 'object' && conversation.metadata !== null
              ? { ...(conversation.metadata as object) }
              : {};

          if (message.includes('1') || msgLower.includes('endelea')) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const suspendedState =
              ((meta as any).suspendedState as ConversationState) || ConversationState.HOME;
            nextState = suspendedState;
            await this.sendPromptForState(suspendedState, user, lang);
          } else if (message.includes('2') || msgLower.includes('anza')) {
            if (cv) await this.cvService.deleteCV(cv.id);
            await this.provider.sendMessage(user.phone, t(lang, 'old_deleted'));
            await this.sendPromptForState(ConversationState.HOME, user, lang);
            nextState = ConversationState.HOME;
          } else {
            await this.provider.sendInteractiveMessage(user.phone, t(lang, 'expired_prompt'), [
              '1️⃣ Endelea',
              '2️⃣ Anza Upya',
            ]);
            return;
          }

          // Clear suspendedState after resuming or restarting
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          delete (meta as any).suspendedState;
          await this.convService.updateConversation(conversation.id, {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            metadata: meta as any,
          });
          break;
        }

        case ConversationState.WELCOME:
          await this.sendPromptForState(ConversationState.SELECT_LANGUAGE, user, lang);
          nextState = ConversationState.SELECT_LANGUAGE;
          break;

        case ConversationState.SELECT_LANGUAGE: {
          let lang = 'en';
          if (message.includes('1') || msgLower.includes('swahili')) {
            lang = 'sw';
          } else if (message.includes('2') || msgLower.includes('english')) {
            lang = 'en';
          } else {
            await this.provider.sendMessage(
              user.phone,
              t(lang, 'invalid_language')
            );
            return;
          }
          const meta =
            typeof conversation.metadata === 'object' && conversation.metadata !== null
              ? { ...(conversation.metadata as object) }
              : {};
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (meta as any).language = lang;
          await this.convService.updateConversation(conversation.id, {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            metadata: meta as any,
          });
          nextState = ConversationState.REGISTER_NAME;
          await this.sendPromptForState(nextState, user, lang);
          break;
        }

        case ConversationState.REGISTER_NAME:
          if (!isValidName(message)) {
            await this.provider.sendMessage(
              user.phone,
              'Jina halijakubaliwa. Tumia herufi tu na nafasi. Tafadhali andika majina yako kamili tena.'
            );
            return;
          }
          user = await this.userService.updateUser(user.id, { fullName: message });
          nextState = ConversationState.REGISTER_EMAIL;
          await this.sendPromptForState(nextState, user, lang);
          break;

        case ConversationState.REGISTER_EMAIL:
          if (!isValidEmail(message)) {
            await this.provider.sendMessage(
              user.phone,
              'Barua pepe sio sahihi. Tafadhali weka barua pepe halali (mfano: john@gmail.com).'
            );
            return;
          }
          await this.userService.updateUser(user.id, { email: message });

          if (cv?.references && Array.isArray(cv.references) && cv.references.length > 0) {
            nextState = ConversationState.CV_PREVIEW;
            const previewText = this.cvPreviewService.buildPreview(user, cv);
            await this.provider.sendMessage(user.phone, previewText);
            await this.provider.sendMessage(
              user.phone,
              t(lang, 'preview_menu')
            );
          } else {
            await this.provider.sendInteractiveMessage(
              user.phone,
              'Asante! Umesajiliwa kikamilifu. Chagua huduma:',
              ['1️⃣ Tengeneza CV Mpya', '2️⃣ Rekebisha CV', '3️⃣ My Account', '4️⃣ Help']
            );
            nextState = ConversationState.HOME;
          }
          break;

        case ConversationState.HOME:
          if (message.includes('1') || message.toLowerCase().includes('cv mpya')) {
            cv = await this.cvService.createCV({ userId: user.id });
            await this.provider.sendMessage(
              user.phone,
              t(lang, 'ask_job_title')
            );
            nextState = ConversationState.CV_JOB_TITLE;
          } else {
            await this.provider.sendMessage(
              user.phone,
              'Samahani, huduma hii bado inatengenezwa. Tafadhali chagua "1️⃣ Tengeneza CV Mpya".'
            );
          }
          break;

        case ConversationState.CV_JOB_TITLE:
          if (cv) await this.cvService.updateCV(cv.id, { jobTitle: message });
          await this.provider.sendMessage(
            user.phone,
            t(lang, 'ask_summary')
          );
          nextState = ConversationState.CV_SUMMARY;
          break;

        case ConversationState.CV_SUMMARY:
          if (!isNotEmpty(message) || !isMeaningfulText(message)) {
            await this.provider.sendMessage(
              user.phone,
              t(lang, 'invalid_summary')
            );
            return;
          }
          if (cv) await this.cvService.updateCV(cv.id, { professionalSummary: message });
          if (cv?.references && Array.isArray(cv.references) && cv.references.length > 0) {
            await this.provider.sendMessage(user.phone, t(lang, 'updating'));
            nextState = ConversationState.AI_PROCESSING;
            runAITaskForSection = 'summary';
            await this.sendPromptForState(nextState, user, lang);
          } else {
            nextState = ConversationState.EXP_COMPANY;
            await this.sendPromptForState(nextState, user, lang);
          }
          break;

        case ConversationState.EXP_COMPANY: {
          if (!isNotEmpty(message)) {
            await this.provider.sendMessage(
              user.phone,
              t(lang, 'invalid_empty')
            );
            return;
          }
          const exps = Array.isArray(cv?.experience) ? [...(cv!.experience as any[])] : [];
          if (exps.length === 0 || exps[exps.length - 1].isComplete) {
            exps.push({ company: message });
          } else {
            exps[exps.length - 1].company = message;
          }
          if (cv) await this.cvService.updateCV(cv.id, { experience: exps });
          nextState = ConversationState.EXP_JOB_TITLE;
          await this.sendPromptForState(nextState, user, lang);
          break;
        }

        case ConversationState.EXP_JOB_TITLE: {
          if (!isNotEmpty(message)) {
            await this.provider.sendMessage(user.phone, t(lang, 'invalid_empty'));
            return;
          }
          const exps = Array.isArray(cv?.experience) ? [...(cv!.experience as any[])] : [];
          if (exps.length > 0) exps[exps.length - 1].jobTitle = message;
          if (cv) await this.cvService.updateCV(cv.id, { experience: exps });
          nextState = ConversationState.EXP_LOCATION;
          await this.sendPromptForState(nextState, user, lang);
          break;
        }

        case ConversationState.EXP_LOCATION: {
          const exps = Array.isArray(cv?.experience) ? [...(cv!.experience as any[])] : [];
          if (exps.length > 0)
            exps[exps.length - 1].location = message.toLowerCase() === 'skip' ? '' : message;
          if (cv) await this.cvService.updateCV(cv.id, { experience: exps });
          nextState = ConversationState.EXP_TYPE;
          await this.sendPromptForState(nextState, user, lang);
          break;
        }

        case ConversationState.EXP_TYPE: {
          let type = message;
          if (message.includes('1') || message.toLowerCase().includes('full')) type = 'Full Time';
          else if (message.includes('2') || message.toLowerCase().includes('part'))
            type = 'Part Time';
          else if (message.includes('3') || message.toLowerCase().includes('intern'))
            type = 'Internship';
          else if (message.includes('4') || message.toLowerCase().includes('volunteer'))
            type = 'Volunteer';
          else if (message.includes('5') || message.toLowerCase().includes('contract'))
            type = 'Contract';

          const exps = Array.isArray(cv?.experience) ? [...(cv!.experience as any[])] : [];
          if (exps.length > 0) exps[exps.length - 1].type = type;
          if (cv) await this.cvService.updateCV(cv.id, { experience: exps });
          nextState = ConversationState.EXP_START_MONTH;
          await this.sendPromptForState(nextState, user, lang);
          break;
        }

        case ConversationState.EXP_START_MONTH: {
          const exps = Array.isArray(cv?.experience) ? [...(cv!.experience as any[])] : [];
          if (exps.length > 0) exps[exps.length - 1].startMonth = message;
          if (cv) await this.cvService.updateCV(cv.id, { experience: exps });
          nextState = ConversationState.EXP_START_YEAR;
          await this.sendPromptForState(nextState, user, lang);
          break;
        }

        case ConversationState.EXP_START_YEAR: {
          const exps = Array.isArray(cv?.experience) ? [...(cv!.experience as any[])] : [];
          if (exps.length > 0) exps[exps.length - 1].startYear = message;
          if (cv) await this.cvService.updateCV(cv.id, { experience: exps });
          nextState = ConversationState.EXP_STILL_WORKING;
          await this.sendPromptForState(nextState, user, lang);
          break;
        }

        case ConversationState.EXP_STILL_WORKING: {
          let isStillWorking = false;
          if (
            message.includes('1') ||
            message.toLowerCase().includes('yes') ||
            message.toLowerCase().includes('ndio')
          )
            isStillWorking = true;

          const exps = Array.isArray(cv?.experience) ? [...(cv!.experience as any[])] : [];
          if (exps.length > 0) {
            exps[exps.length - 1].stillWorking = isStillWorking;
            if (isStillWorking) {
              exps[exps.length - 1].endMonth = '';
              exps[exps.length - 1].endYear = 'Present';
            }
          }
          if (cv) await this.cvService.updateCV(cv.id, { experience: exps });

          nextState = isStillWorking
            ? ConversationState.EXP_RESPONSIBILITIES
            : ConversationState.EXP_END_MONTH;
          await this.sendPromptForState(nextState, user, lang);
          break;
        }

        case ConversationState.EXP_END_MONTH: {
          const exps = Array.isArray(cv?.experience) ? [...(cv!.experience as any[])] : [];
          if (exps.length > 0) exps[exps.length - 1].endMonth = message;
          if (cv) await this.cvService.updateCV(cv.id, { experience: exps });
          nextState = ConversationState.EXP_END_YEAR;
          await this.sendPromptForState(nextState, user, lang);
          break;
        }

        case ConversationState.EXP_END_YEAR: {
          const exps = Array.isArray(cv?.experience) ? [...(cv!.experience as any[])] : [];
          if (exps.length > 0) exps[exps.length - 1].endYear = message;
          if (cv) await this.cvService.updateCV(cv.id, { experience: exps });
          nextState = ConversationState.EXP_RESPONSIBILITIES;
          await this.sendPromptForState(nextState, user, lang);
          break;
        }

        case ConversationState.EXP_RESPONSIBILITIES: {
          if (!isNotEmpty(message) || !isMeaningfulText(message)) {
            await this.provider.sendMessage(
              user.phone,
              t(lang, 'invalid_responsibilities')
            );
            return;
          }
          const exps = Array.isArray(cv?.experience) ? [...(cv!.experience as any[])] : [];
          if (exps.length > 0) exps[exps.length - 1].responsibilities = message;
          if (cv) await this.cvService.updateCV(cv.id, { experience: exps });
          nextState = ConversationState.EXP_ACHIEVEMENTS;
          await this.sendPromptForState(nextState, user, lang);
          break;
        }

        case ConversationState.EXP_ACHIEVEMENTS: {
          const exps = Array.isArray(cv?.experience) ? [...(cv!.experience as any[])] : [];
          if (exps.length > 0) {
            exps[exps.length - 1].achievements = message.toLowerCase() === 'skip' ? '' : message;
            exps[exps.length - 1].isComplete = true;
          }
          if (cv) await this.cvService.updateCV(cv.id, { experience: exps });
          nextState = ConversationState.EXP_ADD_ANOTHER;
          await this.sendPromptForState(nextState, user, lang);
          break;
        }

        case ConversationState.EXP_ADD_ANOTHER: {
          if (
            message.includes('1') ||
            message.toLowerCase().includes('yes') ||
            message.toLowerCase().includes('ndio')
          ) {
            nextState = ConversationState.EXP_COMPANY;
          } else {
            if (cv?.references && Array.isArray(cv.references) && cv.references.length > 0) {
              await this.provider.sendMessage(user.phone, t(lang, 'updating'));
              nextState = ConversationState.AI_PROCESSING;
              runAITaskForSection = 'experience';
            } else {
              nextState = ConversationState.EDU_INSTITUTION;
            }
          }
          await this.sendPromptForState(nextState, user, lang);
          break;
        }

        case ConversationState.EDU_INSTITUTION: {
          if (!isNotEmpty(message)) {
            await this.provider.sendMessage(
              user.phone,
              t(lang, 'invalid_empty')
            );
            return;
          }
          const edus = Array.isArray(cv?.education) ? [...(cv!.education as any[])] : [];
          if (edus.length === 0 || edus[edus.length - 1].isComplete) {
            edus.push({ institution: message });
          } else {
            edus[edus.length - 1].institution = message;
          }
          if (cv) await this.cvService.updateCV(cv.id, { education: edus });
          nextState = ConversationState.EDU_QUALIFICATION;
          await this.sendPromptForState(nextState, user, lang);
          break;
        }

        case ConversationState.EDU_QUALIFICATION: {
          if (!isNotEmpty(message)) {
            await this.provider.sendMessage(
              user.phone,
              t(lang, 'invalid_empty')
            );
            return;
          }
          const edus = Array.isArray(cv?.education) ? [...(cv!.education as any[])] : [];
          if (edus.length > 0) edus[edus.length - 1].qualification = message;
          if (cv) await this.cvService.updateCV(cv.id, { education: edus });
          nextState = ConversationState.EDU_FIELD;
          await this.sendPromptForState(nextState, user, lang);
          break;
        }

        case ConversationState.EDU_FIELD: {
          const edus = Array.isArray(cv?.education) ? [...(cv!.education as any[])] : [];
          if (edus.length > 0) edus[edus.length - 1].field = message;
          if (cv) await this.cvService.updateCV(cv.id, { education: edus });
          nextState = ConversationState.EDU_START_YEAR;
          await this.sendPromptForState(nextState, user, lang);
          break;
        }

        case ConversationState.EDU_START_YEAR: {
          const edus = Array.isArray(cv?.education) ? [...(cv!.education as any[])] : [];
          if (edus.length > 0) edus[edus.length - 1].startYear = message;
          if (cv) await this.cvService.updateCV(cv.id, { education: edus });
          nextState = ConversationState.EDU_GRAD_YEAR;
          await this.sendPromptForState(nextState, user, lang);
          break;
        }

        case ConversationState.EDU_GRAD_YEAR: {
          if (!isValidGradYear(message)) {
            await this.provider.sendMessage(
              user.phone,
              t(lang, 'invalid_grad_year')
            );
            return;
          }
          const edus = Array.isArray(cv?.education) ? [...(cv!.education as any[])] : [];
          if (edus.length > 0) edus[edus.length - 1].gradYear = message;
          if (cv) await this.cvService.updateCV(cv.id, { education: edus });
          nextState = ConversationState.EDU_GPA;
          await this.sendPromptForState(nextState, user, lang);
          break;
        }

        case ConversationState.EDU_GPA: {
          const edus = Array.isArray(cv?.education) ? [...(cv!.education as any[])] : [];
          if (edus.length > 0) {
            edus[edus.length - 1].gpa = message.toLowerCase() === 'skip' ? '' : message;
            edus[edus.length - 1].isComplete = true;
          }
          if (cv) await this.cvService.updateCV(cv.id, { education: edus });
          nextState = ConversationState.EDU_ADD_ANOTHER;
          await this.sendPromptForState(nextState, user, lang);
          break;
        }

        case ConversationState.EDU_ADD_ANOTHER: {
          if (
            message.includes('1') ||
            message.toLowerCase().includes('yes') ||
            message.toLowerCase().includes('ndio')
          ) {
            nextState = ConversationState.EDU_INSTITUTION;
          } else {
            if (cv?.references && Array.isArray(cv.references) && cv.references.length > 0) {
              nextState = ConversationState.CV_PREVIEW;
              const previewText = this.cvPreviewService.buildPreview(user, cv);
              await this.provider.sendMessage(user.phone, previewText);
              await this.provider.sendMessage(
                user.phone,
                t(lang, 'preview_menu')
              );
            } else {
              nextState = ConversationState.CV_SKILLS;
            }
          }
          await this.sendPromptForState(nextState, user, lang);
          break;
        }

        case ConversationState.CV_SKILLS: {
          if (!isNotEmpty(message)) {
            await this.provider.sendMessage(
              user.phone,
              t(lang, 'invalid_empty')
            );
            return;
          }
          const normalizedSkills = Array.from(new Set(message.split(',').map(s => s.trim()).filter(s => s.length > 0))).join(', ');
          if (cv) await this.cvService.updateCV(cv.id, { skills: normalizedSkills });

          if (cv?.references && Array.isArray(cv.references) && cv.references.length > 0) {
            await this.provider.sendMessage(user.phone, t(lang, 'updating'));
            nextState = ConversationState.AI_PROCESSING;
            runAITaskForSection = 'skills';
          } else {
            nextState = ConversationState.LANG_NAME;
          }
          await this.sendPromptForState(nextState, user, lang);
          break;
        }

        case ConversationState.LANG_NAME: {
          if (!isNotEmpty(message)) {
            await this.provider.sendMessage(
              user.phone,
              t(lang, 'invalid_empty')
            );
            return;
          }
          const langs = Array.isArray(cv?.languages) ? [...(cv!.languages as any[])] : [];
          if (langs.length === 0 || langs[langs.length - 1].isComplete) {
            langs.push({ language: message });
          } else {
            langs[langs.length - 1].language = message;
          }
          if (cv) await this.cvService.updateCV(cv.id, { languages: langs });
          nextState = ConversationState.LANG_LEVEL;
          await this.sendPromptForState(nextState, user, lang);
          break;
        }

        case ConversationState.LANG_LEVEL: {
          let level = message;
          if (message.includes('1') || message.toLowerCase().includes('native')) level = 'Native';
          else if (message.includes('2') || message.toLowerCase().includes('fluent'))
            level = 'Fluent';
          else if (message.includes('3') || message.toLowerCase().includes('intermediate'))
            level = 'Intermediate';
          else if (message.includes('4') || message.toLowerCase().includes('basic'))
            level = 'Basic';

          const langs = Array.isArray(cv?.languages) ? [...(cv!.languages as any[])] : [];
          if (langs.length > 0) {
            langs[langs.length - 1].level = level;
            langs[langs.length - 1].isComplete = true;
          }
          if (cv) await this.cvService.updateCV(cv.id, { languages: langs });
          nextState = ConversationState.LANG_ADD_ANOTHER;
          await this.sendPromptForState(nextState, user, lang);
          break;
        }

        case ConversationState.LANG_ADD_ANOTHER: {
          if (
            message.includes('1') ||
            message.toLowerCase().includes('yes') ||
            message.toLowerCase().includes('ndio')
          ) {
            nextState = ConversationState.LANG_NAME;
          } else {
            if (cv?.references && Array.isArray(cv.references) && cv.references.length > 0) {
              await this.provider.sendMessage(user.phone, t(lang, 'updating'));
              nextState = ConversationState.AI_PROCESSING;
              runAITaskForSection = 'languages';
            } else {
              nextState = ConversationState.REF_NAME;
            }
          }
          await this.sendPromptForState(nextState, user, lang);
          break;
        }

        case ConversationState.REF_NAME: {
          if (!isNotEmpty(message)) {
            await this.provider.sendMessage(user.phone, t(lang, 'invalid_empty'));
            return;
          }
          const refs = Array.isArray(cv?.references) ? [...(cv!.references as any[])] : [];
          if (refs.length === 0 || refs[refs.length - 1].isComplete) {
            refs.push({ name: message });
          } else {
            refs[refs.length - 1].name = message;
          }
          if (cv) await this.cvService.updateCV(cv.id, { references: refs });
          nextState = ConversationState.REF_POSITION;
          await this.sendPromptForState(nextState, user, lang);
          break;
        }

        case ConversationState.REF_POSITION: {
          const refs = Array.isArray(cv?.references) ? [...(cv!.references as any[])] : [];
          if (refs.length > 0) refs[refs.length - 1].position = message;
          if (cv) await this.cvService.updateCV(cv.id, { references: refs });
          nextState = ConversationState.REF_COMPANY;
          await this.sendPromptForState(nextState, user, lang);
          break;
        }

        case ConversationState.REF_COMPANY: {
          const refs = Array.isArray(cv?.references) ? [...(cv!.references as any[])] : [];
          if (refs.length > 0) refs[refs.length - 1].company = message;
          if (cv) await this.cvService.updateCV(cv.id, { references: refs });
          nextState = ConversationState.REF_PHONE;
          await this.sendPromptForState(nextState, user, lang);
          break;
        }

        case ConversationState.REF_PHONE: {
          const refs = Array.isArray(cv?.references) ? [...(cv!.references as any[])] : [];
          if (refs.length > 0) refs[refs.length - 1].phone = message;
          if (cv) await this.cvService.updateCV(cv.id, { references: refs });
          nextState = ConversationState.REF_EMAIL;
          await this.sendPromptForState(nextState, user, lang);
          break;
        }

        case ConversationState.REF_EMAIL: {
          const refs = Array.isArray(cv?.references) ? [...(cv!.references as any[])] : [];
          if (refs.length > 0) {
            refs[refs.length - 1].email = message;
            refs[refs.length - 1].isComplete = true;
          }
          if (cv) await this.cvService.updateCV(cv.id, { references: refs });
          nextState = ConversationState.REF_ADD_ANOTHER;
          await this.sendPromptForState(nextState, user, lang);
          break;
        }

        case ConversationState.REF_ADD_ANOTHER: {
          if (
            message.includes('1') ||
            message.toLowerCase().includes('yes') ||
            message.toLowerCase().includes('ndio')
          ) {
            nextState = ConversationState.REF_NAME;
            await this.sendPromptForState(nextState, user, lang);
          } else {
            // Reached the end!
            const meta = typeof conversation.metadata === 'object' && conversation.metadata !== null ? { ...(conversation.metadata as object) } : {};
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((meta as any).isEnhanced) {
              nextState = ConversationState.CV_PREVIEW;
              const previewText = this.cvPreviewService.buildPreview(user, cv!);
              await this.provider.sendMessage(user.phone, previewText);
              await this.provider.sendMessage(user.phone, t(lang, 'preview_menu'));
            } else {
              await this.provider.sendMessage(user.phone, t(lang, 'processing'));
              nextState = ConversationState.AI_PROCESSING;
              runAITaskForSection = 'all';
              await this.sendPromptForState(nextState, user, lang);
            }
          }
          break;
        }

        case ConversationState.CV_PREVIEW:
          if (
            message.includes('1') ||
            message.toLowerCase().includes('generate') ||
            message.toLowerCase().includes('pdf')
          ) {
            await this.provider.sendMessage(user.phone, t(lang, 'generating_pdf'));
            nextState = ConversationState.PDF_READY;
            runPDFTask = true;
          } else if (message.includes('2') || message.toLowerCase().includes('edit')) {
            await this.provider.sendMessage(
              user.phone,
              t(lang, 'edit_menu')
            );
            nextState = ConversationState.EDIT_SECTION_SELECT;
          } else if (
            message.includes('3') ||
            message.toLowerCase().includes('start') ||
            message.toLowerCase().includes('over')
          ) {
            if (cv) await this.cvService.deleteCV(cv.id);
            const meta =
              typeof conversation.metadata === 'object' && conversation.metadata !== null
                ? { ...(conversation.metadata as object) }
                : {};
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            delete (meta as any).suspendedState;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await this.convService.updateConversation(conversation.id, { metadata: meta as any });
            await this.provider.sendMessage(
              user.phone,
              'Mchakato umeghairiwa. Umerudishwa mwanzo.'
            );
            await this.sendPromptForState(ConversationState.HOME, user, lang);
            nextState = ConversationState.HOME;
          } else if (message.includes('0') || message.toLowerCase().includes('main')) {
            await this.sendPromptForState(ConversationState.HOME, user, lang);
            nextState = ConversationState.HOME;
          } else {
            await this.provider.sendMessage(
              user.phone,
              t(lang, 'preview_menu')
            );
          }
          break;

        case ConversationState.EDIT_SECTION_SELECT:
          if (message.includes('1') || message.toLowerCase().includes('personal')) {
            await this.provider.sendMessage(
              user.phone,
              'Andika jina lako kamili upya (Mfano: John Doe).'
            );
            nextState = ConversationState.REGISTER_NAME;
          } else if (message.includes('2') || message.toLowerCase().includes('summary')) {
            await this.provider.sendMessage(
              user.phone,
              t(lang, 'ask_summary')
            );
            nextState = ConversationState.CV_SUMMARY;
          } else if (message.includes('3') || message.toLowerCase().includes('experience')) {
            if (cv) await this.cvService.updateCV(cv.id, { experience: [] });
            nextState = ConversationState.EXP_COMPANY;
            await this.sendPromptForState(nextState, user, lang);
          } else if (message.includes('4') || message.toLowerCase().includes('education')) {
            if (cv) await this.cvService.updateCV(cv.id, { education: [] });
            nextState = ConversationState.EDU_INSTITUTION;
            await this.sendPromptForState(nextState, user, lang);
          } else if (message.includes('5') || message.toLowerCase().includes('skills')) {
            nextState = ConversationState.CV_SKILLS;
            await this.sendPromptForState(nextState, user, lang);
          } else if (message.includes('6') || message.toLowerCase().includes('languages')) {
            if (cv) await this.cvService.updateCV(cv.id, { languages: [] });
            nextState = ConversationState.LANG_NAME;
            await this.sendPromptForState(nextState, user, lang);
          } else if (message.includes('7') || message.toLowerCase().includes('references')) {
            if (cv) await this.cvService.updateCV(cv.id, { references: [] });
            nextState = ConversationState.REF_NAME;
            await this.sendPromptForState(nextState, user, lang);
          } else if (message.includes('0') || message.toLowerCase().includes('cancel')) {
            const previewText = this.cvPreviewService.buildPreview(user, cv!);
            await this.provider.sendMessage(user.phone, previewText);
            await this.provider.sendMessage(
              user.phone,
              t(lang, 'preview_menu')
            );
            nextState = ConversationState.CV_PREVIEW;
          } else {
            await this.provider.sendMessage(
              user.phone,
              t(lang, 'edit_menu')
            );
            nextState = ConversationState.EDIT_SECTION_SELECT;
          }
          break;

        case ConversationState.PDF_READY:
          if (message.includes('1') || message.toLowerCase().includes('cv mpya')) {
            cv = await this.cvService.createCV({ userId: user.id });
            await this.provider.sendMessage(
              user.phone,
              t(lang, 'ask_job_title')
            );
            nextState = ConversationState.CV_JOB_TITLE;
          } else {
            await this.provider.sendMessage(
              user.phone,
              `CV yako ipo tayari. Kama unataka CV mpya chagua "1️⃣ Tengeneza CV Mpya" au rudi mwanzo.`
            );
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
            this.handleAIProcessing(user, conversation, activeCv, runAITaskForSection).catch((err) => {
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
            this.handlePDFGeneration(user, conversation, activeCv).catch((err) => {
              logger.error(`[FSM] Background PDF processing failed: ${err}`);
            });
          }
        } else {
          logger.warn(`[FSM] Cannot run PDF task, no active CV found for user ${user.id}`);
        }
      }
    } catch (error) {
      logger.error(
        `[FSM] Exception in processMessage for ${user?.phone}: ${error instanceof Error ? error.message : String(error)}`
      );
      await this.provider.sendMessage(
        user.phone,
        'Samahani, kumetokea hitilafu ya kiufundi. Tafadhali jaribu tena baadae.'
      );
    }
  }

  private getBackState(currentState: ConversationState, cv?: CV): ConversationState | null {
    const exps = Array.isArray(cv?.experience) ? (cv!.experience as any[]) : [];
    const lastExp = exps.length > 0 ? exps[exps.length - 1] : null;
    const isStillWorking = lastExp?.stillWorking === true;

    const map: Partial<Record<ConversationState, ConversationState>> = {
      [ConversationState.SELECT_LANGUAGE]: ConversationState.WELCOME,
      [ConversationState.REGISTER_NAME]: ConversationState.SELECT_LANGUAGE,
      [ConversationState.REGISTER_EMAIL]: ConversationState.REGISTER_NAME,
      [ConversationState.CV_JOB_TITLE]: ConversationState.HOME,
      [ConversationState.CV_SUMMARY]: ConversationState.CV_JOB_TITLE,

      // Experience
      [ConversationState.EXP_COMPANY]: ConversationState.CV_SUMMARY,
      [ConversationState.EXP_JOB_TITLE]: ConversationState.EXP_COMPANY,
      [ConversationState.EXP_LOCATION]: ConversationState.EXP_JOB_TITLE,
      [ConversationState.EXP_TYPE]: ConversationState.EXP_LOCATION,
      [ConversationState.EXP_START_MONTH]: ConversationState.EXP_TYPE,
      [ConversationState.EXP_START_YEAR]: ConversationState.EXP_START_MONTH,
      [ConversationState.EXP_STILL_WORKING]: ConversationState.EXP_START_YEAR,
      [ConversationState.EXP_END_MONTH]: ConversationState.EXP_STILL_WORKING,
      [ConversationState.EXP_END_YEAR]: ConversationState.EXP_END_MONTH,
      [ConversationState.EXP_RESPONSIBILITIES]: isStillWorking
        ? ConversationState.EXP_STILL_WORKING
        : ConversationState.EXP_END_YEAR,
      [ConversationState.EXP_ACHIEVEMENTS]: ConversationState.EXP_RESPONSIBILITIES,
      [ConversationState.EXP_ADD_ANOTHER]: ConversationState.EXP_ACHIEVEMENTS,

      // Education
      [ConversationState.EDU_INSTITUTION]: ConversationState.EXP_ADD_ANOTHER,
      [ConversationState.EDU_QUALIFICATION]: ConversationState.EDU_INSTITUTION,
      [ConversationState.EDU_FIELD]: ConversationState.EDU_QUALIFICATION,
      [ConversationState.EDU_START_YEAR]: ConversationState.EDU_FIELD,
      [ConversationState.EDU_GRAD_YEAR]: ConversationState.EDU_START_YEAR,
      [ConversationState.EDU_GPA]: ConversationState.EDU_GRAD_YEAR,
      [ConversationState.EDU_ADD_ANOTHER]: ConversationState.EDU_GPA,

      // Skills
      [ConversationState.CV_SKILLS]: ConversationState.EDU_ADD_ANOTHER,

      // Languages
      [ConversationState.LANG_NAME]: ConversationState.CV_SKILLS,
      [ConversationState.LANG_LEVEL]: ConversationState.LANG_NAME,
      [ConversationState.LANG_ADD_ANOTHER]: ConversationState.LANG_LEVEL,

      // References
      [ConversationState.REF_NAME]: ConversationState.LANG_ADD_ANOTHER,
      [ConversationState.REF_POSITION]: ConversationState.REF_NAME,
      [ConversationState.REF_COMPANY]: ConversationState.REF_POSITION,
      [ConversationState.REF_PHONE]: ConversationState.REF_COMPANY,
      [ConversationState.REF_EMAIL]: ConversationState.REF_PHONE,
      [ConversationState.REF_ADD_ANOTHER]: ConversationState.REF_EMAIL,

      [ConversationState.CV_PREVIEW]: ConversationState.REF_ADD_ANOTHER,
      [ConversationState.EDIT_SECTION_SELECT]: ConversationState.CV_PREVIEW,
    };
    return map[currentState] || null;
  }

  private async sendPromptForState(state: ConversationState, user: User, lang: string = 'sw') {
    switch (state) {
      case ConversationState.WELCOME:
        await this.provider.sendMessage(
          user.phone,
          t(lang, 'welcome')
        );
        break;
      case ConversationState.SELECT_LANGUAGE:
        await this.provider.sendMessage(
          user.phone,
          t(lang, 'welcome')
        );
        break;
      case ConversationState.REGISTER_NAME:
        await this.provider.sendMessage(
          user.phone,
          'Tafadhali andika majina yako kamili (Full Name).'
        );
        break;
      case ConversationState.REGISTER_EMAIL:
        await this.provider.sendMessage(user.phone, `Tafadhali weka barua pepe (email) yako.`);
        break;
      case ConversationState.HOME:
        await this.provider.sendInteractiveMessage(user.phone, 'Chagua huduma:', [
          '1️⃣ Tengeneza CV Mpya',
          '2️⃣ Rekebisha CV',
          '3️⃣ My Account',
          '4️⃣ Help',
        ]);
        break;
      case ConversationState.CV_JOB_TITLE:
        await this.provider.sendMessage(
          user.phone,
          t(lang, 'ask_job_title')
        );
        break;
      case ConversationState.CV_SUMMARY:
        await this.provider.sendMessage(
          user.phone,
          t(lang, 'ask_summary')
        );
        break;

      // Experience
      case ConversationState.EXP_COMPANY:
        await this.provider.sendMessage(user.phone, t(lang, 'ask_company'));
        break;
      case ConversationState.EXP_JOB_TITLE:
        await this.provider.sendMessage(user.phone, t(lang, 'ask_exp_job_title'));
        break;
      case ConversationState.EXP_LOCATION:
        await this.provider.sendMessage(
          user.phone,
          t(lang, 'ask_location')
        );
        break;
      case ConversationState.EXP_TYPE:
        await this.provider.sendMessage(
          user.phone,
          t(lang, 'ask_exp_type')
        );
        break;
      case ConversationState.EXP_START_MONTH:
        await this.provider.sendMessage(user.phone, t(lang, 'ask_start_month'));
        break;
      case ConversationState.EXP_START_YEAR:
        await this.provider.sendMessage(user.phone, 'Start Year (e.g., 2020)');
        break;
      case ConversationState.EXP_STILL_WORKING:
        await this.provider.sendMessage(user.phone, 'Still working here?\n1️⃣ Yes\n2️⃣ No');
        break;
      case ConversationState.EXP_END_MONTH:
        await this.provider.sendMessage(user.phone, t(lang, 'ask_end_month'));
        break;
      case ConversationState.EXP_END_YEAR:
        await this.provider.sendMessage(user.phone, t(lang, 'ask_end_year'));
        break;
      case ConversationState.EXP_RESPONSIBILITIES:
        await this.provider.sendMessage(
          user.phone,
          t(lang, 'ask_responsibilities')
        );
        break;
      case ConversationState.EXP_ACHIEVEMENTS:
        await this.provider.sendMessage(
          user.phone,
          t(lang, 'ask_achievements')
        );
        break;
      case ConversationState.EXP_ADD_ANOTHER:
        await this.provider.sendMessage(
          user.phone,
          'Do you want to add another work experience?\n1️⃣ Yes\n2️⃣ No'
        );
        break;

      // Education
      case ConversationState.EDU_INSTITUTION:
        await this.provider.sendMessage(user.phone, t(lang, 'ask_institution'));
        break;
      case ConversationState.EDU_QUALIFICATION:
        await this.provider.sendMessage(
          user.phone,
          'Qualification\nExamples:\nBachelor Degree\nDiploma\nCertificate\nMaster\nPhD'
        );
        break;
      case ConversationState.EDU_FIELD:
        await this.provider.sendMessage(user.phone, t(lang, 'ask_field'));
        break;
      case ConversationState.EDU_START_YEAR:
        await this.provider.sendMessage(user.phone, t(lang, 'ask_start_year'));
        break;
      case ConversationState.EDU_GRAD_YEAR:
        await this.provider.sendMessage(user.phone, t(lang, 'ask_grad_year'));
        break;
      case ConversationState.EDU_GPA:
        await this.provider.sendMessage(user.phone, t(lang, 'ask_gpa'));
        break;
      case ConversationState.EDU_ADD_ANOTHER:
        await this.provider.sendMessage(
          user.phone,
          t(lang, 'ask_add_another_edu')
        );
        break;

      // Skills
      case ConversationState.CV_SKILLS:
        await this.provider.sendMessage(
          user.phone,
          t(lang, 'ask_skills')
        );
        break;

      // Languages
      case ConversationState.LANG_NAME:
        await this.provider.sendMessage(user.phone, 'Language Name (e.g., English, Swahili)');
        break;
      case ConversationState.LANG_LEVEL:
        await this.provider.sendMessage(
          user.phone,
          'Level\nChoose:\n1️⃣ Native\n2️⃣ Fluent\n3️⃣ Intermediate\n4️⃣ Basic'
        );
        break;
      case ConversationState.LANG_ADD_ANOTHER:
        await this.provider.sendMessage(
          user.phone,
          t(lang, 'ask_add_another_lang')
        );
        break;

      // References
      case ConversationState.REF_NAME:
        await this.provider.sendMessage(user.phone, 'Full Name');
        break;
      case ConversationState.REF_POSITION:
        await this.provider.sendMessage(user.phone, 'Position');
        break;
      case ConversationState.REF_COMPANY:
        await this.provider.sendMessage(user.phone, 'Company');
        break;
      case ConversationState.REF_PHONE:
        await this.provider.sendMessage(user.phone, 'Phone Number');
        break;
      case ConversationState.REF_EMAIL:
        await this.provider.sendMessage(user.phone, 'Email');
        break;
      case ConversationState.REF_ADD_ANOTHER:
        await this.provider.sendMessage(user.phone, 'Add another reference?\n1️⃣ Yes\n2️⃣ No');
        break;

      case ConversationState.CV_PREVIEW:
        await this.provider.sendInteractiveMessage(user.phone, 'Je, unathibitisha CV hii?', [
          '1️⃣ Confirm',
          '2️⃣ Edit',
          '3️⃣ Start Over',
        ]);
        break;
      case ConversationState.EDIT_SECTION_SELECT:
        await this.provider.sendInteractiveMessage(
          user.phone,
          'Je, ungependa kurekebisha sehemu gani?\n1️⃣ Summary\n2️⃣ Experience\n3️⃣ Skills\n4️⃣ Education\n5️⃣ Languages\n6️⃣ References',
          ['1️⃣ Summary', '2️⃣ Experience', '3️⃣ Skills']
        );
        break;
      default:
        await this.provider.sendMessage(user.phone, t(lang, 'continue_prompt'));
        break;
    }
  }

  private async handleAIProcessing(user: User, conversation: Conversation, cv: CV, section: string) {
    try {
      const startTime = Date.now();
      logger.info(`[FSM] Starting AI Processing for CV ${cv.id} section ${section}`);
      const metaDataObj = typeof conversation.metadata === 'object' && conversation.metadata !== null ? conversation.metadata : {};
      const lang = (metaDataObj as any).lang || 'sw';

      const structuredData: any = {};
      if (section === 'all' || section === 'summary') structuredData.professionalSummary = cv.professionalSummary;
      if (section === 'all' || section === 'experience') structuredData.experience = cv.experience;
      if (section === 'all' || section === 'skills') structuredData.skills = cv.skills;
      if (section === 'all' || section === 'languages') structuredData.languages = cv.languages;

      let updatedCv = cv;
      if (Object.keys(structuredData).length > 0) {
        const enhancedData = await this.geminiService.enhanceCV(structuredData);

        updatedCv = await this.cvService.updateCV(cv.id, {
          professionalSummary: enhancedData.professionalSummary || undefined,
          experience: enhancedData.experience || undefined,
          skills: enhancedData.skills || undefined,
          languages: enhancedData.languages || undefined,
        });
      }

      const meta =
        typeof conversation.metadata === 'object' && conversation.metadata !== null
          ? { ...(conversation.metadata as object) }
          : {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (meta as any).isEnhanced = true;

      const previewText = this.cvPreviewService.buildPreview(user, updatedCv);
      await this.provider.sendMessage(user.phone, previewText);
      await this.provider.sendMessage(
        user.phone,
        t(lang, 'preview_menu')
      );

      await this.convService.updateConversation(conversation.id, {
        currentState: ConversationState.CV_PREVIEW,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        metadata: meta as any,
      });
      logger.info(
        `[FSM] AI Processing completed in ${Date.now() - startTime}ms, transitioned to CV_PREVIEW`
      );
    } catch (error) {
      logger.error(
        `[FSM] AI Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      await this.provider.sendMessage(
        user.phone,
        'We encountered a small problem while preparing your preview.\n\nYour CV is safe.\n\nPlease try again.'
      );

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
        await this.provider.sendMessage(
          user.phone,
          `CV yako ipo tayari! Unaweza kuipakua hapa: ${downloadLink}`
        );
      } else {
        await this.provider.sendMessage(
          user.phone,
          'Samahani, kumetokea hitilafu wakati wa kutengeneza PDF. Tafadhali jaribu tena. Chagua 1 (Confirm) au 2 (Edit).'
        );
        await this.convService.updateConversation(conversation.id, {
          currentState: ConversationState.CV_PREVIEW,
        });
      }
    } catch (error) {
      logger.error(
        `[FSM] PDF generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      await this.provider.sendMessage(
        user.phone,
        'Samahani, kumetokea hitilafu wakati wa kutengeneza PDF. Tafadhali jaribu tena. Chagua 1 (Confirm) au 2 (Edit).'
      );
      await this.convService.updateConversation(conversation.id, {
        currentState: ConversationState.CV_PREVIEW,
      });
    }
  }
}
