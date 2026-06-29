import { ConversationState, ConversationFlow } from './states.js';
import { User, Conversation } from '@prisma/client';
import { IWhatsAppProvider } from '../interfaces/whatsapp.interface.js';
import { ConversationRepository } from '../repositories/conversation.repository.js';
import { logger } from '../utils/logger.js';

export class FiniteStateMachine {
  constructor(
    private provider: IWhatsAppProvider,
    private convRepo: ConversationRepository
  ) {}

  async processMessage(user: User, conversation: Conversation, message: string) {
    logger.info(`Processing message from ${user.phone} in state ${conversation.currentState}`);
    
    // Simple state machine logic
    let nextState = conversation.currentState;
    let nextFlow = conversation.currentFlow;
    
    switch (conversation.currentState) {
      case ConversationState.WELCOME:
        await this.provider.sendMessage(user.phone, 'Karibu CareerBot Tanzania! Je, jina lako nani?');
        nextState = ConversationState.REGISTER_NAME;
        break;
      
      case ConversationState.REGISTER_NAME:
        await this.provider.sendMessage(user.phone, `Asante ${message}. Tafadhali weka barua pepe (email) yako.`);
        nextState = ConversationState.REGISTER_EMAIL;
        break;

      case ConversationState.REGISTER_EMAIL:
        await this.provider.sendInteractiveMessage(
          user.phone, 
          'Asante! Umesajiliwa kikamilifu. Chagua huduma:', 
          ['1️⃣ Tengeneza CV Mpya', '2️⃣ Rekebisha CV', '3️⃣ My Account', '4️⃣ Help']
        );
        nextState = ConversationState.HOME;
        nextFlow = ConversationFlow.MAIN_MENU;
        break;

      case ConversationState.HOME:
        if (message.includes('1') || message.toLowerCase().includes('cv mpya')) {
          await this.provider.sendMessage(user.phone, 'Sawa, tuanze kutengeneza CV. Je, unatafuta kazi gani? (Mfano: Mhasibu, Mwalimu)');
          nextState = ConversationState.CV_JOB_TITLE;
          nextFlow = ConversationFlow.CREATE_CV;
        } else {
          await this.provider.sendMessage(user.phone, 'Samahani, huduma hii bado inatengenezwa. Tafadhali chagua "1️⃣ Tengeneza CV Mpya".');
        }
        break;
        
      case ConversationState.CV_JOB_TITLE:
        await this.provider.sendMessage(user.phone, 'Andika maelezo mafupi (Professional Summary) kukuhusu.');
        nextState = ConversationState.CV_SUMMARY;
        break;

      // Add other states logically...
      default:
        await this.provider.sendMessage(user.phone, 'Samahani, sikuelewa. Tutarudi mwanzo.');
        nextState = ConversationState.HOME;
        break;
    }

    await this.convRepo.update(conversation.id, {
      currentState: nextState,
      currentFlow: nextFlow,
      lastInteraction: new Date(),
    });
  }
}
