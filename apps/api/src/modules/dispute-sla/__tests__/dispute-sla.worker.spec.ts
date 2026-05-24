import { Test } from '@nestjs/testing';
import { DisputeSlaWorker } from '../dispute-sla.worker';
import { DisputeSlaService } from '../dispute-sla.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Job } from 'bullmq';

const mockPrisma = {
  slaEvent:    { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  discrepancy: { findFirst: jest.fn(), update: jest.fn() },
  periodFact:  { update: jest.fn() },
  period:      { findUniqueOrThrow: jest.fn() },
  user:        { findMany: jest.fn() },
  notification:{ createMany: jest.fn() },
  $transaction: jest.fn((fn) => fn(mockPrisma)),
};
const mockDisputeSlaService = { recoverPending: jest.fn().mockResolvedValue(0) };

function makeJob(slaEventId: number): Job<{ slaEventId: number }> {
  return { data: { slaEventId } } as Job<{ slaEventId: number }>;
}

describe('DisputeSlaWorker', () => {
  let worker: DisputeSlaWorker;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        DisputeSlaWorker,
        { provide: PrismaService,       useValue: mockPrisma },
        { provide: DisputeSlaService,   useValue: mockDisputeSlaService },
      ],
    }).compile();
    worker = module.get(DisputeSlaWorker);
  });

  describe('idempotency guard', () => {
    it('returns early if event not found', async () => {
      mockPrisma.slaEvent.findUnique.mockResolvedValue(null);
      await worker.process(makeJob(99));
      expect(mockPrisma.slaEvent.update).not.toHaveBeenCalled();
    });

    it('returns early if executedAt already set', async () => {
      mockPrisma.slaEvent.findUnique.mockResolvedValue(
        { id: 1, executedAt: new Date(), isCancelled: false, eventType: 'notify_director' }
      );
      await worker.process(makeJob(1));
      expect(mockPrisma.slaEvent.update).not.toHaveBeenCalled();
    });

    it('returns early if isCancelled is true', async () => {
      mockPrisma.slaEvent.findUnique.mockResolvedValue(
        { id: 1, executedAt: null, isCancelled: true, eventType: 'notify_director' }
      );
      await worker.process(makeJob(1));
      expect(mockPrisma.slaEvent.update).not.toHaveBeenCalled();
    });
  });

  describe('notify_director', () => {
    it('creates notification rows for all directors and stamps executedAt', async () => {
      mockPrisma.slaEvent.findUnique.mockResolvedValue({
        id: 5, executedAt: null, isCancelled: false,
        eventType: 'notify_director', periodId: 1, boqItemId: 3,
      });
      mockPrisma.period.findUniqueOrThrow.mockResolvedValue({
        id: 1, object: { organizationId: 'org-uuid' },
      });
      mockPrisma.user.findMany.mockResolvedValue([{ id: 10 }, { id: 11 }]);

      await worker.process(makeJob(5));

      expect(mockPrisma.notification.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: 10, type: 'sla_day3_no_gp_response' }),
          expect.objectContaining({ userId: 11, type: 'sla_day3_no_gp_response' }),
        ]),
      });
      expect(mockPrisma.slaEvent.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { executedAt: expect.any(Date) },
      });
    });
  });

  describe('force_close', () => {
    it('sets discrepancy force_closed + acceptedVolume=scVolume and stamps executedAt', async () => {
      mockPrisma.slaEvent.findUnique.mockResolvedValue({
        id: 6, executedAt: null, isCancelled: false,
        eventType: 'force_close', periodId: 1, boqItemId: 3,
      });
      mockPrisma.discrepancy.findFirst.mockResolvedValue({
        id: 20, periodFactId: 50, status: 'open',
        periodFact: { scVolume: 42.5 },
      });

      await worker.process(makeJob(6));

      expect(mockPrisma.discrepancy.update).toHaveBeenCalledWith({
        where: { id: 20 },
        data: { status: 'force_closed', resolvedAt: expect.any(Date) },
      });
      expect(mockPrisma.periodFact.update).toHaveBeenCalledWith({
        where: { id: 50 },
        data: { discrepancyStatus: 'force_closed', acceptedVolume: 42.5 },
      });
      expect(mockPrisma.slaEvent.update).toHaveBeenCalledWith({
        where: { id: 6 },
        data: { executedAt: expect.any(Date) },
      });
    });

    it('skips force_close gracefully when discrepancy already resolved', async () => {
      mockPrisma.slaEvent.findUnique.mockResolvedValue({
        id: 7, executedAt: null, isCancelled: false,
        eventType: 'force_close', periodId: 1, boqItemId: 3,
      });
      mockPrisma.discrepancy.findFirst.mockResolvedValue(null);

      await worker.process(makeJob(7));

      expect(mockPrisma.discrepancy.update).not.toHaveBeenCalled();
      expect(mockPrisma.slaEvent.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { executedAt: expect.any(Date) },
      });
    });
  });
});
