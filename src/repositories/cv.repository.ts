import { CV } from '@prisma/client';
import { IRepository } from '../interfaces/repository.interface.js';
import { prisma } from '../database/prisma.js';

export class CVRepository implements IRepository<CV> {
  async findById(id: string): Promise<CV | null> {
    return prisma.cV.findUnique({ where: { id } });
  }

  async findByUserId(userId: string): Promise<CV[]> {
    return prisma.cV.findMany({ where: { userId } });
  }

  async findAll(): Promise<CV[]> {
    return prisma.cV.findMany();
  }

  async create(data: Omit<CV, 'id' | 'createdAt' | 'updatedAt'>): Promise<CV> {
    return prisma.cV.create({ data: data as any });
  }

  async update(id: string, data: Partial<CV>): Promise<CV> {
    return prisma.cV.update({
      where: { id },
      data: data as any,
    });
  }

  async delete(id: string): Promise<boolean> {
    await prisma.cV.delete({ where: { id } });
    return true;
  }
}
