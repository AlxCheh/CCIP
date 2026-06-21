import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { DisputeSlaService } from '../dispute-sla.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

const mockPrisma = {
  slaEvent: {
    createMany: jest.fn(),
    findMany: jest.fn(),
  },
};
const mockQueue = { add: jest.fn() };

describe('DisputeSlaService', () => {
  let service: DisputeSlaService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        DisputeSlaService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken('sla'), useValue: mockQueue },
      ],
    }).compile();
    service = module.get(DisputeSlaService);
  });

  describe('scheduleEvents', () => {
    it('creates two sla_events (notify day+3, force_close day+5) and enqueues both', async () => {
      const now = new Date('2026-06-01T10:00:00Z');
      jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
      mockPrisma.slaEvent.createMany.mockResolvedValue({ count: 2 });
      mockPrisma.slaEvent.findMany.mockResolvedValue([
        { id: 1, eventType: 'notify_director_day3', scheduledAt: new Date(now.getTime() + 3 * 86400_000) },
        { id: 2, eventType: 'force_close_day5',     scheduledAt: new Date(now.getTime() + 5 * 86400_000) },
      ]);

      await service.scheduleEvents({ discrepancyId: 10, periodId: 5, boqItemId: 7, createdAt: now });

      expect(mockPrisma.slaEvent.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ scenario: 'A', eventType: 'notify_director_day3', periodId: 5, boqItemId: 7 }),
          expect.objectContaining({ scenario: 'A', eventType: 'force_close_day5',     periodId: 5, boqItemId: 7 }),
        ],
      });
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'sla.event',
        { slaEventId: 1 },
        expect.objectContaining({ jobId: 'sla-1', attempts: 3, removeOnComplete: true }),
      );
      expect(mockQueue.add).toHaveBeenCalledWith(
        'sla.event',
        { slaEventId: 2 },
        expect.objectContaining({ jobId: 'sla-2', delay: expect.any(Number) }),
      );
    });

    it('Scenario B: creates three sla_events (notify day+3, director day+7, sc-figure day+14)', async () => {
      const now = new Date('2026-06-01T10:00:00Z');
      jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
      mockPrisma.slaEvent.createMany.mockResolvedValue({ count: 3 });
      mockPrisma.slaEvent.findMany.mockResolvedValue([
        { id: 1, eventType: 'notify_director_day3',    scheduledAt: new Date(now.getTime() + 3 * 86400_000) },
        { id: 2, eventType: 'director_deadline_day7',  scheduledAt: new Date(now.getTime() + 7 * 86400_000) },
        { id: 3, eventType: 'sc_figure_applied_day14', scheduledAt: new Date(now.getTime() + 14 * 86400_000) },
      ]);

      await service.scheduleEvents({ discrepancyId: 10, periodId: 5, boqItemId: 7, createdAt: now, scenario: 'B' });

      expect(mockPrisma.slaEvent.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ scenario: 'B', eventType: 'notify_director_day3' }),
          expect.objectContaining({ scenario: 'B', eventType: 'director_deadline_day7' }),
          expect.objectContaining({ scenario: 'B', eventType: 'sc_figure_applied_day14' }),
        ],
      });
      expect(mockPrisma.slaEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ scenario: 'B' }) }),
      );
      expect(mockQueue.add).toHaveBeenCalledTimes(3);
    });
  });

  describe('recoverPending', () => {
    it('re-queues all pending events; overdue events get delay=0, future events get delay>0', async () => {
      const now = new Date('2026-06-10T12:00:00Z');
      jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
      mockPrisma.slaEvent.findMany.mockResolvedValue([
        { id: 3, scheduledAt: new Date('2026-06-08T12:00:00Z') }, // overdue
        { id: 4, scheduledAt: new Date('2026-06-15T12:00:00Z') }, // future
      ]);

      const count = await service.recoverPending();

      expect(count).toBe(2);
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
      const calls = mockQueue.add.mock.calls;
      const overdueCall = calls.find((c) => c[2].jobId === 'sla-3');
      const futureCall  = calls.find((c) => c[2].jobId === 'sla-4');
      expect(overdueCall[2].delay).toBe(0);
      expect(futureCall[2].delay).toBeGreaterThan(0);
    });

    it('returns 0 and enqueues nothing when no pending events', async () => {
      mockPrisma.slaEvent.findMany.mockResolvedValue([]);
      const count = await service.recoverPending();
      expect(count).toBe(0);
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });
});
