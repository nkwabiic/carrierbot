import { Conversation } from '@prisma/client';
import { IRepository } from './repository.interface.js';

export interface IConversationRepository extends IRepository<Conversation> {
  findByUserId(userId: string): Promise<Conversation | null>;
}
