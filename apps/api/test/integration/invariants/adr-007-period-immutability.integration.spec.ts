// apps/api/test/integration/invariants/adr-007-period-immutability.integration.spec.ts
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaClient, Prisma } from '@ccip/database';
import { PrismaService } from '../../../src/common/prisma/prisma.service';
import { AuditLogService } from '../../../src/common/audit/audit-log.service';
import { WorkPaceService } from '../../../src/modules/analytics/work-pace.service';
import { PeriodService } from '../../../src/modules/period/period.service';
import { makeOrg, makeUser, makeObject, makeBoQ, makeApprovedZeroReport, makeClosedPeriod } from '../fixtures/factories';
import { truncateAll } from '../setup/truncate';

describe('ADR-007 — period immutability after close', () => {
  let prisma: PrismaClient;
  let svc: PeriodService;

  beforeAll(async () => {
    prisma = new PrismaClient();
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        PeriodService,
        { provide: PrismaService, useValue: prisma },
        AuditLogService,
        WorkPaceService,
      ],
    }).compile();
    svc = mod.get(PeriodService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  it('Closed period rejects upsertPeriodFact', async () => {
    const org = await makeOrg(prisma);
    const sc = await makeUser(prisma, org, 'stroycontrol');
    const dir = await makeUser(prisma, org, 'director');
    const obj = await makeObject(prisma, org);
    const boq = await makeBoQ(prisma, obj, { count: 3 });
    await makeApprovedZeroReport(prisma, obj, dir);
    const period = await makeClosedPeriod(prisma, obj, boq, sc, 1);

    await expect(
      svc.upsertPeriodFact(period.id, boq.items[0].id, { scVolume: 50 }, sc.id),
    ).rejects.toThrow(/PERIOD_(NOT_OPEN|CLOSED|IMMUTABLE|ALREADY_CLOSED)/);
  });

  it('Re-closing already-closed period is rejected', async () => {
    const org = await makeOrg(prisma);
    const sc = await makeUser(prisma, org, 'stroycontrol');
    const dir = await makeUser(prisma, org, 'director');
    const obj = await makeObject(prisma, org);
    const boq = await makeBoQ(prisma, obj, { count: 3 });
    await makeApprovedZeroReport(prisma, obj, dir);
    const period = await makeClosedPeriod(prisma, obj, boq, sc, 1);

    await expect(svc.closePeriod(period.id, sc.id)).rejects.toThrow(/PERIOD_(NOT_OPEN|ALREADY_CLOSED)/);
  });

  it('ccip_app role cannot UPDATE period_facts directly — REVOKE P-25 (ADR-007)', async () => {
    const org = await makeOrg(prisma);
    const sc = await makeUser(prisma, org, 'stroycontrol');
    const dir = await makeUser(prisma, org, 'director');
    const obj = await makeObject(prisma, org);
    const boq = await makeBoQ(prisma, obj, { count: 1 });
    await makeApprovedZeroReport(prisma, obj, dir);
    const period = await makeClosedPeriod(prisma, obj, boq, sc, 1);

    // INSERT is allowed for ccip_app (needed for GP submit / SC fact entry)
    const fact = await prisma.periodFact.create({
      data: {
        periodId: period.id,
        boqItemId: boq.items[0].id,
        scVolume: new Prisma.Decimal(100),
      },
    });

    // Direct UPDATE must be rejected by PostgreSQL (error 42501 permission denied)
    await expect(
      prisma.$executeRaw`UPDATE period_facts SET sc_volume = 200 WHERE id = ${fact.id}`,
    ).rejects.toMatchObject({
      message: expect.stringMatching(/permission denied/i),
    });
  });
});
