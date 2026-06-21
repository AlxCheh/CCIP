import { Injectable, OnModuleInit } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DisputeSlaService } from './dispute-sla.service';

@Processor('sla')
@Injectable()
export class DisputeSlaWorker implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly disputeSlaService: DisputeSlaService,
  ) {}

  async onModuleInit(): Promise<void> {
    const count = await this.disputeSlaService.recoverPending();
    if (count > 0) {
      console.log(`[SLA Worker] Recovery: re-queued ${count} pending SLA events`);
    }
  }

  @Process()
  async process(job: Job<{ slaEventId: number }>): Promise<void> {
    const event = await this.prisma.slaEvent.findUnique({
      where: { id: job.data.slaEventId },
    });

    if (!event || event.executedAt || event.isCancelled) return;

    if (event.eventType === 'notify_director_day3') {
      await this.handleNotify(event);
    } else if (event.eventType === 'force_close_day5') {
      await this.handleForceClose(event);
    }

    await this.prisma.slaEvent.update({
      where: { id: event.id },
      data: { executedAt: new Date() },
    });
  }

  private async handleNotify(event: {
    id: number; periodId: number; boqItemId: number | null;
  }): Promise<void> {
    const period = await this.prisma.period.findUniqueOrThrow({
      where: { id: event.periodId },
      include: { object: { select: { organizationId: true } } },
    });

    const directors = await this.prisma.user.findMany({
      where: { organizationId: period.object.organizationId, role: 'director' },
      select: { id: true },
    });

    if (directors.length === 0) return;

    await this.prisma.notification.createMany({
      data: directors.map((d) => ({
        userId: d.id,
        type: 'sla_day3_no_gp_response',
        referenceTable: 'sla_events',
        referenceId: BigInt(event.id),
        message: `ГП не ответил по расхождению (boq_item_id=${event.boqItemId ?? '?'}). Сценарий A, день 3.`,
      })),
    });
  }

  private async handleForceClose(event: {
    id: number; periodId: number; boqItemId: number | null;
  }): Promise<void> {
    const discrepancy = await this.prisma.discrepancy.findFirst({
      where: {
        periodFact: {
          periodId: event.periodId,
          ...(event.boqItemId != null ? { boqItemId: event.boqItemId } : {}),
        },
        status: 'open',
      },
      include: { periodFact: true },
    });

    if (discrepancy) {
      await this.prisma.discrepancy.update({
        where: { id: discrepancy.id },
        data: { status: 'forced_sc_figure', resolvedAt: new Date() },
      });

      await this.prisma.periodFact.update({
        where: { id: discrepancy.periodFactId },
        data: {
          discrepancyStatus: 'forced_sc_figure',
          acceptedVolume: discrepancy.periodFact.scVolume,
        },
      });
    }
  }
}
