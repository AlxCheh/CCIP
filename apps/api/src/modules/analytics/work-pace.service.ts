import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@ccip/database';
import { PrismaService } from '../../common/prisma/prisma.service';

// @algorithm: docs/algorithm_v1_3.md §4.5 E4/E5 — допущение: 1 период = 30 дней
// (в схеме нет period.date_from/date_to для точного расчёта)
export const PERIOD_LENGTH_DAYS = 30;

const DEFAULT_AVG_PACE_PERIODS = 5;
const DEFAULT_DECAY_FACTOR = 0.8;
const DEFAULT_SPIKE_THRESHOLD = 3;
const DEFAULT_WEIGHT_THRESHOLD = 0.1;
const DEFAULT_FORECAST_GAP_PERIODS = 2;

export interface ItemPaceResult {
  paceWeighted: number;
  forecastEnd: Date | null;
  isAllZero: boolean;
}

type Tx = PrismaClient | Prisma.TransactionClient;

@Injectable()
export class WorkPaceService {
  constructor(private readonly prisma: PrismaService) {}

  private async getConfig(
    tx: Tx,
    organizationId: string,
  ): Promise<{
    avgPacePeriods: number;
    decayFactor: number;
    spikeThreshold: number;
    weightThreshold: number;
    forecastGapPeriods: number;
  }> {
    const rows = await tx.systemConfig.findMany({
      where: {
        organizationId,
        key: { in: ['avg_pace_periods', 'decay_factor', 'spike_threshold', 'weight_threshold', 'forecast_gap_alert'] },
      },
    });
    const get = (key: string, def: number) => {
      const row = rows.find((r) => r.key === key);
      return row?.valueNumeric != null ? Number(row.valueNumeric) : def;
    };
    return {
      avgPacePeriods: get('avg_pace_periods', DEFAULT_AVG_PACE_PERIODS),
      decayFactor: get('decay_factor', DEFAULT_DECAY_FACTOR),
      spikeThreshold: get('spike_threshold', DEFAULT_SPIKE_THRESHOLD),
      weightThreshold: get('weight_threshold', DEFAULT_WEIGHT_THRESHOLD),
      forecastGapPeriods: get('forecast_gap_alert', DEFAULT_FORECAST_GAP_PERIODS),
    };
  }

  // @algorithm: E4 — взвешенный фактический темп с затуханием (без детекции выбросов — Task 6)
  async calcItemPace(
    tx: Tx,
    boqItemId: number,
    objectId: number,
    asOfPeriodId: number,
  ): Promise<ItemPaceResult> {
    const object = await tx.constructionObject.findUniqueOrThrow({
      where: { id: objectId },
      select: { organizationId: true },
    });
    const cfg = await this.getConfig(tx, object.organizationId);

    const asOfPeriod = await tx.period.findUniqueOrThrow({
      where: { id: asOfPeriodId },
      select: { periodNumber: true },
    });

    const window = await tx.workPace.findMany({
      where: {
        boqItemId,
        period: { objectId, periodNumber: { lte: asOfPeriod.periodNumber } },
      },
      include: { period: { select: { periodNumber: true, plannedPause: true } } },
      orderBy: { period: { periodNumber: 'desc' } },
      take: cfg.avgPacePeriods,
    });

    // window_clean: исключить плановые паузы (тип А)
    const windowClean = window.filter((w) => !w.period.plannedPause && !w.isExcluded);

    let totalWeight = 0;
    let paceWeighted = 0;
    windowClean.forEach((w, i) => {
      const weight = Math.pow(cfg.decayFactor, i);
      paceWeighted += Number(w.periodVolume) * weight;
      totalWeight += weight;
    });
    let finalPace = totalWeight > 0 ? paceWeighted / totalWeight : 0;

    // @algorithm: line 471-480 — детекция выброса на самом свежем периоде окна
    if (windowClean.length > 0 && finalPace > 0) {
      const latest = windowClean[0];
      const latestVolume = Number(latest.periodVolume);
      if (latestVolume > finalPace * cfg.spikeThreshold) {
        const latestFact = await tx.periodFact.findFirst({
          where: { periodId: latest.periodId, boqItemId },
          select: { id: true, spikeResponse: true },
        });
        if (latestFact) {
          await tx.periodFact.update({ where: { id: latestFact.id }, data: { isSpike: true } });
        }
        if (latestFact?.spikeResponse === 'data_entry_error') {
          // период исключается из окна — пересчёт без него
          const rest = windowClean.slice(1);
          let w = 0;
          let pw = 0;
          rest.forEach((r, i) => {
            const weight = Math.pow(cfg.decayFactor, i);
            pw += Number(r.periodVolume) * weight;
            w += weight;
          });
          finalPace = w > 0 ? pw / w : 0;
        } else {
          // 'planned_concentration' или нет ответа → вес периода понижается до 0.5
          const rest = windowClean.slice(1);
          let w = 0.5; // i=0 weight = decay^0 = 1, понижен до 0.5
          let pw = latestVolume * 0.5;
          rest.forEach((r, i) => {
            const weight = Math.pow(cfg.decayFactor, i + 1);
            pw += Number(r.periodVolume) * weight;
            w += weight;
          });
          finalPace = w > 0 ? pw / w : 0;
        }
      }
    }

    const isAllZero =
      windowClean.length > 0 && windowClean.every((w) => Number(w.periodVolume) === 0);

    if (isAllZero) {
      const directors = await tx.user.findMany({
        where: { organizationId: object.organizationId, role: 'director' },
        select: { id: true },
      });
      if (directors.length > 0) {
        await tx.notification.createMany({
          data: directors.map((d) => ({
            userId: d.id,
            type: 'zero_pace_forecast',
            referenceTable: 'boq_items',
            referenceId: BigInt(boqItemId),
            message: `Нулевой темп по позиции ${boqItemId} — простой, прогноз невозможен`,
          })),
        });
      }
    }

    if (finalPace <= 0) {
      return { paceWeighted: 0, forecastEnd: null, isAllZero };
    }

    const fact = await tx.periodFact.findFirst({
      where: { periodId: asOfPeriodId, boqItemId },
      select: { acceptedVolume: true, scVolume: true, boqItem: { select: { planVolume: true } } },
    });
    if (!fact) return { paceWeighted: finalPace, forecastEnd: null, isAllZero };

    const cumulative = fact.acceptedVolume != null ? Number(fact.acceptedVolume) : Number(fact.scVolume ?? 0);
    const remaining = Number(fact.boqItem.planVolume) - cumulative;
    const periodsRemaining = Math.max(remaining, 0) / finalPace;
    const forecastEnd = new Date(Date.now() + periodsRemaining * PERIOD_LENGTH_DAYS * 86_400_000);

    return { paceWeighted: finalPace, forecastEnd, isAllZero };
  }
}
