import { UserRepository } from '../repositories/user.repository.js';
import { ConversationRepository } from '../repositories/conversation.repository.js';
import { ConversationState, ConversationFlow } from '../conversation/states.js';
import { User, Conversation } from '@prisma/client';

export class UserService {
  constructor(
    private userRepo: UserRepository,
    private convRepo: ConversationRepository
  ) {}

  async getOrCreateUser(phone: string, name?: string): Promise<{ user: User; conversation: Conversation }> {
    let user = await this.userRepo.findByPhone(phone);
    
    if (!user) {
      user = await this.userRepo.create({ phone, name: name || null, email: null, language: 'sw', isBlocked: false });
    }

    let conversation = await this.convRepo.findByUserId(user.id);
    
    if (!conversation) {
      conversation = await this.convRepo.create({
        userId: user.id,
        currentState: ConversationState.WELCOME,
        currentFlow: ConversationFlow.ONBOARDING,
        sessionData: {},
        retryCount: 0,
        lastInteraction: new Date(),
      });
    }

    return { user, conversation };
  }
}
