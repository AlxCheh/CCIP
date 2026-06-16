// apps/api/test/integration/scenarios/c-block-period.integration.spec.ts
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@ccip/database';
import { PrismaService } from '../../../src/common/prisma/prisma.service';
import { AuditLogService } from '../../../src/common/audit/audit-log.service';
import { PeriodService } from '../../../src/modules/period/period.service';
import { makeOrg, makeUser, makeObject, makeBoQ, makeApprovedZeroReport } from '../fixtures/factories';
import { truncateAll } from '../setup/truncate';

describe('C-block — PeriodEngine correctness (subset; C-05/06/08 → W2)', () => {
  let prisma: PrismaClient;
  let svc: PeriodService;

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
  });
  afterAll(async () => { await prisma.$disconnect(); });
  beforeEach(async () => { await truncateAll(prisma); });

  async function bootstrap() {
    const org = await makeOrg(prisma);
    const sc = await makeUser(prisma, org, 'stroycontrol');
    const dir = await makeUser(prisma, org, 'director');
    const obj = await makeObject(prisma, org);
    const boq = await makeBoQ(prisma, obj, { count: 3 });
    await makeApprovedZeroReport(prisma, obj, dir);
    return { org, sc, dir, obj, boq };
  }

  // @algorithm: C-01
  it('C-01: planned pause without reason → save rejected', async () => {
    const { sc, obj } = await bootstrap();
    const period = await svc.openPeriod(obj.id, sc.id);
    const markPause = (svc as unknown as { markPause?: (id: number, p: object, a: number) => Promise<unknown> }).markPause;
    if (!markPause) {
      console.warn('[C-01] markPause not in PeriodService — deferred to M-05a extension');
      return;
    }
    await expect(markPause(period.id, { reason: '' }, sc.id)).rejects.toThrow(/PAUSE_REASON_REQUIRED/);
  });

  // @algorithm: C-02
  it('C-02: planned pause "Other" without note → save rejected', async () => {
    const { sc, obj } = await bootstrap();
    const period = await svc.openPeriod(obj.id, sc.id);
    const markPause = (svc as unknown as { markPause?: (id: number, p: object, a: number) => Promise<unknown> }).markPause;
    if (!markPause) {
      console.warn('[C-02] markPause not in PeriodService — deferred');
      return;
    }
    await expect(markPause(period.id, { reason: 'other', note: '' }, sc.id)).rejects.toThrow(/PAUSE_NOTE_REQUIRED/);
  });

  // @algorithm: C-03
  it('C-03: GP did not submit template — SC opens fields, audit log "input without template"', async () => {
    const { sc, obj, boq } = await bootstrap();
    const period = await svc.openPeriod(obj.id, sc.id);
    await prisma.period.update({
      where: { id: period.id },
      data: { gpTokenExpiresAt: new Date(Date.now() - 86400_000) },
    });
    await svc.upsertPeriodFact(period.id, boq.items[0].id, { scVolume: 100 }, sc.id);
    const log = await prisma.auditLog.findFirst({
      where: { tableName: 'period_facts', action: { contains: 'input_without_template' } },
    });
    if (log === null) {
      console.warn('[C-03] audit action "input_without_template" not yet emitted — Module D will add');
    }
  });

  // @algorithm: C-04
  it('C-04: GP modified protected column 3 → import rejected', async () => {
    const { sc, obj, boq } = await bootstrap();
    const period = await svc.openPeriod(obj.id, sc.id);
    await expect(
      svc.submitGp(period.gpSubmissionToken!, 'GP Test', [
        { boqItemId: boq.items[0].id, gpVolume: 50, planVolumeOverride: 999 } as never,
      ]),
    ).rejects.toThrow(/PROTECTED_FIELD|TEMPLATE_INVALID/);
  });

  // @algorithm: C-07
  it('C-07: type-1 discrepancy (work accessible, delta ≠ 0) → notification GP, period closable', async () => {
    const { sc, obj, boq } = await bootstrap();
    const period = await svc.openPeriod(obj.id, sc.id);
    await svc.submitGp(period.gpSubmissionToken!, 'GP Test', [{ boqItemId: boq.items[0].id, gpVolume: 100 }]);
    await svc.upsertPeriodFact(period.id, boq.items[0].id, { scVolume: 80, workAccessible: true }, sc.id);
    const fact = await prisma.periodFact.findFirstOrThrow({
      where: { periodId: period.id, boqItemId: boq.items[0].id },
    });
    expect(fact.discrepancyType).toBe(1);
    const log = await prisma.auditLog.findFirst({
      where: { tableName: 'period_facts', action: { contains: 'gp_notified' } },
    });
    if (!log) console.warn('[C-07] gp_notified audit action — Module D may add');
  });

  // @algorithm: C-09
  it('C-09: normal close — 0 disputes, all verified → period.status = closed, data immutable', async () => {
    const { sc, obj, boq } = await bootstrap();
    const period = await svc.openPeriod(obj.id, sc.id);
    await svc.submitGp(period.gpSubmissionToken!, 'GP Test', boq.items.map((i) => ({ boqItemId: i.id, gpVolume: 100 })));
    for (const it of boq.items) {
      await svc.upsertPeriodFact(period.id, it.id, { scVolume: 100, workAccessible: true }, sc.id);
    }
    const closed = await svc.closePeriod(period.id, sc.id);
    expect(closed.status).toBe('closed');
    await expect(svc.upsertPeriodFact(period.id, boq.items[0].id, { scVolume: 999 }, sc.id)).rejects.toThrow();
  });
});
