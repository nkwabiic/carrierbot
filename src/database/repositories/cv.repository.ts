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

  async findLatestCV(userId: string): Promise<CV | null> {
    return prisma.cV.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async savePdfPath(id: string, path: string): Promise<CV> {
    return prisma.cV.update({
      where: { id },
      data: { pdfUrl: path },
    });
  }

  async updateEnhancedContent(id: string, data: { professionalSummary?: string; experience?: string; skills?: string }): Promise<CV> {
    return prisma.cV.update({
      where: { id },
      data,
    });
  }

  async findAll(): Promise<CV[]> {
    return prisma.cV.findMany();
  }

  async create(data: Partial<CV>): Promise<CV> {
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
