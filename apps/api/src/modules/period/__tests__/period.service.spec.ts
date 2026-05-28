import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { PeriodService } from '../period.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditLogService } from '../../../common/audit/audit-log.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const ORG_ID = 'org-uuid-001';
const ACTOR_ID = 1;
const OBJECT_ID = 10;
const BOQ_VERSION_ID = 5;
const PERIOD_ID = 100;
const BOQ_ITEM_ID = 50;
const PERIOD_FACT_ID = 200;
const GP_TOKEN = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

// Prisma Decimal-compatible: in tests we use plain numbers/strings since
// service logic uses Decimal.sub() etc. — we verify call args via toEqual
const vol = (v: string | number) => v;

// ─── Factories ───────────────────────────────────────────────────────────────

const makePeriod = (overrides: Record<string, unknown> = {}) => ({
  id: PERIOD_ID,
  objectId: OBJECT_ID,
  periodNumber: 1,
  boqVersionId: BOQ_VERSION_ID,
  status: 'open',
  openedAt: new Date('2026-05-01T10:00:00Z'),
  openedBy: ACTOR_ID,
  gpSubmissionToken: GP_TOKEN,
  gpTokenExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // +14 days
  gpSubmittedAt: null,
  gpSubmittedByName: null,
  closedAt: null,
  closedBy: null,
  isZeroPeriod: false,
  zeroPeriodReason: null,
  object: { organizationId: ORG_ID },
  periodFacts: [],
  ...overrides,
});

const makePeriodFact = (overrides: Record<string, unknown> = {}) => ({
  id: PERIOD_FACT_ID,
  periodId: PERIOD_ID,
  boqItemId: BOQ_ITEM_ID,
  gpVolume: vol('100'),
  gpNote: null,
  scVolume: null,
  acceptedVolume: null,
  discrepancyType: null,
  discrepancyStatus: null,
  overrunPct: null,
  overrunNote: null,
  isSpike: false,
  spikeResponse: null,
  version: 1,
  ...overrides,
});

// ─── Mock Setup ──────────────────────────────────────────────────────────────

