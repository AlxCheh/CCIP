import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@ccip/database';
import { PrismaService } from '../../../src/common/prisma/prisma.service';
import { WorkPaceService } from '../../../src/modules/analytics/work-pace.service';
import { makeOrg, makeUser, makeObject, makeBoQ } from '../fixtures/factories';
import { truncateAll } from '../setup/truncate';

describe('WorkPaceService — E-04..E-09', () => {
  let prisma: PrismaClient;
  let svc: WorkPaceService;

  beforeAll(async () => {
    prisma = new PrismaClient();
    const mod = await Test.createTestingModule({
      providers: [WorkPaceService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    svc = mod.get(WorkPaceService);
  });

  afterAll(async () => { await prisma.$disconnect(); });
  beforeEach(async () => { await truncateAll(prisma); });

  async function bootstrap() {
    const org = await makeOrg(prisma);
    const sc = await makeUser(prisma, org, 'stroycontrol');
    const obj = await makeObject(prisma, org);
    const boq = await makeBoQ(prisma, obj, { count: 1 });
    await prisma.boqItem.update({ where: { id: boq.items[0].id }, data: { weightCoef: 1 } });
    return { org, sc, obj, boq };
  }

  async function seedPeriods(
    obj: { id: number },
    boq: { versionId: number },
    sc: { id: number },
    boqItemId: number,
    volumes: Array<{ delta: number; plannedPause?: boolean }>,
  ): Promise<{ id: number }[]> {
    const periods: { id: number }[] = [];
    let cumulative = 0;
    for (let i = 0; i < volumes.length; i++) {
      const period = await prisma.period.create({
        data: {
          objectId: obj.id,
          boqVersionId: boq.versionId,
          periodNumber: i + 1,
          status: 'closed',
          openedBy: sc.id,
          closedBy: sc.id,
          closedAt: new Date(),
          plannedPause: volumes[i].plannedPause ?? false,
          gpSubmissionToken: randomUUID(),
          gpTokenExpiresAt: new Date(Date.now() + 86_400_000),
        },
      });
      cumulative += volumes[i].delta;
      await prisma.periodFact.create({
        data: { periodId: period.id, boqItemId, acceptedVolume: cumulative },
      });
      await prisma.workPace.create({
        data: {
          periodId: period.id,
          boqItemId,
          periodVolume: volumes[i].delta,
          weightedPace: volumes[i].delta,
          isExcluded: false,
        },
      });
      periods.push({ id: period.id });
    }
    return periods;
  }

  // @algorithm: E-04
  it('E-04: planned pause excluded — P3 paused, pace computed over remaining 4 periods', async () => {
    const { org, sc, obj, boq } = await bootstrap();
    await prisma.systemConfig.create({
      data: { organizationId: org.id, key: 'avg_pace_periods', valueType: 'numeric', valueNumeric: 5 },
    });
    await prisma.systemConfig.create({
      data: { organizationId: org.id, key: 'decay_factor', valueType: 'numeric', valueNumeric: 1 },
    });

    const periods = await seedPeriods(obj, boq, sc, boq.items[0].id, [
      { delta: 10 },
      { delta: 10 },
      { delta: 0, plannedPause: true }, // P3 — плановая пауза
      { delta: 10 },
      { delta: 10 },
    ]);

    const result = await svc.calcItemPace(prisma, boq.items[0].id, obj.id, periods[4].id);

    // decay_factor=1 → простое среднее по 4 НЕ-паузным периодам = (10+10+10+10)/4 = 10
    expect(result.paceWeighted).toBeCloseTo(10, 5);
  });

  // @algorithm: E-05
  it('E-05: zero-volume unplanned period included in window with decay weight', async () => {
    const { org, sc, obj, boq } = await bootstrap();
    await prisma.systemConfig.create({
      data: { organizationId: org.id, key: 'decay_factor', valueType: 'numeric', valueNumeric: 1 },
    });

    const periods = await seedPeriods(obj, boq, sc, boq.items[0].id, [
      { delta: 10 },
      { delta: 10 },
      { delta: 10 },
      { delta: 0 }, // P4 — внеплановый простой (НЕ пауза)
    ]);

    const result = await svc.calcItemPace(prisma, boq.items[0].id, obj.id, periods[3].id);

    // P4 включён в окно (не excluded), среднее по 4 = (10+10+10+0)/4 = 7.5
    expect(result.paceWeighted).toBeCloseTo(7.5, 5);
    expect(result.isAllZero).toBe(false);
  });

  // @algorithm: E-09
  it('E-09: all-zero window → paceWeighted=0, forecastEnd=null, director warned', async () => {
    const { org, sc, obj, boq } = await bootstrap();
    const dir = await makeUser(prisma, org, 'director');

    const periods = await seedPeriods(obj, boq, sc, boq.items[0].id, [
      { delta: 0 }, { delta: 0 }, { delta: 0 }, { delta: 0 }, { delta: 0 },
    ]);

    const result = await svc.calcItemPace(prisma, boq.items[0].id, obj.id, periods[4].id);

    expect(result.paceWeighted).toBe(0);
    expect(result.forecastEnd).toBeNull();
    expect(result.isAllZero).toBe(true);

    const notifCount = await prisma.notification.count({
      where: { userId: dir.id, type: 'zero_pace_forecast' },
    });
    expect(notifCount).toBe(1);
  });

  // @algorithm: E-06
  it('E-06: outlier "planned concentration" — latest period weight halved', async () => {
    const { org, sc, obj, boq } = await bootstrap();
    await prisma.systemConfig.create({
      data: { organizationId: org.id, key: 'decay_factor', valueType: 'numeric', valueNumeric: 1 },
    });
    await prisma.systemConfig.create({
      data: { organizationId: org.id, key: 'spike_threshold', valueType: 'numeric', valueNumeric: 2 },
    });

    // Baseline 4 периода со средним темпом 10, затем P5 = 30 (×3 baseline) — выброс
    const periods = await seedPeriods(obj, boq, sc, boq.items[0].id, [
      { delta: 10 }, { delta: 10 }, { delta: 10 }, { delta: 10 }, { delta: 30 },
    ]);
    await prisma.periodFact.updateMany({
      where: { periodId: periods[4].id, boqItemId: boq.items[0].id },
      data: { spikeResponse: 'planned_concentration' },
    });

    const result = await svc.calcItemPace(prisma, boq.items[0].id, obj.id, periods[4].id);

    // без коррекции: (30+10+10+10+10)/5=14; с весом P5=0.5: (30*0.5+10+10+10+10)/(0.5+1+1+1+1)=55/4.5≈12.22
    expect(result.paceWeighted).toBeCloseTo(55 / 4.5, 2);
    expect(result.paceWeighted).toBeLessThan(14);

    const fact = await prisma.periodFact.findFirst({
      where: { periodId: periods[4].id, boqItemId: boq.items[0].id },
      select: { isSpike: true },
    });
    expect(fact!.isSpike).toBe(true);
  });
});
