import { Test } from '@nestjs/testing';
import { AuditLogService } from './audit-log.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    prisma = {
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as jest.Mocked<PrismaService>;

    const module = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(AuditLogService);
  });

  it('calls prisma.auditLog.create with correct data', async () => {
    await service.log({
      tableName: 'periods',
      recordId: BigInt(1),
      action: 'period_opened',
      newData: { objectId: 5 },
      performedBy: 42,
      organizationId: 'org-uuid',
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        tableName: 'periods',
        recordId: BigInt(1),
        action: 'period_opened',
        oldData: undefined,
        newData: { objectId: 5 },
        reason: undefined,
        performedBy: 42,
        organizationId: 'org-uuid',
      },
    });
  });

  it('does not expose update or delete methods', () => {
    expect((service as unknown as Record<string, unknown>).update).toBeUndefined();
    expect((service as unknown as Record<string, unknown>).delete).toBeUndefined();
  });
});
