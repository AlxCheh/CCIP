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
  }): Promise<void> {
    const { periodId, boqItemId, createdAt } = params;
    const day3 = new Date(createdAt.getTime() + 3 * 86_400_000);
    const day5 = new Date(createdAt.getTime() + 5 * 86_400_000);

    await this.prisma.slaEvent.createMany({
      data: [
        { periodId, boqItemId, scenario: 'A', eventType: 'notify_director_day3', scheduledAt: day3 },
        { periodId, boqItemId, scenario: 'A', eventType: 'force_close_day5',     scheduledAt: day5 },
      ],
    });

    const events = await this.prisma.slaEvent.findMany({
      where: { periodId, boqItemId, scenario: 'A', executedAt: null, isCancelled: false },
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
