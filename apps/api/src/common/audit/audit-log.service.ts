import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditLogParams {
  tableName: string;
  recordId: bigint;
  action: string;
  oldData?: unknown;
  newData?: unknown;
  reason?: string;
  performedBy?: number;
  organizationId: string;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: AuditLogParams): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        tableName: params.tableName,
        recordId: params.recordId,
        action: params.action,
        oldData: params.oldData as object | undefined,
        newData: params.newData as object | undefined,
        reason: params.reason,
        performedBy: params.performedBy,
        organizationId: params.organizationId,
      },
    });
  }
}
