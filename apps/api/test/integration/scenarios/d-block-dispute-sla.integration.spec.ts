// apps/api/test/integration/scenarios/d-block-dispute-sla.integration.spec.ts
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@ccip/database';
import { PrismaService } from '../../../src/common/prisma/prisma.service';
import { AuditLogService } from '../../../src/common/audit/audit-log.service';
import { PeriodService } from '../../../src/modules/period/period.service';
import { DisputeService } from '../../../src/modules/dispute/dispute.service';
import { DisputeSlaService } from '../../../src/modules/dispute-sla/dispute-sla.service';
import { DisputeFlagService } from '../../../src/modules/dispute/dispute-flag.service';
import { makeOrg, makeUser, makeObject, makeBoQ, makeApprovedZeroReport, makeClosedPeriod } from '../fixtures/factories';
import { truncateAll } from '../setup/truncate';

describe('D-block — DisputeSLA / systemic flag', () => {
  let prisma: PrismaClient;
  let svc: PeriodService;
  let disputeSvc: DisputeService;
  let flagSvc: DisputeFlagService;

  beforeAll(async () => {
    prisma = new PrismaClient();

    const mod = await Test.createTestingModule({
      providers: [
        PeriodService,
        { provide: PrismaService, useValue: prisma },
        AuditLogService,
      ],
    }).compile();
    svc = mod.get(PeriodService);

    const mockSla = { scheduleEvents: jest.fn().mockResolvedValue(undefined) };
    const disputeMod = await Test.createTestingModule({
      providers: [
        DisputeService,
        { provide: PrismaService, useValue: prisma },
        { provide: DisputeSlaService, useValue: mockSla },
      ],
    }).compile();
    disputeSvc = disputeMod.get(DisputeService);

    const flagMod = await Test.createTestingModule({
      providers: [
        DisputeFlagService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    flagSvc = flagMod.get(DisputeFlagService);
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

  // @algorithm: D-01
  it('D-01: type 1 — GP=100 SC=80, discrepancyType=1 on periodFact', async () => {
    const { sc, obj, boq } = await bootstrap();
    const period = await svc.openPeriod(obj.id, sc.id);

    await svc.submitGp(
      period.gpSubmissionToken,
      'GP Test Organization',
      [{ boqItemId: boq.items[0].id, gpVolume: 100 }],
    );

    await svc.upsertPeriodFact(period.id, boq.items[0].id, 80, sc.id);

    const fact = await prisma.periodFact.findFirst({
      where: { periodId: period.id, boqItemId: boq.items[0].id },
      select: { discrepancyType: true, gpVolume: true, scVolume: true },
    });

    expect(Number(fact!.gpVolume)).toBe(100);
    expect(Number(fact!.scVolume)).toBe(80);
    expect(fact!.discrepancyType).toBe(1);
  });

  // @algorithm: D-02
  it('D-02: type 2 — SC raises dispute, discrepancy created with type 2', async () => {
    const { sc, obj, boq } = await bootstrap();
    const period = await svc.openPeriod(obj.id, sc.id);

    await svc.submitGp(
      period.gpSubmissionToken,
      'GP Test Organization',
      [{ boqItemId: boq.items[0].id, gpVolume: 100 }],
    );
    await svc.upsertPeriodFact(period.id, boq.items[0].id, 80, sc.id);

    await prisma.photo.create({
      data: {
        periodId: period.id,
        boqItemId: boq.items[0].id,
        filePath: '/uploads/test-evidence.jpg',
        uploadedBy: sc.id,
      },
    });

    const discrepancy = await disputeSvc.createDispute(
      period.id,
      boq.items[0].id,
      sc.id,
      { disputeReason: 'Work buried under debris, access blocked' },
    );

    expect(discrepancy.type).toBe(2);
    expect(discrepancy.status).toBe('open');

    const fact = await prisma.periodFact.findFirst({
      where: { periodId: period.id, boqItemId: boq.items[0].id },
      select: { discrepancyType: true },
    });
    expect(fact!.discrepancyType).toBe(2);
  });
  // @algorithm: D-03
  it.skip('D-03: SLA A day 3 — director auto-notified (requires BullMQ time-mock)', () => {});
  // @algorithm: D-04
  it.skip('D-04: SLA A day 5 — forced close (requires BullMQ time-mock)', () => {});
  // @algorithm: D-05
  it.skip('D-05: SLA B day 3 — director escalation (requires BullMQ time-mock)', () => {});
  // @algorithm: D-06
  it.skip('D-06: SLA B day 14 — SC volume applied (requires BullMQ time-mock)', () => {});
  // @algorithm: D-07 — implemented in Task 3
  // @algorithm: D-08 — implemented in Task 3
  // @algorithm: D-09
  it.skip('D-09: type 3 — director manual resolve (clearSystemicFlag not yet implemented)', () => {});
});
