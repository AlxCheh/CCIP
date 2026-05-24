import { Test } from '@nestjs/testing';
import { DisputeFlagService } from '../dispute-flag.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

const mockPrisma = {
  systemConfig:  { findUnique: jest.fn() },
  discrepancy:   { count: jest.fn() },
  periodFact:    { aggregate: jest.fn() },
  notification:  { createMany: jest.fn() },
  user:          { findMany: jest.fn() },
  period:        { findUniqueOrThrow: jest.fn(), findMany: jest.fn() },
};

const orgId = 'org-uuid';

describe('DisputeFlagService', () => {
  let service: DisputeFlagService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        DisputeFlagService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(DisputeFlagService);
  });

  function setupConfig(nFlag = 3, mWindow = 5) {
    mockPrisma.systemConfig.findUnique
      .mockImplementation(({ where }: { where: { organizationId_key: { key: string } } }) => {
        if (where.organizationId_key.key === 'N_flag_threshold') return Promise.resolve({ valueNumeric: nFlag });
        if (where.organizationId_key.key === 'M_flag_window')    return Promise.resolve({ valueNumeric: mWindow });
        return Promise.resolve(null);
      });
  }

  it('does NOT flag when type2 count is below threshold', async () => {
    setupConfig(3, 5);
    mockPrisma.period.findUniqueOrThrow.mockResolvedValue({ objectId: 1, periodNumber: 10 });
    mockPrisma.period.findMany.mockResolvedValue([{ id: 8 }, { id: 9 }, { id: 10 }, { id: 11 }, { id: 12 }]);
    mockPrisma.discrepancy.count.mockResolvedValue(2);  // < 3

    await service.detectSystemicFlag(1, 7, orgId);

    expect(mockPrisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('flags when type2 count meets threshold', async () => {
    setupConfig(3, 5);
    mockPrisma.period.findUniqueOrThrow.mockResolvedValue({ objectId: 1, periodNumber: 10 });
    mockPrisma.period.findMany.mockResolvedValue([{ id: 8 }, { id: 9 }, { id: 10 }, { id: 11 }, { id: 12 }]);
    mockPrisma.discrepancy.count.mockResolvedValue(3);  // >= 3
    mockPrisma.user.findMany.mockResolvedValue([{ id: 20 }]);
    mockPrisma.periodFact.aggregate.mockResolvedValue({ _sum: { scVolume: 150 } });

    await service.detectSystemicFlag(1, 7, orgId);

    expect(mockPrisma.notification.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ userId: 20, type: 'systemic_dispute_flag' }),
      ]),
    });
  });

  it('uses default threshold (3) and window (5) when SystemConfig not set', async () => {
    mockPrisma.systemConfig.findUnique.mockResolvedValue(null);
    mockPrisma.period.findUniqueOrThrow.mockResolvedValue({ objectId: 1, periodNumber: 10 });
    mockPrisma.period.findMany.mockResolvedValue([{ id: 8 }, { id: 9 }, { id: 10 }, { id: 11 }, { id: 12 }]);
    mockPrisma.discrepancy.count.mockResolvedValue(3);
    mockPrisma.user.findMany.mockResolvedValue([{ id: 21 }]);
    mockPrisma.periodFact.aggregate.mockResolvedValue({ _sum: { scVolume: 90 } });

    await service.detectSystemicFlag(1, 7, orgId);

    expect(mockPrisma.notification.createMany).toHaveBeenCalled();
  });
});
