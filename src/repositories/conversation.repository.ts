import { Conversation } from '@prisma/client';
import { IRepository } from '../interfaces/repository.interface.js';
import { prisma } from '../database/prisma.js';

export class ConversationRepository implements IRepository<Conversation> {
  async findById(id: string): Promise<Conversation | null> {
    return prisma.conversation.findUnique({ where: { id } });
  }

  async findByUserId(userId: string): Promise<Conversation | null> {
    return prisma.conversation.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findAll(): Promise<Conversation[]> {
    return prisma.conversation.findMany();
  }

  async create(data: Omit<Conversation, 'id' | 'createdAt' | 'updatedAt'>): Promise<Conversation> {
    // Explicit type cast for Prisma Json fields or let Prisma handle it
    return prisma.conversation.create({ data: data as any });
  }

  async update(id: string, data: Partial<Conversation>): Promise<Conversation> {
    return prisma.conversation.update({
      where: { id },
      data: data as any,
    });
  }

  async delete(id: string): Promise<boolean> {
    await prisma.conversation.delete({ where: { id } });
    return true;
  }
}
