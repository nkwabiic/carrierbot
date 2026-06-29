import { ICVRepository } from '../../domain/repositories/cv.repository.interface.js';
import { CV } from '@prisma/client';

export class CVService {
  constructor(private readonly cvRepo: ICVRepository) {}

  async getCVById(id: string): Promise<CV | null> {
    return this.cvRepo.findById(id);
  }

  async getCVsByUserId(userId: string): Promise<CV[]> {
    return this.cvRepo.findByUserId(userId);
  }

  async getActiveCVForUser(userId: string): Promise<CV | null> {
    return this.cvRepo.findLatestCV(userId);
  }

  async savePdfPath(id: string, path: string): Promise<CV> {
    return this.cvRepo.savePdfPath(id, path);
  }

  async updateEnhancedContent(id: string, data: { professionalSummary?: string; experience?: string; skills?: string }): Promise<CV> {
    return this.cvRepo.updateEnhancedContent(id, data);
  }

  async getAllCVs(): Promise<CV[]> {
    return this.cvRepo.findAll();
  }

  async createCV(data: Partial<CV>): Promise<CV> {
    return this.cvRepo.create(data);
  }

  async updateCV(id: string, data: Partial<CV>): Promise<CV> {
    return this.cvRepo.update(id, data);
  }

  async deleteCV(id: string): Promise<boolean> {
    return this.cvRepo.delete(id);
  }
}
