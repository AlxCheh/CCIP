// apps/api/test/integration/scenarios/d-block-sla-worker.integration.spec.ts
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@ccip/database';
import { PrismaService } from '../../../src/common/prisma/prisma.service';
import { AuditLogService } from '../../../src/common/audit/audit-log.service';
import { PeriodService } from '../../../src/modules/period/period.service';
import { WorkPaceService } from '../../../src/modules/analytics/work-pace.service';
import { DisputeService } from '../../../src/modules/dispute/dispute.service';
import { DisputeSlaService } from '../../../src/modules/dispute-sla/dispute-sla.service';
import { DisputeSlaWorker } from '../../../src/modules/dispute-sla/dispute-sla.worker';
import { makeOrg, makeUser, makeObject, makeBoQ, makeApprovedZeroReport } from '../fixtures/factories';
import { truncateAll } from '../setup/truncate';

describe('D-block — SLA Worker handlers (direct invocation, no BullMQ)', () => {
  let prisma: PrismaClient;
  let periodSvc: PeriodService;
  let disputeSvc: DisputeService;
  let worker: DisputeSlaWorker;

  beforeAll(async () => {
    prisma = new PrismaClient();

    // PeriodService module
    const periodMod = await Test.createTestingModule({
      providers: [
        PeriodService,
        { provide: PrismaService, useValue: prisma },
        AuditLogService,
        WorkPaceService,
      ],
    }).compile();
    periodSvc = periodMod.get(PeriodService);

    // DisputeService module (mock SLA so it doesn't need Bull)
    const mockSla = { scheduleEvents: jest.fn().mockResolvedValue(undefined) };
    const disputeMod = await Test.createTestingModule({
      providers: [
        DisputeService,
        { provide: PrismaService, useValue: prisma },
        { provide: DisputeSlaService, useValue: mockSla },
      ],
    }).compile();
    disputeSvc = disputeMod.get(DisputeService);

    // DisputeSlaWorker — mock DisputeSlaService.recoverPending (called in onModuleInit)
    const workerMod = await Test.createTestingModule({
      providers: [
        DisputeSlaWorker,
        { provide: PrismaService, useValue: prisma },
        { provide: DisputeSlaService, useValue: { recoverPending: jest.fn().mockResolvedValue(0) } },
      ],
    }).compile();
    worker = workerMod.get(DisputeSlaWorker);
  });

  afterAll(async () => { await prisma.$disconnect(); });
  beforeEach(async () => { await truncateAll(prisma); });

  async function bootstrap() {
    const org = await makeOrg(prisma);
    const sc = await makeUser(prisma, org, 'stroycontrol');
    const dir = await makeUser(prisma, org, 'director');
    const obj = await makeObject(prisma, org);
    const boq = await makeBoQ(prisma, obj, { count: 1 });
    await makeApprovedZeroReport(prisma, obj, dir);
    return { org, sc, dir, obj, boq };
  }

  // @algorithm: D-03
  it('D-03: notify_director handler — creates sla_day3_no_gp_response notification', async () => {
    const { sc, dir, obj, boq } = await bootstrap();

    const period = await periodSvc.openPeriod(obj.id, sc.id);

    const slaEvent = await prisma.slaEvent.create({
      data: {
        periodId: period.id,
        boqItemId: boq.items[0].id,
        scenario: 'A',
        eventType: 'notify_director_day3',
        scheduledAt: new Date(),
      },
    });

    await worker.process({ data: { slaEventId: slaEvent.id } } as any);

    const notification = await prisma.notification.findFirst({
      where: { userId: dir.id, type: 'sla_day3_no_gp_response' },
    });
    expect(notification).not.toBeNull();
    expect(notification!.message).toContain('Сценарий A');

    const updated = await prisma.slaEvent.findUniqueOrThrow({ where: { id: slaEvent.id } });
    expect(updated.executedAt).not.toBeNull();
  });

  // @algorithm: D-04
  it('D-04: force_close handler — closes discrepancy, sets forced_sc_figure', async () => {
    const { sc, obj, boq } = await bootstrap();

    const period = await periodSvc.openPeriod(obj.id, sc.id);
    await periodSvc.submitGp(
      period.gpSubmissionToken!,
      'GP Test Org',
      [{ boqItemId: boq.items[0].id, gpVolume: 100 }],
    );
    await periodSvc.upsertPeriodFact(period.id, boq.items[0].id, 80, sc.id);

    await prisma.photo.create({
      data: {
        periodId: period.id,
        boqItemId: boq.items[0].id,
        filePath: '/uploads/d04-evidence.jpg',
        uploadedBy: sc.id,
      },
    });

    const discrepancy = await disputeSvc.createDispute(
      period.id,
      boq.items[0].id,
      sc.id,
      { disputeReason: 'Access blocked' },
    );
    expect(discrepancy.status).toBe('open');

    const slaEvent = await prisma.slaEvent.create({
      data: {
        periodId: period.id,
        boqItemId: boq.items[0].id,
        scenario: 'A',
        eventType: 'force_close_day5',
        scheduledAt: new Date(),
      },
    });

    await worker.process({ data: { slaEventId: slaEvent.id } } as any);

    const updatedDiscrepancy = await prisma.discrepancy.findUniqueOrThrow({
      where: { id: discrepancy.id },
    });
    expect(updatedDiscrepancy.status).toBe('forced_sc_figure');
    expect(updatedDiscrepancy.resolvedAt).not.toBeNull();

    const fact = await prisma.periodFact.findFirst({
      where: { periodId: period.id, boqItemId: boq.items[0].id },
      select: { discrepancyStatus: true, acceptedVolume: true, scVolume: true },
    });
    expect(fact!.discrepancyStatus).toBe('forced_sc_figure');
    expect(Number(fact!.acceptedVolume)).toBe(Number(fact!.scVolume));

    const updated = await prisma.slaEvent.findUniqueOrThrow({ where: { id: slaEvent.id } });
    expect(updated.executedAt).not.toBeNull();
  });

  // @algorithm: D-05
  it('D-05: Scenario B day 3 — notify_director handler sends the active-dispute message', async () => {
    const { sc, dir, obj, boq } = await bootstrap();
    const period = await periodSvc.openPeriod(obj.id, sc.id);

    const slaEvent = await prisma.slaEvent.create({
      data: {
        periodId: period.id,
        boqItemId: boq.items[0].id,
        scenario: 'B',
        eventType: 'notify_director_day3',
        scheduledAt: new Date(),
      },
    });

    await worker.process({ data: { slaEventId: slaEvent.id } } as any);

    const notification = await prisma.notification.findFirst({
      where: { userId: dir.id, type: 'sla_day3_active_dispute' },
    });
    expect(notification).not.toBeNull();
    expect(notification!.message).toContain('Сценарий B');

    const updated = await prisma.slaEvent.findUniqueOrThrow({ where: { id: slaEvent.id } });
    expect(updated.executedAt).not.toBeNull();
  });

  // @algorithm: D-06
  it('D-06: Scenario B day 14 — sc_figure_applied handler applies SC volume, same as force_close', async () => {
    const { sc, obj, boq } = await bootstrap();

    const period = await periodSvc.openPeriod(obj.id, sc.id);
    await periodSvc.submitGp(
      period.gpSubmissionToken!,
      'GP Test Org',
      [{ boqItemId: boq.items[0].id, gpVolume: 100 }],
    );
    await periodSvc.upsertPeriodFact(period.id, boq.items[0].id, 80, sc.id);

    await prisma.photo.create({
      data: {
        periodId: period.id,
        boqItemId: boq.items[0].id,
        filePath: '/uploads/d06-evidence.jpg',
        uploadedBy: sc.id,
      },
    });

    const discrepancy = await disputeSvc.createDispute(
      period.id,
      boq.items[0].id,
      sc.id,
      { disputeReason: 'GP docs disputed' },
    );
    expect(discrepancy.status).toBe('open');

    const slaEvent = await prisma.slaEvent.create({
      data: {
        periodId: period.id,
        boqItemId: boq.items[0].id,
        scenario: 'B',
        eventType: 'sc_figure_applied_day14',
        scheduledAt: new Date(),
      },
    });

    await worker.process({ data: { slaEventId: slaEvent.id } } as any);

    const updatedDiscrepancy = await prisma.discrepancy.findUniqueOrThrow({
      where: { id: discrepancy.id },
    });
    expect(updatedDiscrepancy.status).toBe('forced_sc_figure');

    const fact = await prisma.periodFact.findFirst({
      where: { periodId: period.id, boqItemId: boq.items[0].id },
      select: { discrepancyStatus: true, acceptedVolume: true, scVolume: true },
    });
    expect(fact!.discrepancyStatus).toBe('forced_sc_figure');
    expect(Number(fact!.acceptedVolume)).toBe(Number(fact!.scVolume));

    const updated = await prisma.slaEvent.findUniqueOrThrow({ where: { id: slaEvent.id } });
    expect(updated.executedAt).not.toBeNull();
  });
});
