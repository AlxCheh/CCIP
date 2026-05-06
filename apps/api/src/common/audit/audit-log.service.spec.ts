import { Test } from '@nestjs/testing';
import { AuditLogService } from './audit-log.service';
import { PrismaService } from '../prisma/prisma.service';

const BASE_PARAMS = {
  tableName: 'periods',
  recordId: BigInt(1),
  action: 'period_opened',
  performedBy: 42,
  organizationId: 'org-uuid',
};

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
    await service.log({ ...BASE_PARAMS, newData: { objectId: 5 } });

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

  it('passes oldData and newData when both are provided', async () => {
    await service.log({
      ...BASE_PARAMS,
      action: 'period_updated',
      oldData: { status: 'open' },
      newData: { status: 'closed' },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        oldData: { status: 'open' },
        newData: { status: 'closed' },
      }),
    });
  });

  it('passes reason when provided', async () => {
    await service.log({
      ...BASE_PARAMS,
      reason: 'Плановое закрытие периода',
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ reason: 'Плановое закрытие периода' }),
    });
  });

  it('propagates Prisma error without catching it', async () => {
    (prisma.auditLog.create as jest.Mock).mockRejectedValue(
      new Error('DB connection lost'),
    );

    await expect(service.log(BASE_PARAMS)).rejects.toThrow('DB connection lost');
  });

  it('returns void on success', async () => {
    const result = await service.log(BASE_PARAMS);
    expect(result).toBeUndefined();
  });

  it('does not expose update or delete methods', () => {
    expect((service as unknown as Record<string, unknown>).update).toBeUndefined();
    expect((service as unknown as Record<string, unknown>).delete).toBeUndefined();
  });
});
