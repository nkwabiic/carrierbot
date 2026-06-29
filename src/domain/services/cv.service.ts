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
    const cvs = await this.cvRepo.findByUserId(userId);
    return cvs.length > 0 ? cvs[cvs.length - 1] : null;
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
