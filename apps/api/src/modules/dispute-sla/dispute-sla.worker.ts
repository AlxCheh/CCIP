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

  @Process('sla.event')
  async process(job: Job<{ slaEventId: number }>): Promise<void> {
    const event = await this.prisma.slaEvent.findUnique({
      where: { id: job.data.slaEventId },
    });

    if (!event || event.executedAt || event.isCancelled) return;

    if (event.eventType === 'notify_director_day3') {
      await this.handleNotify(event);
    } else if (event.eventType === 'force_close_day5' || event.eventType === 'sc_figure_applied_day14') {
      await this.handleForceClose(event);
    } else if (event.eventType === 'director_deadline_day7') {
      await this.handleDirectorDeadline(event);
    }

    await this.prisma.slaEvent.update({
      where: { id: event.id },
      data: { executedAt: new Date() },
    });
  }

  private async handleNotify(event: {
    id: number; periodId: number; boqItemId: number | null; scenario: string;
  }): Promise<void> {
    const directors = await this.getDirectors(event.periodId);
    if (directors.length === 0) return;

    const isScenarioB = event.scenario === 'B';
    await this.prisma.notification.createMany({
      data: directors.map((d) => ({
        userId: d.id,
        type: isScenarioB ? 'sla_day3_active_dispute' : 'sla_day3_no_gp_response',
        referenceTable: 'sla_events',
        referenceId: BigInt(event.id),
        message: isScenarioB
          ? `Активный спор по позиции (boq_item_id=${event.boqItemId ?? '?'}). Обе стороны предоставили документацию. Сценарий B, день 3.`
          : `ГП не ответил по расхождению (boq_item_id=${event.boqItemId ?? '?'}). Сценарий A, день 3.`,
      })),
    });
  }

  // Scenario B, day 7: director must decide (approve SC figure / approve GP figure /
  // assign expertise-hold) — no decision-capture API exists yet, so this is a reminder.
  private async handleDirectorDeadline(event: {
    id: number; periodId: number; boqItemId: number | null;
  }): Promise<void> {
    const discrepancy = await this.findOpenDiscrepancy(event);
    if (!discrepancy || discrepancy.directorDecision != null) return;

    const directors = await this.getDirectors(event.periodId);
    if (directors.length === 0) return;

    await this.prisma.notification.createMany({
      data: directors.map((d) => ({
        userId: d.id,
        type: 'sla_day7_director_reminder',
        referenceTable: 'sla_events',
        referenceId: BigInt(event.id),
        message: `Решение по спору (boq_item_id=${event.boqItemId ?? '?'}) требуется. Сценарий B, день 7.`,
      })),
    });
  }

  // Scenario A day 5 (GP silence) and Scenario B day 14 (dispute ceiling) both
  // resolve the same way: apply the SC's measured volume as the final figure.
  private async handleForceClose(event: {
    id: number; periodId: number; boqItemId: number | null;
  }): Promise<void> {
    const discrepancy = await this.findOpenDiscrepancy(event);
    if (!discrepancy) return;

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

  private async getDirectors(periodId: number): Promise<Array<{ id: number }>> {
    const period = await this.prisma.period.findUniqueOrThrow({
      where: { id: periodId },
      include: { object: { select: { organizationId: true } } },
    });
    return this.prisma.user.findMany({
      where: { organizationId: period.object.organizationId, role: 'director' },
      select: { id: true },
    });
  }

  private findOpenDiscrepancy(event: { periodId: number; boqItemId: number | null }) {
    return this.prisma.discrepancy.findFirst({
      where: {
        periodFact: {
          periodId: event.periodId,
          ...(event.boqItemId != null ? { boqItemId: event.boqItemId } : {}),
        },
        status: 'open',
      },
      include: { periodFact: true },
    });
  }
}
