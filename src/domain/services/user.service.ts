import { IUserRepository } from '../../domain/repositories/user.repository.interface.js';
import { IConversationRepository } from '../../domain/repositories/conversation.repository.interface.js';
import { ConversationState } from '../../conversation/fsm/states.js';
import { User, Conversation } from '@prisma/client';

export class UserService {
  constructor(
    private userRepo: IUserRepository,
    private convRepo: IConversationRepository
  ) {}

  async getOrCreateUser(phone: string, name?: string): Promise<{ user: User; conversation: Conversation }> {
    let user = await this.userRepo.findByPhone(phone);
    
    if (!user) {
      user = await this.userRepo.create({ phone, fullName: name || null, email: null });
    }

    let conversation = await this.convRepo.findByUserId(user.id);
    
    if (!conversation) {
      conversation = await this.convRepo.create({
        userId: user.id,
        currentState: ConversationState.WELCOME,
        lastMessage: null,
        metadata: {},
      });
    }

    return { user, conversation };
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    return this.userRepo.update(id, data);
  }
}
