import { CV } from '@prisma/client';
import { IRepository } from './repository.interface.js';

export interface ICVRepository extends IRepository<CV> {
  findByUserId(userId: string): Promise<CV[]>;
}
