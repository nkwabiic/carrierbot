import { CV, Prisma } from '@prisma/client';
import { ICVRepository } from '../../domain/repositories/cv.repository.interface.js';
import { prisma } from '../prisma/prisma.js';

export class CVRepository implements ICVRepository {
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
    return prisma.cV.create({ data: data as Prisma.CVUncheckedCreateInput });
  }

  async update(id: string, data: Partial<CV>): Promise<CV> {
    return prisma.cV.update({
      where: { id },
      data: data as Prisma.CVUncheckedUpdateInput,
    });
  }

  async delete(id: string): Promise<boolean> {
    await prisma.cV.delete({ where: { id } });
    return true;
  }
}
