import { User } from '@prisma/client';
import { IRepository } from './repository.interface.js';

export interface IUserRepository extends IRepository<User> {
  findByPhone(phone: string): Promise<User | null>;
}
