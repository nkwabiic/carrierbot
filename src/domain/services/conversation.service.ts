import { IConversationRepository } from '../../domain/repositories/conversation.repository.interface.js';
import { Conversation } from '@prisma/client';

export class ConversationService {
  constructor(private readonly conversationRepo: IConversationRepository) {}

  async getConversationById(id: string): Promise<Conversation | null> {
    return this.conversationRepo.findById(id);
  }

  async getConversationByUserId(userId: string): Promise<Conversation | null> {
    return this.conversationRepo.findByUserId(userId);
  }

  async getAllConversations(): Promise<Conversation[]> {
    return this.conversationRepo.findAll();
  }

  async createConversation(data: Omit<Conversation, 'id' | 'createdAt' | 'updatedAt'>): Promise<Conversation> {
    return this.conversationRepo.create(data);
  }

  async updateConversation(id: string, data: Partial<Conversation>): Promise<Conversation> {
    return this.conversationRepo.update(id, data);
  }

  async deleteConversation(id: string): Promise<boolean> {
    return this.conversationRepo.delete(id);
  }
}
