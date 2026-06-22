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
        { id: 1, executedAt: new Date(), isCancelled: false, eventType: 'notify_director_day3' }
      );
      await worker.process(makeJob(1));
      expect(mockPrisma.slaEvent.update).not.toHaveBeenCalled();
    });

    it('returns early if isCancelled is true', async () => {
      mockPrisma.slaEvent.findUnique.mockResolvedValue(
        { id: 1, executedAt: null, isCancelled: true, eventType: 'notify_director_day3' }
      );
      await worker.process(makeJob(1));
      expect(mockPrisma.slaEvent.update).not.toHaveBeenCalled();
    });
  });

  describe('notify_director', () => {
    it('creates notification rows for all directors and stamps executedAt', async () => {
      mockPrisma.slaEvent.findUnique.mockResolvedValue({
        id: 5, executedAt: null, isCancelled: false,
        eventType: 'notify_director_day3', periodId: 1, boqItemId: 3,
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
        eventType: 'force_close_day5', periodId: 1, boqItemId: 3,
      });
      mockPrisma.discrepancy.findFirst.mockResolvedValue({
        id: 20, periodFactId: 50, status: 'open',
        periodFact: { scVolume: 42.5 },
      });

      await worker.process(makeJob(6));

      expect(mockPrisma.discrepancy.update).toHaveBeenCalledWith({
        where: { id: 20 },
        data: { status: 'forced_sc_figure', resolvedAt: expect.any(Date) },
      });
      expect(mockPrisma.periodFact.update).toHaveBeenCalledWith({
        where: { id: 50 },
        data: { discrepancyStatus: 'forced_sc_figure', acceptedVolume: 42.5 },
      });
      expect(mockPrisma.slaEvent.update).toHaveBeenCalledWith({
        where: { id: 6 },
        data: { executedAt: expect.any(Date) },
      });
    });

    it('skips force_close gracefully when discrepancy already resolved', async () => {
      mockPrisma.slaEvent.findUnique.mockResolvedValue({
        id: 7, executedAt: null, isCancelled: false,
        eventType: 'force_close_day5', periodId: 1, boqItemId: 3,
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

  describe('Scenario B — notify_director (active dispute)', () => {
    it('day3 notify with scenario=B sends sla_day3_active_dispute, not the scenario-A message', async () => {
      mockPrisma.slaEvent.findUnique.mockResolvedValue({
        id: 8, executedAt: null, isCancelled: false, scenario: 'B',
        eventType: 'notify_director_day3', periodId: 1, boqItemId: 3,
      });
      mockPrisma.period.findUniqueOrThrow.mockResolvedValue({
        id: 1, object: { organizationId: 'org-uuid' },
      });
      mockPrisma.user.findMany.mockResolvedValue([{ id: 10 }]);

      await worker.process(makeJob(8));

      expect(mockPrisma.notification.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: 10, type: 'sla_day3_active_dispute' }),
        ]),
      });
    });
  });

  describe('Scenario B — director_deadline_day7', () => {
    it('sends a reminder when the discrepancy is still open and undecided', async () => {
      mockPrisma.slaEvent.findUnique.mockResolvedValue({
        id: 9, executedAt: null, isCancelled: false, scenario: 'B',
        eventType: 'director_deadline_day7', periodId: 1, boqItemId: 3,
      });
      mockPrisma.discrepancy.findFirst.mockResolvedValue({
        id: 21, periodFactId: 51, status: 'open', directorDecision: null,
        periodFact: { scVolume: 30 },
      });
      mockPrisma.period.findUniqueOrThrow.mockResolvedValue({
        id: 1, object: { organizationId: 'org-uuid' },
      });
      mockPrisma.user.findMany.mockResolvedValue([{ id: 11 }]);

      await worker.process(makeJob(9));

      expect(mockPrisma.notification.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: 11, type: 'sla_day7_director_reminder' }),
        ]),
      });
    });

    it('skips the reminder when the director already decided', async () => {
      mockPrisma.slaEvent.findUnique.mockResolvedValue({
        id: 12, executedAt: null, isCancelled: false, scenario: 'B',
        eventType: 'director_deadline_day7', periodId: 1, boqItemId: 3,
      });
      mockPrisma.discrepancy.findFirst.mockResolvedValue({
        id: 22, periodFactId: 52, status: 'open', directorDecision: 'sc_measure',
        periodFact: { scVolume: 30 },
      });

      await worker.process(makeJob(12));

      expect(mockPrisma.notification.createMany).not.toHaveBeenCalled();
      expect(mockPrisma.slaEvent.update).toHaveBeenCalledWith({
        where: { id: 12 },
        data: { executedAt: expect.any(Date) },
      });
    });
  });

  describe('Scenario B — sc_figure_applied_day14', () => {
    it('applies the SC figure, same as force_close_day5', async () => {
      mockPrisma.slaEvent.findUnique.mockResolvedValue({
        id: 13, executedAt: null, isCancelled: false, scenario: 'B',
        eventType: 'sc_figure_applied_day14', periodId: 1, boqItemId: 3,
      });
      mockPrisma.discrepancy.findFirst.mockResolvedValue({
        id: 23, periodFactId: 53, status: 'open',
        periodFact: { scVolume: 77 },
      });

      await worker.process(makeJob(13));

      expect(mockPrisma.discrepancy.update).toHaveBeenCalledWith({
        where: { id: 23 },
        data: { status: 'forced_sc_figure', resolvedAt: expect.any(Date) },
      });
      expect(mockPrisma.periodFact.update).toHaveBeenCalledWith({
        where: { id: 53 },
        data: { discrepancyStatus: 'forced_sc_figure', acceptedVolume: 77 },
      });
    });
  });
});
