import { ConversationState } from './states.js';
import { User, Conversation } from '@prisma/client';
import { IWhatsAppProvider } from '../../whatsapp/whatsapp.interface.js';
import { ConversationService } from '../../domain/services/conversation.service.js';
import { UserService } from '../../domain/services/user.service.js';
import { CVService } from '../../domain/services/cv.service.js';
import { logger } from '../../utils/logger.js';

export class FiniteStateMachine {
  constructor(
    private provider: IWhatsAppProvider,
    private convService: ConversationService,
    private userService: UserService,
    private cvService: CVService
  ) {}

  async processMessage(user: User, conversation: Conversation, message: string) {
    logger.info(`[FSM] Processing message from ${user.phone} in state ${conversation.currentState}`);
    
    let nextState = conversation.currentState as ConversationState;
    let cv = await this.cvService.getActiveCVForUser(user.id);
    
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
        await this.provider.sendMessage(user.phone, 'Tafadhali orodhesha elimu yako.');
        nextState = ConversationState.CV_EDUCATION;
        break;

      case ConversationState.CV_EDUCATION:
        if (cv) await this.cvService.updateCV(cv.id, { education: message }); 
        await this.provider.sendMessage(user.phone, 'Tafadhali orodhesha uzoefu wako wa kazi.');
        nextState = ConversationState.CV_EXPERIENCE;
        break;

      case ConversationState.CV_EXPERIENCE:
        if (cv) await this.cvService.updateCV(cv.id, { experience: message });
        await this.provider.sendMessage(user.phone, 'Tafadhali orodhesha ujuzi (skills) wako.');
        nextState = ConversationState.CV_SKILLS;
        break;

      case ConversationState.CV_SKILLS:
        if (cv) await this.cvService.updateCV(cv.id, { skills: message });
        await this.provider.sendMessage(user.phone, 'Tafadhali orodhesha lugha unazozungumza.');
        nextState = ConversationState.CV_LANGUAGES;
        break;

      case ConversationState.CV_LANGUAGES:
        if (cv) await this.cvService.updateCV(cv.id, { languages: message });
        await this.provider.sendMessage(user.phone, 'Tafadhali weka wadhamini (references) wako.');
        nextState = ConversationState.CV_REFERENCES;
        break;

      case ConversationState.CV_REFERENCES:
        if (cv) await this.cvService.updateCV(cv.id, { references: message });
        await this.provider.sendMessage(user.phone, 'Asante! Tunatengeneza CV yako sasa...');
        nextState = ConversationState.AI_PROCESSING;
        break;

      case ConversationState.AI_PROCESSING:
        await this.provider.sendMessage(user.phone, 'Tafadhali subiri, AI inachakata CV yako...');
        break;

      case ConversationState.CV_PREVIEW:
        await this.provider.sendMessage(user.phone, 'Hapa kuna hakikisho la CV yako. Je, inafaa?');
        break;

      case ConversationState.PDF_READY:
        await this.provider.sendMessage(user.phone, 'CV yako ipo tayari. Pakua hapa: [LINK]');
        break;

      default:
        await this.provider.sendMessage(user.phone, 'Samahani, sikuelewa. Tutarudi mwanzo.');
        nextState = ConversationState.HOME;
        break;
    }

    await this.convService.updateConversation(conversation.id, {
      currentState: nextState,
      lastMessage: message,
    });
    
    logger.info(`[FSM] Transitioned ${user.phone} to state ${nextState}`);
  }
}
