// apps/api/test/integration/invariants/adr-007-period-immutability.integration.spec.ts
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@ccip/database';
import { PrismaService } from '../../../src/common/prisma/prisma.service';
import { AuditLogService } from '../../../src/common/audit/audit-log.service';
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
});
