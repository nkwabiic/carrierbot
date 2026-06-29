import { User, Prisma } from '@prisma/client';
import { IUserRepository } from '../../domain/repositories/user.repository.interface.js';
import { prisma } from '../prisma/prisma.js';

export class UserRepository implements IUserRepository {
  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  async findByPhone(phone: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { phone } });
  }

  async findAll(): Promise<User[]> {
    return prisma.user.findMany();
  }

  async create(data: Partial<User>): Promise<User> {
    return prisma.user.create({ data: data as Prisma.UserUncheckedCreateInput });
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    return prisma.user.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<boolean> {
    await prisma.user.delete({ where: { id } });
    return true;
  }
}
