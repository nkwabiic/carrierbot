import { AuditLog } from '@prisma/client';
import { IRepository } from '../interfaces/repository.interface.js';
import { prisma } from '../database/prisma.js';

export class AuditLogRepository implements IRepository<AuditLog> {
  async findById(id: string): Promise<AuditLog | null> {
    return prisma.auditLog.findUnique({ where: { id } });
  }

  async findAll(): Promise<AuditLog[]> {
    return prisma.auditLog.findMany({ orderBy: { timestamp: 'desc' } });
  }

  async create(data: Omit<AuditLog, 'id' | 'timestamp'>): Promise<AuditLog> {
    return prisma.auditLog.create({ data: data as any });
  }

  async update(id: string, data: Partial<AuditLog>): Promise<AuditLog> {
    return prisma.auditLog.update({
      where: { id },
      data: data as any,
    });
  }

  async delete(id: string): Promise<boolean> {
    await prisma.auditLog.delete({ where: { id } });
    return true;
  }
}
