// @algorithm: ADR-002
// Property-based: advisory lock guarantees ровно 1 победитель среди N
// конкурентных OpenPeriod на один объект. Реализация — pg_advisory_xact_lock
// в PeriodService.openPeriod (см. period.service.ts:31).
import { Test, type TestingModule } from '@nestjs/testing';
import * as fc from 'fast-check';
import { PrismaClient } from '@ccip/database';
import { PrismaService } from '../../../src/common/prisma/prisma.service';
import { AuditLogService } from '../../../src/common/audit/audit-log.service';
import { PeriodService } from '../../../src/modules/period/period.service';
import {
  makeOrg,
  makeUser,
  makeObject,
  makeBoQ,
  makeApprovedZeroReport,
} from '../fixtures/factories';
import { truncateAll } from '../setup/truncate';
import { arbConcurrency } from '../fixtures/arbitraries';
import { FAST_CHECK_RUNS, FAST_CHECK_SEED } from '../setup/env';

describe('ADR-002 — period concurrency (advisory lock)', () => {
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

  it('N concurrent OpenPeriod → exactly 1 succeeds, others throw PERIOD_ALREADY_OPEN or PERIOD_LOCK_TIMEOUT', async () => {
    await fc.assert(
      fc.asyncProperty(arbConcurrency, async (n) => {
        await truncateAll(prisma);
        const org = await makeOrg(prisma);
        const director = await makeUser(prisma, org, 'director');
        const sc = await makeUser(prisma, org, 'stroycontrol');
        const obj = await makeObject(prisma, org);
        await makeBoQ(prisma, obj, { count: 3 });
        await makeApprovedZeroReport(prisma, obj, director);

        const settled = await Promise.allSettled(
          Array.from({ length: n }, () => svc.openPeriod(obj.id, sc.id)),
        );
        const fulfilled = settled.filter((r) => r.status === 'fulfilled');
        const rejected = settled.filter(
          (r) => r.status === 'rejected',
        ) as PromiseRejectedResult[];

        expect(fulfilled).toHaveLength(1);
        for (const r of rejected) {
          const msg = (r.reason as Error).message;
          expect(['PERIOD_ALREADY_OPEN', 'PERIOD_LOCK_TIMEOUT']).toContain(msg);
        }
      }),
      { numRuns: FAST_CHECK_RUNS, seed: FAST_CHECK_SEED, verbose: 1 },
    );
  });

  it('OpenPeriod blocked when ZeroReport not approved → ZERO_REPORT_NOT_APPROVED', async () => {
    await truncateAll(prisma);
    const org = await makeOrg(prisma);
    const sc = await makeUser(prisma, org, 'stroycontrol');
    const obj = await makeObject(prisma, org);
    await makeBoQ(prisma, obj, { count: 3 });
    // intentionally: no zero report

    await expect(svc.openPeriod(obj.id, sc.id)).rejects.toThrow(
      'ZERO_REPORT_NOT_APPROVED',
    );
  });
});
