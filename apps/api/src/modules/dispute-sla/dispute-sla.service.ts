import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';

const JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 10_000 },
  removeOnComplete: true,
  removeOnFail: false,
};

@Injectable()
export class DisputeSlaService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('sla') private readonly slaQueue: Queue,
  ) {}

  async scheduleEvents(params: {
    discrepancyId: number;
    periodId: number;
    boqItemId: number;
    createdAt: Date;
    scenario?: 'A' | 'B';
  }): Promise<void> {
    const { periodId, boqItemId, createdAt, scenario = 'A' } = params;
    const addDays = (n: number) => new Date(createdAt.getTime() + n * 86_400_000);

    const data =
      scenario === 'A'
        ? [
            { periodId, boqItemId, scenario: 'A', eventType: 'notify_director_day3', scheduledAt: addDays(3) },
            { periodId, boqItemId, scenario: 'A', eventType: 'force_close_day5',     scheduledAt: addDays(5) },
          ]
        : [
            // Scenario B: GP responded, SC rejected it — active dispute (algorithm_v1_3.md §Block D)
            { periodId, boqItemId, scenario: 'B', eventType: 'notify_director_day3',    scheduledAt: addDays(3) },
            { periodId, boqItemId, scenario: 'B', eventType: 'director_deadline_day7',  scheduledAt: addDays(7) },
            { periodId, boqItemId, scenario: 'B', eventType: 'sc_figure_applied_day14', scheduledAt: addDays(14) },
          ];

    await this.prisma.slaEvent.createMany({ data });

    const events = await this.prisma.slaEvent.findMany({
      where: { periodId, boqItemId, scenario, executedAt: null, isCancelled: false },
      orderBy: { id: 'asc' },
    });

    for (const event of events) {
      const delay = Math.max(0, event.scheduledAt.getTime() - Date.now());
      await this.slaQueue.add('sla.event', { slaEventId: event.id }, {
        jobId: `sla-${event.id}`,
        delay,
        ...JOB_OPTS,
      });
    }
  }

  async recoverPending(): Promise<number> {
    const events = await this.prisma.slaEvent.findMany({
      where: { executedAt: null, isCancelled: false },
    });

    for (const event of events) {
      const delay = Math.max(0, event.scheduledAt.getTime() - Date.now());
      await this.slaQueue.add('sla.event', { slaEventId: event.id }, {
        jobId: `sla-${event.id}`,
        delay,
        ...JOB_OPTS,
      });
    }

    return events.length;
  }

  async cancelEvents(periodId: number, boqItemId: number): Promise<void> {
    await this.prisma.slaEvent.updateMany({
      where: { periodId, boqItemId, executedAt: null, isCancelled: false },
      data: { isCancelled: true },
    });
  }
}
