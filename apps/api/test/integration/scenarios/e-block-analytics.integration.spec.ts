// apps/api/test/integration/scenarios/e-block-analytics.integration.spec.ts
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@ccip/database';
import { PrismaService } from '../../../src/common/prisma/prisma.service';
import { AuditLogService } from '../../../src/common/audit/audit-log.service';
import { WorkPaceService } from '../../../src/modules/analytics/work-pace.service';
import { PeriodService } from '../../../src/modules/period/period.service';
import { makeOrg, makeUser, makeObject, makeBoQ, makeApprovedZeroReport } from '../fixtures/factories';
import { truncateAll } from '../setup/truncate';

describe('E-block — Analytics: readiness pct (W2 subset)', () => {
  let prisma: PrismaClient;
  let svc: PeriodService;

  beforeAll(async () => {
    prisma = new PrismaClient();
    const mod = await Test.createTestingModule({
      providers: [
        PeriodService,
        { provide: PrismaService, useValue: prisma },
        AuditLogService,
        WorkPaceService,
      ],
    }).compile();
    svc = mod.get(PeriodService);
  });

  afterAll(async () => { await prisma.$disconnect(); });
  beforeEach(async () => { await truncateAll(prisma); });

  async function bootstrap(boqOpts: { count?: number; contractValues?: number[] } = {}) {
    const org = await makeOrg(prisma);
    const sc = await makeUser(prisma, org, 'stroycontrol');
    const dir = await makeUser(prisma, org, 'director');
    const obj = await makeObject(prisma, org);
    const boq = boqOpts.contractValues
      ? await makeBoQ(prisma, obj, { contractValues: boqOpts.contractValues })
      : await makeBoQ(prisma, obj, { count: boqOpts.count ?? 1 });
    await makeApprovedZeroReport(prisma, obj, dir);
    return { org, sc, dir, obj, boq };
  }

  async function runPeriodCycle(
    items: Array<{ boqItemId: number; volume: number }>,
    sc: { id: number },
    obj: { id: number },
  ): Promise<{ periodId: number }> {
    const period = await svc.openPeriod(obj.id, sc.id);
    await svc.submitGp(
      period.gpSubmissionToken!,
      'GP Test Organization',
      items.map((i) => ({ boqItemId: i.boqItemId, gpVolume: i.volume })),
    );
    for (const i of items) {
      await svc.upsertPeriodFact(period.id, i.boqItemId, i.volume, sc.id);
    }
    await svc.closePeriod(period.id, sc.id);
    return { periodId: period.id };
  }

  // @algorithm: E-01
  it('E-01: pct by work — fact=70 / plan=100 = 70%', async () => {
    const { sc, obj, boq } = await bootstrap({ count: 1 });

    const { periodId } = await runPeriodCycle(
      [{ boqItemId: boq.items[0].id, volume: 70 }],
      sc, obj,
    );

    const snapshot = await prisma.readinessSnapshot.findFirst({
      where: { periodId },
      select: { objectReadinessPct: true },
    });
    expect(snapshot).not.toBeNull();
    expect(Number(snapshot!.objectReadinessPct)).toBeCloseTo(70.0, 1);
  });

  // @algorithm: E-02
  it('E-02: pct capped at 100% — fact=150 / plan=100 → 100%', async () => {
    const { sc, obj, boq } = await bootstrap({ count: 1 });

    const { periodId } = await runPeriodCycle(
      [{ boqItemId: boq.items[0].id, volume: 150 }],
      sc, obj,
    );

    const snapshot = await prisma.readinessSnapshot.findFirst({
      where: { periodId },
      select: { objectReadinessPct: true },
    });
    expect(snapshot).not.toBeNull();
    expect(Number(snapshot!.objectReadinessPct)).toBeCloseTo(100.0, 1);
  });

  // @algorithm: E-03
  it('E-03: weighted object pct — SUM(MIN(pct,100) × weight_coef) = 55%', async () => {
    // contractValues=[30,50,20] → weightCoef=[0.30, 0.50, 0.20] via DB trigger
    // facts=[100, 50, 0] → pcts=[100%, 50%, 0%]
    // readiness = 100×0.30 + 50×0.50 + 0×0.20 = 30 + 25 + 0 = 55.0
    const { sc, obj, boq } = await bootstrap({ contractValues: [30, 50, 20] });

    // Ensure weightCoef is set (trigger may not fire on Prisma create in some envs)
    const total = boq.items.reduce((sum, i) => sum + Number(i.contractValue), 0);
    for (const item of boq.items) {
      if (item.weightCoef == null) {
        await prisma.boqItem.update({
          where: { id: item.id },
          data: { weightCoef: Number(item.contractValue) / total },
        });
      }
    }

    const { periodId } = await runPeriodCycle(
      [
        { boqItemId: boq.items[0].id, volume: 100 },
        { boqItemId: boq.items[1].id, volume: 50 },
        { boqItemId: boq.items[2].id, volume: 0 },
      ],
      sc, obj,
    );

    const snapshot = await prisma.readinessSnapshot.findFirst({
      where: { periodId },
      select: { objectReadinessPct: true },
    });
    expect(snapshot).not.toBeNull();
    expect(Number(snapshot!.objectReadinessPct)).toBeCloseTo(55.0, 1);
  });

  // @algorithm: E-04..E-09 — формулы покрыты WorkPaceService unit-тестами;
  // здесь проверяем только wiring closePeriod → ReadinessSnapshot.
  it('E-04..E-09 wiring: closePeriod persists forecast fields on ReadinessSnapshot', async () => {
    const { sc, obj, boq } = await bootstrap({ count: 1 });

    const { periodId } = await runPeriodCycle(
      [{ boqItemId: boq.items[0].id, volume: 10 }],
      sc, obj,
    );

    const snapshot = await prisma.readinessSnapshot.findFirst({
      where: { periodId },
      select: { weightedForecastDate: true, criticalPathForecastDate: true, gapFlag: true },
    });
    expect(snapshot).not.toBeNull();
    // Один период без weightCoef → calcObjectForecast не находит активных items с weightCoef → null/false
    expect(snapshot!.gapFlag).toBe(false);
  });
});
