import { CV } from '@prisma/client';
import { IRepository } from './repository.interface.js';

export interface ICVRepository extends IRepository<CV> {
  findByUserId(userId: string): Promise<CV[]>;
  findLatestCV(userId: string): Promise<CV | null>;
  savePdfPath(id: string, path: string): Promise<CV>;
  updateEnhancedContent(id: string, data: { professionalSummary?: string; experience?: string; skills?: string }): Promise<CV>;
}
