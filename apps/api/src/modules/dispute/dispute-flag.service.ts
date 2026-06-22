import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

const DEFAULT_N_FLAG = 3;
const DEFAULT_M_WINDOW = 5;

@Injectable()
export class DisputeFlagService {
  constructor(private readonly prisma: PrismaService) {}

  async detectSystemicFlag(
    periodId: number,
    boqItemId: number,
    organizationId: string,
  ): Promise<void> {
    const [nRow, mRow] = await Promise.all([
      this.prisma.systemConfig.findUnique({
        where: { organizationId_key: { organizationId, key: 'N_flag_threshold' } },
      }),
      this.prisma.systemConfig.findUnique({
        where: { organizationId_key: { organizationId, key: 'M_flag_window' } },
      }),
    ]);

    const nThreshold = nRow?.valueNumeric != null ? Number(nRow.valueNumeric) : DEFAULT_N_FLAG;
    const mWindow    = mRow?.valueNumeric != null ? Number(mRow.valueNumeric) : DEFAULT_M_WINDOW;

    const recentPeriodIds = await this.getRecentPeriodIds(periodId, mWindow);

    const type2Count = await this.prisma.discrepancy.count({
      where: {
        type: 2,
        periodFact: {
          boqItemId,
          periodId: { in: recentPeriodIds },
        },
      },
    });

    if (type2Count < nThreshold) return;

    const cumulativeDelta = await this.prisma.periodFact.aggregate({
      where: { boqItemId },
      _sum: { scVolume: true },
    });

    const directors = await this.prisma.user.findMany({
      where: { organizationId, role: 'director' },
      select: { id: true },
    });

    if (directors.length === 0) return;

    await this.prisma.notification.createMany({
      data: directors.map((d) => ({
        userId: d.id,
        type: 'systemic_dispute_flag',
        referenceTable: 'period_facts',
        referenceId: BigInt(boqItemId),
        message:
          `Флаг: ${type2Count} спорных расхождений за последние ${mWindow} периодов. ` +
          `Накопленная дельта: ${cumulativeDelta._sum.scVolume?.toString() ?? '0'}`,
      })),
    });
  }

  async clearSystemicFlag(boqItemId: number, organizationId: string): Promise<void> {
    const directors = await this.prisma.user.findMany({
      where: { organizationId, role: 'director' },
      select: { id: true },
    });

    if (directors.length === 0) return;

    await this.prisma.notification.updateMany({
      where: {
        userId: { in: directors.map((d) => d.id) },
        type: 'systemic_dispute_flag',
        referenceId: BigInt(boqItemId),
        readAt: null,
      },
      data: { readAt: new Date() },
    });
  }

  private async getRecentPeriodIds(periodId: number, mWindow: number): Promise<number[]> {
    const period = await this.prisma.period.findUniqueOrThrow({
      where: { id: periodId },
      select: { objectId: true, periodNumber: true },
    });

    const recentPeriods = await this.prisma.period.findMany({
      where: {
        objectId: period.objectId,
        periodNumber: { lte: period.periodNumber },
      },
      orderBy: { periodNumber: 'desc' },
      take: mWindow,
      select: { id: true },
    });

    return recentPeriods.map((p) => p.id);
  }
}