describe('PeriodService', () => {
  let service: PeriodService;
  let prisma: jest.Mocked<PrismaService>;
  let auditLog: jest.Mocked<AuditLogService>;
  let analyticsQueue: { add: jest.Mock };

  beforeEach(async () => {
    prisma = {
      constructionObject: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ organizationId: ORG_ID }),
      },
      zeroReport: {
        findFirst: jest.fn().mockResolvedValue({ id: 1, status: 'approved' }),
      },
      user: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ organizationId: ORG_ID }),
      },
      period: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue(makePeriod({ status: 'verification' })),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue(makePeriod()),
        update: jest.fn().mockResolvedValue(makePeriod({ status: 'closed' })),
      },
      boqVersion: {
        findFirstOrThrow: jest.fn().mockResolvedValue({ id: BOQ_VERSION_ID }),
      },
      periodFact: {
        findFirst: jest.fn().mockResolvedValue(makePeriodFact()),
        upsert: jest.fn().mockResolvedValue(makePeriodFact()),
        update: jest.fn().mockResolvedValue(makePeriodFact()),
      },
      discrepancy: {
        count: jest.fn().mockResolvedValue(0),
      },
      readinessSnapshot: {
        create: jest.fn().mockResolvedValue({ id: 1 }),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest
        .fn()
        .mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma)),
    } as unknown as jest.Mocked<PrismaService>;

    auditLog = {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditLogService>;

    analyticsQueue = {
      add: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        PeriodService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLog },
        { provide: getQueueToken('analytics'), useValue: analyticsQueue },
      ],
    }).compile();

    service = module.get(PeriodService);
  });

  // ─── openPeriod ─────────────────────────────────────────────────────────────

  describe('openPeriod', () => {
    it('creates a period with status open', async () => {
      (prisma.period.findFirst as jest.Mock)
        .mockResolvedValueOnce(null) // no open period
        .mockResolvedValueOnce(null); // no last period

      const result = await service.openPeriod(OBJECT_ID, ACTOR_ID);

      expect(prisma.period.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            objectId: OBJECT_ID,
            status: 'open',
            openedBy: ACTOR_ID,
          }),
        }),
      );
      expect(result.status).toBe('open');
    });

    it('generates gpSubmissionToken (UUID format)', async () => {
      (prisma.period.findFirst as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      await service.openPeriod(OBJECT_ID, ACTOR_ID);

      const createCall = (prisma.period.create as jest.Mock).mock
        .calls[0][0] as {
        data: { gpSubmissionToken: unknown };
      };
      const token = createCall.data.gpSubmissionToken;
      expect(typeof token).toBe('string');
      // UUID v4 regex
      expect(token).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('sets slaForceCloseAt to ~14 days from now and gpTokenExpiresAt 1h before it', async () => {
      (prisma.period.findFirst as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const before = Date.now();
      await service.openPeriod(OBJECT_ID, ACTOR_ID);
      const after = Date.now();

      const createCall = (prisma.period.create as jest.Mock).mock
        .calls[0][0] as {
        data: { gpTokenExpiresAt: Date; slaForceCloseAt: Date };
      };
      const slaForceCloseAt = createCall.data.slaForceCloseAt;
      const expiresAt = createCall.data.gpTokenExpiresAt;
      const msIn14Days = 14 * 24 * 60 * 60 * 1000;
      const oneHourMs = 60 * 60 * 1000;

      // slaForceCloseAt = now + 14d
      expect(slaForceCloseAt.getTime()).toBeGreaterThanOrEqual(
        before + msIn14Days - 1000,
      );
      expect(slaForceCloseAt.getTime()).toBeLessThanOrEqual(
        after + msIn14Days + 1000,
      );
      // gpTokenExpiresAt = slaForceCloseAt - 1h (exact contract)
      expect(expiresAt.getTime()).toBe(slaForceCloseAt.getTime() - oneHourMs);
    });

    it('throws ForbiddenException if zero report is not approved', async () => {
      (prisma.zeroReport.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.openPeriod(OBJECT_ID, ACTOR_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws ForbiddenException with ZERO_REPORT_NOT_APPROVED code', async () => {
      (prisma.zeroReport.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.openPeriod(OBJECT_ID, ACTOR_ID)).rejects.toThrow(
        'ZERO_REPORT_NOT_APPROVED',
      );
    });

    it('throws ConflictException if period already open for object', async () => {
      (prisma.period.findFirst as jest.Mock).mockResolvedValue(
        makePeriod({ status: 'open' }),
      );

      await expect(service.openPeriod(OBJECT_ID, ACTOR_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws ConflictException with PERIOD_ALREADY_OPEN code', async () => {
      (prisma.period.findFirst as jest.Mock).mockResolvedValue(
        makePeriod({ status: 'open' }),
      );

      await expect(service.openPeriod(OBJECT_ID, ACTOR_ID)).rejects.toThrow(
        'PERIOD_ALREADY_OPEN',
      );
    });

    it('logs audit event after successful open', async () => {
      (prisma.period.findFirst as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      await service.openPeriod(OBJECT_ID, ACTOR_ID);

      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'period_opened',
          performedBy: ACTOR_ID,
        }),
      );
    });

    it('increments periodNumber based on last period', async () => {
      (prisma.period.findFirst as jest.Mock)
        .mockResolvedValueOnce(null) // no open period check
        .mockResolvedValueOnce(makePeriod({ periodNumber: 3 })); // last period

      await service.openPeriod(OBJECT_ID, ACTOR_ID);

      const createCall = (prisma.period.create as jest.Mock).mock
        .calls[0][0] as {
        data: { periodNumber: number };
      };
      expect(createCall.data.periodNumber).toBe(4);
    });

    it('throws PERIOD_LOCK_TIMEOUT when advisory lock times out', async () => {
      const lockTimeoutError = Object.assign(new Error('lock timeout'), {
        code: '55P03',
      });
      (prisma.$transaction as jest.Mock).mockRejectedValue(lockTimeoutError);
      await expect(service.openPeriod(OBJECT_ID, ACTOR_ID)).rejects.toThrow(
        'PERIOD_LOCK_TIMEOUT',
      );
    });
  });

  // ─── findById ────────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns period with periodFacts when found', async () => {
      const periodWithFacts = makePeriod({
        periodFacts: [makePeriodFact()],
      });
      (prisma.period.findFirst as jest.Mock).mockResolvedValue(periodWithFacts);

      const result = await service.findById(PERIOD_ID, ACTOR_ID);

      expect(prisma.period.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: PERIOD_ID }),
          include: expect.objectContaining({ periodFacts: true }),
        }),
      );
      expect(result.id).toBe(PERIOD_ID);
    });

    it('throws NotFoundException when period does not exist', async () => {
      (prisma.period.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.findById(PERIOD_ID, ACTOR_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException with PERIOD_NOT_FOUND code', async () => {
      (prisma.period.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.findById(PERIOD_ID, ACTOR_ID)).rejects.toThrow(
        'PERIOD_NOT_FOUND',
      );
    });

    it('throws PERIOD_NOT_FOUND if period belongs to different organization', async () => {
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        organizationId: 'other-org',
      } as any);
      (prisma.period.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(service.findById(PERIOD_ID, ACTOR_ID)).rejects.toThrow(
        'PERIOD_NOT_FOUND',
      );
    });
  });

  // ─── submitGp ────────────────────────────────────────────────────────────────

  describe('submitGp', () => {
    const GP_VOL = 100;
    const gpItems = [
      {
        boqItemId: BOQ_ITEM_ID,
        gpVolume: GP_VOL,
        gpNote: 'ok' as string | undefined,
      },
    ];
    const GP_NAME = 'Ivan Petrov';

    beforeEach(() => {
      // Default: findFirst returns a valid open period with token
      (prisma.period.findFirst as jest.Mock).mockResolvedValue(
        makePeriod({ gpSubmittedAt: null }),
      );
    });

    it('upserts periodFact for each item', async () => {
      await service.submitGp(GP_TOKEN, GP_NAME, gpItems);

      expect(prisma.periodFact.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.periodFact.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            periodId_boqItemId: { periodId: PERIOD_ID, boqItemId: BOQ_ITEM_ID },
          },
        }),
      );
    });

    it('updates period status to gp_submitted and sets gpSubmittedAt', async () => {
      await service.submitGp(GP_TOKEN, GP_NAME, gpItems);

      expect(prisma.period.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: PERIOD_ID },
          data: expect.objectContaining({
            status: 'gp_submitted',
            gpSubmittedByName: GP_NAME,
          }),
        }),
      );
      const updateCall = (prisma.period.update as jest.Mock).mock
        .calls[0][0] as {
        data: { gpSubmittedAt: unknown };
      };
      expect(updateCall.data.gpSubmittedAt).toBeInstanceOf(Date);
    });

    it('throws NotFoundException with GP_TOKEN_NOT_FOUND if token unknown', async () => {
      (prisma.period.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.submitGp('bad-token', GP_NAME, gpItems),
      ).rejects.toThrow('GP_TOKEN_NOT_FOUND');
    });

    it('throws NotFoundException if token not found', async () => {
      (prisma.period.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.submitGp('bad-token', GP_NAME, gpItems),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException with GP_ALREADY_SUBMITTED if already submitted', async () => {
      (prisma.period.findFirst as jest.Mock).mockResolvedValue(
        makePeriod({ gpSubmittedAt: new Date('2026-05-01T12:00:00Z') }),
      );

      await expect(
        service.submitGp(GP_TOKEN, GP_NAME, gpItems),
      ).rejects.toThrow('GP_ALREADY_SUBMITTED');
    });

    it('throws ForbiddenException if GP already submitted', async () => {
      (prisma.period.findFirst as jest.Mock).mockResolvedValue(
        makePeriod({ gpSubmittedAt: new Date('2026-05-01T12:00:00Z') }),
      );

      await expect(
        service.submitGp(GP_TOKEN, GP_NAME, gpItems),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws PERIOD_WRONG_STATUS if period is not open', async () => {
      (prisma.period.findFirst as jest.Mock).mockResolvedValue(
        makePeriod({ status: 'force_closed', gpSubmittedAt: null }),
      );
      await expect(
        service.submitGp(GP_TOKEN, GP_NAME, gpItems),
      ).rejects.toThrow('PERIOD_WRONG_STATUS');
    });

    it('throws ForbiddenException with GP_TOKEN_EXPIRED if token expired', async () => {
      (prisma.period.findFirst as jest.Mock).mockResolvedValue(
        makePeriod({
          gpSubmittedAt: null,
          gpTokenExpiresAt: new Date(Date.now() - 1000), // past
        }),
      );

      await expect(
        service.submitGp(GP_TOKEN, GP_NAME, gpItems),
      ).rejects.toThrow('GP_TOKEN_EXPIRED');
    });

    it('throws ForbiddenException if token is expired', async () => {
      (prisma.period.findFirst as jest.Mock).mockResolvedValue(
        makePeriod({
          gpSubmittedAt: null,
          gpTokenExpiresAt: new Date(Date.now() - 1000),
        }),
      );

      await expect(
        service.submitGp(GP_TOKEN, GP_NAME, gpItems),
      ).rejects.toThrow(ForbiddenException);
    });

    it('logs audit event on successful submission', async () => {
      await service.submitGp(GP_TOKEN, GP_NAME, gpItems);

      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'gp_submitted',
        }),
      );
    });
  });

  // ─── upsertPeriodFact ────────────────────────────────────────────────────────

  describe('upsertPeriodFact', () => {
    const SC_VOLUME = 100;

    beforeEach(() => {
      (prisma.period.findUniqueOrThrow as jest.Mock).mockResolvedValue(
        makePeriod({ status: 'gp_submitted' }),
      );
      (prisma.periodFact.upsert as jest.Mock).mockResolvedValue(
        makePeriodFact({ gpVolume: 100 }),
      );
    });

    it('throws ConflictException if period status is open', async () => {
      (prisma.period.findUniqueOrThrow as jest.Mock).mockResolvedValue(
        makePeriod({ status: 'open' }),
      );

      await expect(
        service.upsertPeriodFact(PERIOD_ID, BOQ_ITEM_ID, SC_VOLUME, ACTOR_ID),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException with PERIOD_WRONG_STATUS if period is open', async () => {
      (prisma.period.findUniqueOrThrow as jest.Mock).mockResolvedValue(
        makePeriod({ status: 'open' }),
      );

      await expect(
        service.upsertPeriodFact(PERIOD_ID, BOQ_ITEM_ID, SC_VOLUME, ACTOR_ID),
      ).rejects.toThrow('PERIOD_WRONG_STATUS');
    });

    it('throws ConflictException with PERIOD_WRONG_STATUS if period is closed', async () => {
      (prisma.period.findUniqueOrThrow as jest.Mock).mockResolvedValue(
        makePeriod({ status: 'closed' }),
      );

      await expect(
        service.upsertPeriodFact(PERIOD_ID, BOQ_ITEM_ID, SC_VOLUME, ACTOR_ID),
      ).rejects.toThrow('PERIOD_WRONG_STATUS');
    });

    it('sets discrepancyType=null and discrepancyStatus=confirmed when gpVolume equals scVolume', async () => {
      // gpVolume = 100, scVolume = 100, delta = 0
      await service.upsertPeriodFact(
        PERIOD_ID,
        BOQ_ITEM_ID,
        100, // same as gpVolume mock
        ACTOR_ID,
      );

      const upsertCall = (prisma.periodFact.upsert as jest.Mock).mock
        .calls[0][0] as {
        update: {
          scVolume: unknown;
          discrepancyType: unknown;
          discrepancyStatus: unknown;
          acceptedVolume: unknown;
        };
      };
      expect(upsertCall.update.discrepancyType).toBeNull();
      expect(upsertCall.update.discrepancyStatus).toBe('confirmed');
      // acceptedVolume is a Prisma.Decimal — verify its numeric value
      expect(Number(upsertCall.update.acceptedVolume)).toBe(100);
    });

    it('sets discrepancyType=1 and discrepancyStatus=open when volumes differ', async () => {
      // gpVolume = 100, scVolume = 80, delta = 20
      await service.upsertPeriodFact(PERIOD_ID, BOQ_ITEM_ID, 80, ACTOR_ID);

      const upsertCall = (prisma.periodFact.upsert as jest.Mock).mock
        .calls[0][0] as {
        update: {
          discrepancyType: unknown;
          discrepancyStatus: unknown;
          acceptedVolume: unknown;
        };
      };
      expect(upsertCall.update.discrepancyType).toBe(1);
      expect(upsertCall.update.discrepancyStatus).toBe('open');
      expect(upsertCall.update.acceptedVolume).toBeNull();
    });

    it('transitions period status to verification when status was gp_submitted', async () => {
      await service.upsertPeriodFact(
        PERIOD_ID,
        BOQ_ITEM_ID,
        SC_VOLUME,
        ACTOR_ID,
      );

      expect(prisma.period.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: PERIOD_ID },
          data: expect.objectContaining({ status: 'verification' }),
        }),
      );
    });

    it('does not update period status when status is already verification', async () => {
      (prisma.period.findUniqueOrThrow as jest.Mock).mockResolvedValue(
        makePeriod({ status: 'verification' }),
      );

      await service.upsertPeriodFact(
        PERIOD_ID,
        BOQ_ITEM_ID,
        SC_VOLUME,
        ACTOR_ID,
      );

      // period.update should NOT have been called for a status transition
      const updateCalls = (prisma.period.update as jest.Mock).mock
        .calls as Array<Array<{ data?: { status?: string } }>>;
      const statusUpdateCalls = updateCalls.filter(
        (call) => call[0]?.data?.status === 'verification',
      );
      expect(statusUpdateCalls).toHaveLength(0);
    });

    it('logs audit event on upsert', async () => {
      await service.upsertPeriodFact(
        PERIOD_ID,
        BOQ_ITEM_ID,
        SC_VOLUME,
        ACTOR_ID,
      );

      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'period_fact_upserted',
          performedBy: ACTOR_ID,
        }),
      );
    });
  });

  // ─── closePeriod ────────────────────────────────────────────────────────────

  describe('closePeriod', () => {
    beforeEach(() => {
      (prisma.period.findUniqueOrThrow as jest.Mock).mockResolvedValue(
        makePeriod({ status: 'verification' }),
      );
      (prisma.discrepancy.count as jest.Mock).mockResolvedValue(0);
    });

    it('closes period and returns updated record', async () => {
      const result = await service.closePeriod(PERIOD_ID, ACTOR_ID);

      expect(prisma.period.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: PERIOD_ID },
          data: expect.objectContaining({
            status: 'closed',
            closedBy: ACTOR_ID,
          }),
        }),
      );
      expect(result).toBeDefined();
    });

    it('throws ConflictException with PERIOD_WRONG_STATUS if status is open', async () => {
      (prisma.period.findUniqueOrThrow as jest.Mock).mockResolvedValue(
        makePeriod({ status: 'open' }),
      );

      await expect(service.closePeriod(PERIOD_ID, ACTOR_ID)).rejects.toThrow(
        'PERIOD_WRONG_STATUS',
      );
    });

    it('throws ConflictException if status is gp_submitted', async () => {
      (prisma.period.findUniqueOrThrow as jest.Mock).mockResolvedValue(
        makePeriod({ status: 'gp_submitted' }),
      );

      await expect(service.closePeriod(PERIOD_ID, ACTOR_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws ConflictException with OPEN_DISCREPANCIES_EXIST if discrepancies exist', async () => {
      (prisma.discrepancy.count as jest.Mock).mockResolvedValue(2);

      await expect(service.closePeriod(PERIOD_ID, ACTOR_ID)).rejects.toThrow(
        'OPEN_DISCREPANCIES_EXIST',
      );
    });

    it('throws ConflictException when open discrepancies exist', async () => {
      (prisma.discrepancy.count as jest.Mock).mockResolvedValue(1);

      await expect(service.closePeriod(PERIOD_ID, ACTOR_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it('creates ReadinessSnapshot with placeholder objectReadinessPct=0', async () => {
      await service.closePeriod(PERIOD_ID, ACTOR_ID);

      expect(prisma.readinessSnapshot.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            periodId: PERIOD_ID,
            objectId: OBJECT_ID,
            objectReadinessPct: 0,
          }),
        }),
      );
    });

    it('logs audit event on successful close', async () => {
      await service.closePeriod(PERIOD_ID, ACTOR_ID);

      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'period_closed',
          performedBy: ACTOR_ID,
        }),
      );
    });

    it('sets closedAt timestamp on close', async () => {
      await service.closePeriod(PERIOD_ID, ACTOR_ID);

      const updateCall = (prisma.period.update as jest.Mock).mock
        .calls[0][0] as {
        data: { closedAt: unknown };
      };
      expect(updateCall.data.closedAt).toBeInstanceOf(Date);
    });

    it('enqueues mv.refresh job with deduplicated jobId per object', async () => {
      await service.closePeriod(PERIOD_ID, ACTOR_ID);

      expect(analyticsQueue.add).toHaveBeenCalledWith(
        'mv.refresh',
        { periodId: PERIOD_ID, objectId: OBJECT_ID },
        expect.objectContaining({
          jobId: `mv-refresh-object-${OBJECT_ID}`,
          removeOnComplete: true,
          removeOnFail: false,
        }),
      );
    });

    it('does not fail close when mv.refresh enqueue rejects (Redis down)', async () => {
      analyticsQueue.add.mockRejectedValueOnce(new Error('Redis down'));

      await expect(
        service.closePeriod(PERIOD_ID, ACTOR_ID),
      ).resolves.toBeDefined();
    });
  });

  // ─── findByObject ────────────────────────────────────────────────────────────

  describe('findByObject', () => {
    it('returns all periods for object ordered desc', async () => {
      const periods = [
        makePeriod({ periodNumber: 2 }),
        makePeriod({ periodNumber: 1 }),
      ];
      (prisma.period.findMany as jest.Mock).mockResolvedValue(periods);

      const result = await service.findByObject(OBJECT_ID);

      expect(prisma.period.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { objectId: OBJECT_ID },
          orderBy: { periodNumber: 'desc' },
        }),
      );
      expect(result).toHaveLength(2);
    });
  });
});
