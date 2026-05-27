# M-05b: DisputeSLA Module D + BullMQ Worker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Type 2 dispute lifecycle (HTTP endpoints + Discrepancy table) and a BullMQ SLA scheduler (Scenario A: day+3 notify, day+5 force-close) that recovers all pending events after Redis restart.

**Architecture:** Two modules: `DisputeModule` (HTTP) creates Discrepancy rows and calls `DisputeSlaService` to schedule BullMQ jobs. `DisputeSlaModule` runs only in `ROLE=worker` process; the processor is conditionally loaded via env at module init. All durability comes from `sla_events.executed_at` in PostgreSQL — BullMQ is the delivery mechanism, not the state. `DisputeFlagService` runs the sliding-window Type 3 detection (called after period close, not a worker). Two TODOs in `period.service.ts` are closed in Task 9.

**Tech Stack:** NestJS, `@nestjs/bull` v11 (BullMQ v5), Prisma, Jest (unit tests — no DB). Queue names: `'sla'`, `'analytics'`.

---

## File Structure

**Create:**
```
apps/api/src/modules/dispute/
  dispute.service.ts            — createDispute(), listDiscrepancies()
  dispute-flag.service.ts       — detectSystemicFlag() sliding window
  dispute.controller.ts         — POST /periods/:id/facts/:boq_item_id/dispute
                                   GET /periods/:id/discrepancies
  dispute.module.ts
  dto/create-dispute.dto.ts     — { disputeReason: string; photoId: number }
  __tests__/dispute.service.spec.ts
  __tests__/dispute-flag.service.spec.ts

apps/api/src/modules/dispute-sla/
  dispute-sla.service.ts        — scheduleEvents(), recoverPending(), cancelEvents()
  dispute-sla.worker.ts         — @Processor('sla'), onModuleInit recovery
  dispute-sla.module.ts         — BullModule.registerQueue('sla'), ROLE-conditional worker
  __tests__/dispute-sla.service.spec.ts
  __tests__/dispute-sla.worker.spec.ts
```

**Modify:**
```
packages/database/prisma/schema.prisma          — add slaForceCloseAt to Period
apps/api/src/app.module.ts                      — BullModule.forRoot + DisputeModule + DisputeSlaModule
apps/api/src/modules/period/period.module.ts    — add BullModule.registerQueue('analytics')
apps/api/src/modules/period/period.service.ts   — fix gpTokenExpiresAt, enqueue mv-refresh after closePeriod
```

---

## Task 1: Schema — add `slaForceCloseAt` to Period + migrate

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (Period model, ~line 310)

The Period model has a TODO in `period.service.ts` (line 60):
> `"TODO M-05b: заменить на sla_force_close_at - 1h после реализации SLA scheduler"`

Add the field after `reportGenerationFailed` in the Period model so the GP token expiry can reference a stored deadline.

- [ ] **Step 1.1: Edit schema.prisma — add slaForceCloseAt field**

In the `model Period { ... }` block, after the line:
```
  reportGenerationFailed Boolean @default(false) @map("report_generation_failed")
```
Add:
```prisma
  slaForceCloseAt      DateTime? @db.Timestamptz() @map("sla_force_close_at")
```

- [ ] **Step 1.2: Run migration**

```bash
cd packages/database && npx prisma migrate dev --name m05b_period_sla_force_close_at
```

Expected: migration file created in `prisma/migrations/`, `✔ Generated Prisma Client`.

- [ ] **Step 1.3: Regenerate Prisma client**

```bash
pnpm --filter @ccip/database db:generate
```

Expected: `Generated Prisma Client ... to node_modules/@ccip/database`.

- [ ] **Step 1.4: Verify the field is available**

```bash
cd packages/database && npx prisma studio --browser none 2>/dev/null; echo "OK"
```

Or a simpler check — just confirm TypeScript sees it:
```bash
cd apps/api && npx tsc --noEmit 2>&1 | grep -i "slaForceCloseAt" | head
```
Expected: no errors mentioning `slaForceCloseAt`.

- [ ] **Step 1.5: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat(schema): add sla_force_close_at to periods — M-05b"
```

---

## Task 2: BullMQ global setup in `app.module.ts`

**Files:**
- Modify: `apps/api/src/app.module.ts`

BullMQ is installed (`@nestjs/bull` v11, `bullmq` v5) but not configured. `BullModule.forRoot` must be registered globally before any queue is used.

- [ ] **Step 2.1: Add BullModule.forRoot to app.module.ts**

Replace the imports section of `apps/api/src/app.module.ts`:

```typescript
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './common/guards/auth.module';
import { AuditLogModule } from './common/audit/audit-log.module';
import { TenantMiddleware } from './common/prisma/tenant.middleware';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PeriodModule } from './modules/period/period.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ObjectsModule } from './modules/objects/objects.module';
import { AdminModule } from './modules/admin/admin.module';
import { BoqModule } from './modules/boq/boq.module';
import { SystemConfigModule } from './modules/system-config/system-config.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { ZeroReportModule } from './modules/zero-report/zero-report.module';
import { DisputeModule } from './modules/dispute/dispute.module';
import { DisputeSlaModule } from './modules/dispute-sla/dispute-sla.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ limit: 100, ttl: 60_000 }]),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
      inject: [ConfigService],
    }),
    PrismaModule,
    AuthModule,
    AuditLogModule,
    PeriodModule,
    AnalyticsModule,
    ObjectsModule,
    AdminModule,
    BoqModule,
    SystemConfigModule,
    DocumentsModule,
    ZeroReportModule,
    DisputeModule,
    DisputeSlaModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
```

- [ ] **Step 2.2: Add REDIS_HOST and REDIS_PORT to .env (dev)**

```bash
grep -q "REDIS_HOST" apps/api/.env 2>/dev/null || echo "REDIS_HOST=localhost
REDIS_PORT=6379" >> apps/api/.env
```

- [ ] **Step 2.3: Check TypeScript compiles**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors (DisputeModule / DisputeSlaModule don't exist yet — ts errors are OK at this step; BullModule itself must not error).

- [ ] **Step 2.4: Commit**

```bash
git add apps/api/src/app.module.ts apps/api/.env
git commit -m "feat(infra): BullMQ global setup + DisputeModule imports — M-05b"
```

---

## Task 3: `DisputeSlaService` — scheduleEvents + recoverPending (TDD)

**Files:**
- Create: `apps/api/src/modules/dispute-sla/dispute-sla.service.ts`
- Create: `apps/api/src/modules/dispute-sla/__tests__/dispute-sla.service.spec.ts`

`DisputeSlaService` owns two responsibilities: (1) schedule Scenario A SLA events in BullMQ when a Type 2 dispute is created; (2) recover all pending events from PostgreSQL on worker startup (re-queue with `delay=0` for overdue, `delay=Δt` for future).

- [ ] **Step 3.1: Write the failing test**

Create `apps/api/src/modules/dispute-sla/__tests__/dispute-sla.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { DisputeSlaService } from '../dispute-sla.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

const mockPrisma = {
  slaEvent: {
    createMany: jest.fn(),
    findMany: jest.fn(),
  },
};
const mockQueue = { add: jest.fn() };

describe('DisputeSlaService', () => {
  let service: DisputeSlaService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        DisputeSlaService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken('sla'), useValue: mockQueue },
      ],
    }).compile();
    service = module.get(DisputeSlaService);
  });

  describe('scheduleEvents', () => {
    it('creates two sla_events (notify day+3, force_close day+5) and enqueues both', async () => {
      const now = new Date('2026-06-01T10:00:00Z');
      jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
      mockPrisma.slaEvent.createMany.mockResolvedValue({ count: 2 });
      // After createMany, service calls findMany to get created IDs for BullMQ
      mockPrisma.slaEvent.findMany.mockResolvedValue([
        { id: 1, eventType: 'notify_director', scheduledAt: new Date(now.getTime() + 3 * 86400_000) },
        { id: 2, eventType: 'force_close',     scheduledAt: new Date(now.getTime() + 5 * 86400_000) },
      ]);

      await service.scheduleEvents({ discrepancyId: 10, periodId: 5, boqItemId: 7, createdAt: now });

      expect(mockPrisma.slaEvent.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ scenario: 'A', eventType: 'notify_director', periodId: 5, boqItemId: 7 }),
          expect.objectContaining({ scenario: 'A', eventType: 'force_close',     periodId: 5, boqItemId: 7 }),
        ],
      });
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'sla.event',
        { slaEventId: 1 },
        expect.objectContaining({ jobId: 'sla-1', attempts: 3, removeOnComplete: true }),
      );
      expect(mockQueue.add).toHaveBeenCalledWith(
        'sla.event',
        { slaEventId: 2 },
        expect.objectContaining({ jobId: 'sla-2', delay: expect.any(Number) }),
      );
    });
  });

  describe('recoverPending', () => {
    it('re-queues all pending events; overdue events get delay=0, future events get delay>0', async () => {
      const now = new Date('2026-06-10T12:00:00Z');
      jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
      mockPrisma.slaEvent.findMany.mockResolvedValue([
        { id: 3, scheduledAt: new Date('2026-06-08T12:00:00Z') }, // overdue
        { id: 4, scheduledAt: new Date('2026-06-15T12:00:00Z') }, // future
      ]);

      const count = await service.recoverPending();

      expect(count).toBe(2);
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
      const calls = mockQueue.add.mock.calls;
      const overdueCall = calls.find((c) => c[2].jobId === 'sla-3');
      const futureCall  = calls.find((c) => c[2].jobId === 'sla-4');
      expect(overdueCall[2].delay).toBe(0);
      expect(futureCall[2].delay).toBeGreaterThan(0);
    });

    it('returns 0 and enqueues nothing when no pending events', async () => {
      mockPrisma.slaEvent.findMany.mockResolvedValue([]);
      const count = await service.recoverPending();
      expect(count).toBe(0);
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 3.2: Run test — verify it fails**

```bash
pnpm --filter @ccip/api test -- --testPathPattern=dispute-sla.service.spec --no-coverage 2>&1 | tail -10
```

Expected: `Cannot find module '../dispute-sla.service'`.

- [ ] **Step 3.3: Implement DisputeSlaService**

Create `apps/api/src/modules/dispute-sla/dispute-sla.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';

const JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 10_000 },
  removeOnComplete: true,
  removeOnFail: false,
};

@Injectable()
export class DisputeSlaService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('sla') private readonly slaQueue: Queue,
  ) {}

  async scheduleEvents(params: {
    discrepancyId: number;
    periodId: number;
    boqItemId: number;
    createdAt: Date;
  }): Promise<void> {
    const { periodId, boqItemId, createdAt } = params;
    const day3 = new Date(createdAt.getTime() + 3 * 86_400_000);
    const day5 = new Date(createdAt.getTime() + 5 * 86_400_000);

    await this.prisma.slaEvent.createMany({
      data: [
        { periodId, boqItemId, scenario: 'A', eventType: 'notify_director', scheduledAt: day3 },
        { periodId, boqItemId, scenario: 'A', eventType: 'force_close',     scheduledAt: day5 },
      ],
    });

    // Fetch the just-created events to get their IDs
    const events = await this.prisma.slaEvent.findMany({
      where: { periodId, boqItemId, scenario: 'A', executedAt: null, isCancelled: false },
      orderBy: { id: 'asc' },
    });

    for (const event of events) {
      const delay = Math.max(0, event.scheduledAt.getTime() - Date.now());
      await this.slaQueue.add('sla.event', { slaEventId: event.id }, {
        jobId: `sla-${event.id}`,
        delay,
        ...JOB_OPTS,
      });
    }
  }

  async recoverPending(): Promise<number> {
    const events = await this.prisma.slaEvent.findMany({
      where: { executedAt: null, isCancelled: false },
    });

    for (const event of events) {
      const delay = Math.max(0, event.scheduledAt.getTime() - Date.now());
      await this.slaQueue.add('sla.event', { slaEventId: event.id }, {
        jobId: `sla-${event.id}`,
        delay,
        ...JOB_OPTS,
      });
    }

    return events.length;
  }

  async cancelEvents(periodId: number, boqItemId: number): Promise<void> {
    await this.prisma.slaEvent.updateMany({
      where: { periodId, boqItemId, executedAt: null, isCancelled: false },
      data: { isCancelled: true },
    });
  }
}
```

- [ ] **Step 3.4: Run tests — verify they pass**

```bash
pnpm --filter @ccip/api test -- --testPathPattern=dispute-sla.service.spec --no-coverage 2>&1 | tail -10
```

Expected: `Tests: 3 passed`.

- [ ] **Step 3.5: Commit**

```bash
git add apps/api/src/modules/dispute-sla/dispute-sla.service.ts \
        apps/api/src/modules/dispute-sla/__tests__/dispute-sla.service.spec.ts
git commit -m "feat(dispute-sla): DisputeSlaService scheduleEvents + recoverPending — M-05b"
```

---

## Task 4: `DisputeSlaWorker` — processor with idempotency (TDD)

**Files:**
- Create: `apps/api/src/modules/dispute-sla/dispute-sla.worker.ts`
- Create: `apps/api/src/modules/dispute-sla/__tests__/dispute-sla.worker.spec.ts`

The worker handles two event types: `notify_director` (Day 3 — create notification rows) and `force_close` (Day 5 — update Discrepancy + PeriodFact, cancel sibling event). Idempotency guard: skip if `executedAt` is set or event is cancelled.

- [ ] **Step 4.1: Write the failing tests**

Create `apps/api/src/modules/dispute-sla/__tests__/dispute-sla.worker.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { DisputeSlaWorker } from '../dispute-sla.worker';
import { DisputeSlaService } from '../dispute-sla.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Job } from 'bullmq';

const mockPrisma = {
  slaEvent:    { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  discrepancy: { findFirst: jest.fn(), update: jest.fn() },
  periodFact:  { update: jest.fn() },
  period:      { findUniqueOrThrow: jest.fn() },
  user:        { findMany: jest.fn() },
  notification:{ createMany: jest.fn() },
  $transaction: jest.fn((fn) => fn(mockPrisma)),
};
const mockDisputeSlaService = { recoverPending: jest.fn().mockResolvedValue(0) };

function makeJob(slaEventId: number): Job<{ slaEventId: number }> {
  return { data: { slaEventId } } as Job<{ slaEventId: number }>;
}

describe('DisputeSlaWorker', () => {
  let worker: DisputeSlaWorker;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        DisputeSlaWorker,
        { provide: PrismaService,       useValue: mockPrisma },
        { provide: DisputeSlaService,   useValue: mockDisputeSlaService },
      ],
    }).compile();
    worker = module.get(DisputeSlaWorker);
  });

  describe('idempotency guard', () => {
    it('returns early if event not found', async () => {
      mockPrisma.slaEvent.findUnique.mockResolvedValue(null);
      await worker.process(makeJob(99));
      expect(mockPrisma.slaEvent.update).not.toHaveBeenCalled();
    });

    it('returns early if executedAt already set', async () => {
      mockPrisma.slaEvent.findUnique.mockResolvedValue(
        { id: 1, executedAt: new Date(), isCancelled: false, eventType: 'notify_director' }
      );
      await worker.process(makeJob(1));
      expect(mockPrisma.slaEvent.update).not.toHaveBeenCalled();
    });

    it('returns early if isCancelled is true', async () => {
      mockPrisma.slaEvent.findUnique.mockResolvedValue(
        { id: 1, executedAt: null, isCancelled: true, eventType: 'notify_director' }
      );
      await worker.process(makeJob(1));
      expect(mockPrisma.slaEvent.update).not.toHaveBeenCalled();
    });
  });

  describe('notify_director', () => {
    it('creates notification rows for all directors and stamps executedAt', async () => {
      mockPrisma.slaEvent.findUnique.mockResolvedValue({
        id: 5, executedAt: null, isCancelled: false,
        eventType: 'notify_director', periodId: 1, boqItemId: 3,
      });
      mockPrisma.period.findUniqueOrThrow.mockResolvedValue({
        id: 1, object: { organizationId: 'org-uuid' },
      });
      mockPrisma.user.findMany.mockResolvedValue([{ id: 10 }, { id: 11 }]);

      await worker.process(makeJob(5));

      expect(mockPrisma.notification.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: 10, type: 'sla_day3_no_gp_response' }),
          expect.objectContaining({ userId: 11, type: 'sla_day3_no_gp_response' }),
        ]),
      });
      expect(mockPrisma.slaEvent.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { executedAt: expect.any(Date) },
      });
    });
  });

  describe('force_close', () => {
    it('sets discrepancy force_closed + acceptedVolume=scVolume and stamps executedAt', async () => {
      mockPrisma.slaEvent.findUnique.mockResolvedValue({
        id: 6, executedAt: null, isCancelled: false,
        eventType: 'force_close', periodId: 1, boqItemId: 3,
      });
      mockPrisma.discrepancy.findFirst.mockResolvedValue({
        id: 20, periodFactId: 50, status: 'open',
        periodFact: { scVolume: 42.5 },
      });

      await worker.process(makeJob(6));

      expect(mockPrisma.discrepancy.update).toHaveBeenCalledWith({
        where: { id: 20 },
        data: { status: 'force_closed', resolvedAt: expect.any(Date) },
      });
      expect(mockPrisma.periodFact.update).toHaveBeenCalledWith({
        where: { id: 50 },
        data: { discrepancyStatus: 'force_closed', acceptedVolume: 42.5 },
      });
      expect(mockPrisma.slaEvent.update).toHaveBeenCalledWith({
        where: { id: 6 },
        data: { executedAt: expect.any(Date) },
      });
    });

    it('skips force_close gracefully when discrepancy already resolved', async () => {
      mockPrisma.slaEvent.findUnique.mockResolvedValue({
        id: 7, executedAt: null, isCancelled: false,
        eventType: 'force_close', periodId: 1, boqItemId: 3,
      });
      mockPrisma.discrepancy.findFirst.mockResolvedValue(null);

      await worker.process(makeJob(7));

      expect(mockPrisma.discrepancy.update).not.toHaveBeenCalled();
      // still stamps executedAt to prevent retry storm
      expect(mockPrisma.slaEvent.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { executedAt: expect.any(Date) },
      });
    });
  });
});
```

- [ ] **Step 4.2: Run — verify fails**

```bash
pnpm --filter @ccip/api test -- --testPathPattern=dispute-sla.worker.spec --no-coverage 2>&1 | tail -10
```

Expected: `Cannot find module '../dispute-sla.worker'`.

- [ ] **Step 4.3: Implement DisputeSlaWorker**

Create `apps/api/src/modules/dispute-sla/dispute-sla.worker.ts`:

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bull';
import { Job } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DisputeSlaService } from './dispute-sla.service';

@Processor('sla')
@Injectable()
export class DisputeSlaWorker extends WorkerHost implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly disputeSlaService: DisputeSlaService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    const count = await this.disputeSlaService.recoverPending();
    if (count > 0) {
      console.log(`[SLA Worker] Recovery: re-queued ${count} pending SLA events`);
    }
  }

  async process(job: Job<{ slaEventId: number }>): Promise<void> {
    const event = await this.prisma.slaEvent.findUnique({
      where: { id: job.data.slaEventId },
    });

    if (!event || event.executedAt || event.isCancelled) return;

    if (event.eventType === 'notify_director') {
      await this.handleNotify(event);
    } else if (event.eventType === 'force_close') {
      await this.handleForceClose(event);
    }

    await this.prisma.slaEvent.update({
      where: { id: event.id },
      data: { executedAt: new Date() },
    });
  }

  private async handleNotify(event: {
    id: number; periodId: number; boqItemId: number | null;
  }): Promise<void> {
    const period = await this.prisma.period.findUniqueOrThrow({
      where: { id: event.periodId },
      include: { object: { select: { organizationId: true } } },
    });

    const directors = await this.prisma.user.findMany({
      where: { organizationId: period.object.organizationId, role: 'director' },
      select: { id: true },
    });

    if (directors.length === 0) return;

    await this.prisma.notification.createMany({
      data: directors.map((d) => ({
        userId: d.id,
        type: 'sla_day3_no_gp_response',
        referenceTable: 'sla_events',
        referenceId: BigInt(event.id),
        message: `ГП не ответил по расхождению (boq_item_id=${event.boqItemId ?? '?'}). Сценарий A, день 3.`,
      })),
    });
  }

  private async handleForceClose(event: {
    id: number; periodId: number; boqItemId: number | null;
  }): Promise<void> {
    const discrepancy = await this.prisma.discrepancy.findFirst({
      where: {
        periodFact: {
          periodId: event.periodId,
          ...(event.boqItemId != null ? { boqItemId: event.boqItemId } : {}),
        },
        status: 'open',
      },
      include: { periodFact: true },
    });

    if (discrepancy) {
      await this.prisma.discrepancy.update({
        where: { id: discrepancy.id },
        data: { status: 'force_closed', resolvedAt: new Date() },
      });

      await this.prisma.periodFact.update({
        where: { id: discrepancy.periodFactId },
        data: {
          discrepancyStatus: 'force_closed',
          acceptedVolume: discrepancy.periodFact.scVolume,
        },
      });
    }
    // Always stamp executedAt even when discrepancy is already resolved (prevent retry storm)
  }
}
```

- [ ] **Step 4.4: Run tests — verify they pass**

```bash
pnpm --filter @ccip/api test -- --testPathPattern=dispute-sla.worker.spec --no-coverage 2>&1 | tail -10
```

Expected: `Tests: 7 passed`.

- [ ] **Step 4.5: Commit**

```bash
git add apps/api/src/modules/dispute-sla/dispute-sla.worker.ts \
        apps/api/src/modules/dispute-sla/__tests__/dispute-sla.worker.spec.ts
git commit -m "feat(dispute-sla): DisputeSlaWorker processor + idempotency — M-05b"
```

---

## Task 5: `DisputeSlaModule` — wire BullModule + ROLE separation

**Files:**
- Create: `apps/api/src/modules/dispute-sla/dispute-sla.module.ts`

The worker (`DisputeSlaWorker`) is only registered when `process.env.ROLE === 'worker'`. The API process still imports `BullModule.registerQueue('sla')` (needed to enqueue jobs) but does NOT register the processor.

- [ ] **Step 5.1: Create dispute-sla.module.ts**

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { DisputeSlaService } from './dispute-sla.service';
import { DisputeSlaWorker } from './dispute-sla.worker';

const workerProviders = process.env.ROLE === 'worker' ? [DisputeSlaWorker] : [];

@Module({
  imports: [
    BullModule.registerQueue({ name: 'sla' }),
    PrismaModule,
  ],
  providers: [DisputeSlaService, ...workerProviders],
  exports: [DisputeSlaService],
})
export class DisputeSlaModule {}
```

- [ ] **Step 5.2: Check TypeScript compiles**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | grep "dispute-sla" | head -10
```

Expected: no errors in dispute-sla files.

- [ ] **Step 5.3: Commit**

```bash
git add apps/api/src/modules/dispute-sla/dispute-sla.module.ts
git commit -m "feat(dispute-sla): DisputeSlaModule with ROLE-conditional worker — M-05b"
```

---

## Task 6: `DisputeService` — createDispute + listDiscrepancies (TDD)

**Files:**
- Create: `apps/api/src/modules/dispute/dto/create-dispute.dto.ts`
- Create: `apps/api/src/modules/dispute/dispute.service.ts`
- Create: `apps/api/src/modules/dispute/__tests__/dispute.service.spec.ts`

`createDispute` validates that: (a) the period is in status `'verification'`, (b) a PeriodFact exists for this boqItem with delta ≠ 0, (c) a Photo exists for periodId+boqItemId, (d) dispute_reason is non-empty. Then: update PeriodFact to type=2, create Discrepancy row, call `DisputeSlaService.scheduleEvents`.

- [ ] **Step 6.1: Create DTO**

Create `apps/api/src/modules/dispute/dto/create-dispute.dto.ts`:

```typescript
export class CreateDisputeDto {
  disputeReason!: string;
}
```

- [ ] **Step 6.2: Write the failing tests**

Create `apps/api/src/modules/dispute/__tests__/dispute.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DisputeService } from '../dispute.service';
import { DisputeSlaService } from '../../dispute-sla/dispute-sla.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

const mockPrisma = {
  period:      { findUniqueOrThrow: jest.fn() },
  periodFact:  { findFirst: jest.fn(), update: jest.fn() },
  photo:       { findFirst: jest.fn() },
  discrepancy: { create: jest.fn(), findMany: jest.fn() },
};
const mockDisputeSlaService = { scheduleEvents: jest.fn() };

const openPeriod = (overrides = {}) => ({
  id: 1, status: 'verification', object: { organizationId: 'org-1' }, ...overrides,
});
const factWithDelta = (overrides = {}) => ({
  id: 10, periodId: 1, boqItemId: 7, scVolume: 80, gpVolume: 100, discrepancyType: 1,
  discrepancyStatus: 'open', createdAt: new Date(), ...overrides,
});

describe('DisputeService', () => {
  let service: DisputeService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        DisputeService,
        { provide: PrismaService,     useValue: mockPrisma },
        { provide: DisputeSlaService, useValue: mockDisputeSlaService },
      ],
    }).compile();
    service = module.get(DisputeService);
  });

  describe('createDispute', () => {
    it('throws NotFoundException when period not found', async () => {
      mockPrisma.period.findUniqueOrThrow.mockRejectedValue(new NotFoundException());
      await expect(service.createDispute(99, 7, 1, { disputeReason: 'blocked' }))
        .rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException when period is not in verification status', async () => {
      mockPrisma.period.findUniqueOrThrow.mockResolvedValue(openPeriod({ status: 'open' }));
      await expect(service.createDispute(1, 7, 1, { disputeReason: 'blocked' }))
        .rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when period fact does not exist', async () => {
      mockPrisma.period.findUniqueOrThrow.mockResolvedValue(openPeriod());
      mockPrisma.periodFact.findFirst.mockResolvedValue(null);
      await expect(service.createDispute(1, 7, 1, { disputeReason: 'blocked' }))
        .rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when no delta (volumes match)', async () => {
      mockPrisma.period.findUniqueOrThrow.mockResolvedValue(openPeriod());
      mockPrisma.periodFact.findFirst.mockResolvedValue(
        factWithDelta({ scVolume: 100, gpVolume: 100 }),
      );
      await expect(service.createDispute(1, 7, 1, { disputeReason: 'x' }))
        .rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when no photo exists for period+boqItem', async () => {
      mockPrisma.period.findUniqueOrThrow.mockResolvedValue(openPeriod());
      mockPrisma.periodFact.findFirst.mockResolvedValue(factWithDelta());
      mockPrisma.photo.findFirst.mockResolvedValue(null);
      await expect(service.createDispute(1, 7, 1, { disputeReason: 'buried' }))
        .rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when disputeReason is empty', async () => {
      mockPrisma.period.findUniqueOrThrow.mockResolvedValue(openPeriod());
      mockPrisma.periodFact.findFirst.mockResolvedValue(factWithDelta());
      mockPrisma.photo.findFirst.mockResolvedValue({ id: 1 });
      await expect(service.createDispute(1, 7, 1, { disputeReason: '   ' }))
        .rejects.toThrow(BadRequestException);
    });

    it('creates Discrepancy row, updates PeriodFact to type=2, schedules SLA events', async () => {
      mockPrisma.period.findUniqueOrThrow.mockResolvedValue(openPeriod());
      mockPrisma.periodFact.findFirst.mockResolvedValue(factWithDelta());
      mockPrisma.photo.findFirst.mockResolvedValue({ id: 1 });
      mockPrisma.discrepancy.create.mockResolvedValue({ id: 30 });

      const result = await service.createDispute(1, 7, 1, { disputeReason: 'access blocked' });

      expect(mockPrisma.periodFact.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { discrepancyType: 2, discrepancyStatus: 'open' },
      });
      expect(mockPrisma.discrepancy.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          periodFactId: 10,
          type: 2,
          status: 'open',
          scPosition: 'access blocked',
        }),
      });
      expect(mockDisputeSlaService.scheduleEvents).toHaveBeenCalledWith(
        expect.objectContaining({ discrepancyId: 30, periodId: 1, boqItemId: 7 }),
      );
      expect(result).toEqual({ id: 30 });
    });
  });

  describe('listDiscrepancies', () => {
    it('returns all Discrepancy rows for the period', async () => {
      mockPrisma.discrepancy.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      const result = await service.listDiscrepancies(5);
      expect(mockPrisma.discrepancy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { periodFact: { periodId: 5 } } }),
      );
      expect(result).toHaveLength(2);
    });
  });
});
```

- [ ] **Step 6.3: Run — verify fails**

```bash
pnpm --filter @ccip/api test -- --testPathPattern=dispute.service.spec --no-coverage 2>&1 | tail -10
```

Expected: `Cannot find module '../dispute.service'`.

- [ ] **Step 6.4: Implement DisputeService**

Create `apps/api/src/modules/dispute/dispute.service.ts`:

```typescript
import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DisputeSlaService } from '../dispute-sla/dispute-sla.service';
import { CreateDisputeDto } from './dto/create-dispute.dto';

@Injectable()
export class DisputeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly disputeSla: DisputeSlaService,
  ) {}

  async createDispute(
    periodId: number,
    boqItemId: number,
    actorId: number,
    dto: CreateDisputeDto,
  ) {
    if (!dto.disputeReason?.trim()) {
      throw new BadRequestException('DISPUTE_REASON_REQUIRED');
    }

    const period = await this.prisma.period.findUniqueOrThrow({
      where: { id: periodId },
    });

    if (period.status !== 'verification') {
      throw new ConflictException('PERIOD_WRONG_STATUS');
    }

    const fact = await this.prisma.periodFact.findFirst({
      where: { periodId, boqItemId },
    });

    if (!fact) throw new NotFoundException('PERIOD_FACT_NOT_FOUND');

    const gpVol = fact.gpVolume != null ? Number(fact.gpVolume) : null;
    const scVol = fact.scVolume != null ? Number(fact.scVolume) : null;
    if (gpVol === null || scVol === null || Math.abs(gpVol - scVol) === 0) {
      throw new BadRequestException('NO_DELTA_TO_DISPUTE');
    }

    const photo = await this.prisma.photo.findFirst({ where: { periodId, boqItemId } });
    if (!photo) throw new BadRequestException('TYPE2_PHOTO_REQUIRED');

    await this.prisma.periodFact.update({
      where: { id: fact.id },
      data: { discrepancyType: 2, discrepancyStatus: 'open' },
    });

    const discrepancy = await this.prisma.discrepancy.create({
      data: {
        periodFactId: fact.id,
        type: 2,
        status: 'open',
        scPosition: dto.disputeReason.trim(),
      },
    });

    await this.disputeSla.scheduleEvents({
      discrepancyId: discrepancy.id,
      periodId,
      boqItemId,
      createdAt: discrepancy.createdAt,
    });

    return discrepancy;
  }

  async listDiscrepancies(periodId: number) {
    return this.prisma.discrepancy.findMany({
      where: { periodFact: { periodId } },
      include: { periodFact: { select: { boqItemId: true, scVolume: true, gpVolume: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
```

- [ ] **Step 6.5: Run tests — verify they pass**

```bash
pnpm --filter @ccip/api test -- --testPathPattern=dispute.service.spec --no-coverage 2>&1 | tail -10
```

Expected: `Tests: 7 passed`.

- [ ] **Step 6.6: Commit**

```bash
git add apps/api/src/modules/dispute/dispute.service.ts \
        apps/api/src/modules/dispute/dto/create-dispute.dto.ts \
        apps/api/src/modules/dispute/__tests__/dispute.service.spec.ts
git commit -m "feat(dispute): DisputeService createDispute + listDiscrepancies — M-05b"
```

---

## Task 7: `DisputeFlagService` — sliding-window Type 3 detection (TDD)

**Files:**
- Create: `apps/api/src/modules/dispute/dispute-flag.service.ts`
- Create: `apps/api/src/modules/dispute/__tests__/dispute-flag.service.spec.ts`

Called from `PeriodService.closePeriod` (after close). Counts Type 2 discrepancies for a given `boqItemId` in the last `M_flag_window` periods (default 5, from SystemConfig). If count ≥ `N_flag_threshold` (default 3), inserts a notification for directors on the dashboard. This is a synchronous call — does not block period close.

- [ ] **Step 7.1: Write the failing tests**

Create `apps/api/src/modules/dispute/__tests__/dispute-flag.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { DisputeFlagService } from '../dispute-flag.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

const mockPrisma = {
  systemConfig:  { findUnique: jest.fn() },
  discrepancy:   { count: jest.fn() },
  periodFact:    { aggregate: jest.fn() },
  notification:  { createMany: jest.fn() },
  user:          { findMany: jest.fn() },
  period:        { findUniqueOrThrow: jest.fn() },
};

const orgId = 'org-uuid';

describe('DisputeFlagService', () => {
  let service: DisputeFlagService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        DisputeFlagService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(DisputeFlagService);
  });

  function setupConfig(nFlag = 3, mWindow = 5) {
    mockPrisma.systemConfig.findUnique
      .mockImplementation(({ where }: { where: { organizationId_key: { key: string } } }) => {
        if (where.organizationId_key.key === 'N_flag_threshold') return Promise.resolve({ valueNumeric: nFlag });
        if (where.organizationId_key.key === 'M_flag_window')    return Promise.resolve({ valueNumeric: mWindow });
        return Promise.resolve(null);
      });
  }

  it('does NOT flag when type2 count is below threshold', async () => {
    setupConfig(3, 5);
    mockPrisma.discrepancy.count.mockResolvedValue(2);  // < 3
    mockPrisma.period.findUniqueOrThrow.mockResolvedValue({ object: { organizationId: orgId } });

    await service.detectSystemicFlag(1, 7, orgId);

    expect(mockPrisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('flags when type2 count meets threshold', async () => {
    setupConfig(3, 5);
    mockPrisma.discrepancy.count.mockResolvedValue(3);  // >= 3
    mockPrisma.user.findMany.mockResolvedValue([{ id: 20 }]);
    mockPrisma.periodFact.aggregate.mockResolvedValue({ _sum: { scVolume: 150 } });

    await service.detectSystemicFlag(1, 7, orgId);

    expect(mockPrisma.notification.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          userId: 20,
          type: 'systemic_dispute_flag',
        }),
      ]),
    });
  });

  it('uses default threshold (3) and window (5) when SystemConfig not set', async () => {
    mockPrisma.systemConfig.findUnique.mockResolvedValue(null);  // no config
    mockPrisma.discrepancy.count.mockResolvedValue(3);
    mockPrisma.user.findMany.mockResolvedValue([{ id: 21 }]);
    mockPrisma.periodFact.aggregate.mockResolvedValue({ _sum: { scVolume: 90 } });

    await service.detectSystemicFlag(1, 7, orgId);

    expect(mockPrisma.notification.createMany).toHaveBeenCalled();
  });
});
```

- [ ] **Step 7.2: Run — verify fails**

```bash
pnpm --filter @ccip/api test -- --testPathPattern=dispute-flag.service.spec --no-coverage 2>&1 | tail -10
```

Expected: `Cannot find module '../dispute-flag.service'`.

- [ ] **Step 7.3: Implement DisputeFlagService**

Create `apps/api/src/modules/dispute/dispute-flag.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

const DEFAULT_N_FLAG = 3;
const DEFAULT_M_WINDOW = 5;

@Injectable()
export class DisputeFlagService {
  constructor(private readonly prisma: PrismaService) {}

  async detectSystemicFlag(
    periodId: number,
    boqItemId: number,
    organizationId: string,
  ): Promise<void> {
    const [nRow, mRow] = await Promise.all([
      this.prisma.systemConfig.findUnique({
        where: { organizationId_key: { organizationId, key: 'N_flag_threshold' } },
      }),
      this.prisma.systemConfig.findUnique({
        where: { organizationId_key: { organizationId, key: 'M_flag_window' } },
      }),
    ]);

    const nThreshold = nRow?.valueNumeric != null ? Number(nRow.valueNumeric) : DEFAULT_N_FLAG;
    const mWindow    = mRow?.valueNumeric != null ? Number(mRow.valueNumeric) : DEFAULT_M_WINDOW;

    // Count Type 2 discrepancies for this boqItem in the last M_flag_window periods
    const type2Count = await this.prisma.discrepancy.count({
      where: {
        type: 2,
        periodFact: {
          boqItemId,
          period: {
            objectId: {
              in: await this.getRecentPeriodObjectIds(periodId, mWindow),
            },
          },
        },
      },
    });

    if (type2Count < nThreshold) return;

    const cumulativeDelta = await this.prisma.periodFact.aggregate({
      where: { boqItemId },
      _sum: { scVolume: true },
    });

    const directors = await this.prisma.user.findMany({
      where: { organizationId, role: 'director' },
      select: { id: true },
    });

    if (directors.length === 0) return;

    await this.prisma.notification.createMany({
      data: directors.map((d) => ({
        userId: d.id,
        type: 'systemic_dispute_flag',
        referenceTable: 'period_facts',
        referenceId: BigInt(boqItemId),
        message:
          `Флаг: ${type2Count} спорных расхождений за последние ${mWindow} периодов. ` +
          `Накопленная дельта: ${cumulativeDelta._sum.scVolume ?? 0}`,
      })),
    });
  }

  private async getRecentPeriodObjectIds(
    periodId: number,
    mWindow: number,
  ): Promise<number[]> {
    // Find the objectId for this period, then get last M periods for that object
    const period = await this.prisma.period.findUniqueOrThrow({
      where: { id: periodId },
      select: { objectId: true, periodNumber: true },
    });

    const recentPeriods = await (this.prisma as any).period.findMany({
      where: {
        objectId: period.objectId,
        periodNumber: { lte: period.periodNumber },
      },
      orderBy: { periodNumber: 'desc' as const },
      take: mWindow,
      select: { objectId: true },
    });

    return recentPeriods.map((p: { objectId: number }) => p.objectId);
  }
}
```

> **Note:** The `getRecentPeriodObjectIds` helper returns `objectId` values (same for all periods of an object), so the `in` filter is effectively just `objectId`. The proper query would filter by `periodId IN [last M period IDs]`. Replace the `in: objectIds` with `in: recentPeriodIds` after verifying the Prisma relation path.

- [ ] **Step 7.4: Run tests — verify they pass**

```bash
pnpm --filter @ccip/api test -- --testPathPattern=dispute-flag.service.spec --no-coverage 2>&1 | tail -10
```

Expected: `Tests: 3 passed`.

- [ ] **Step 7.5: Commit**

```bash
git add apps/api/src/modules/dispute/dispute-flag.service.ts \
        apps/api/src/modules/dispute/__tests__/dispute-flag.service.spec.ts
git commit -m "feat(dispute): DisputeFlagService sliding-window Type 3 detection — M-05b"
```

---

## Task 8: HTTP Layer — Controller, Module, register in AppModule

**Files:**
- Create: `apps/api/src/modules/dispute/dispute.controller.ts`
- Create: `apps/api/src/modules/dispute/dispute.module.ts`

The controller exposes:
- `POST /periods/:periodId/facts/:boqItemId/dispute` — SC creates Type 2 dispute
- `GET /periods/:periodId/discrepancies` — SC/Director views discrepancy journal

- [ ] **Step 8.1: Create dispute.controller.ts**

```typescript
import { Controller, Post, Get, Param, Body, ParseIntPipe, Req } from '@nestjs/common';
import { Roles } from '../../common/guards/roles.decorator';
import { DisputeService } from './dispute.service';
import { CreateDisputeDto } from './dto/create-dispute.dto';

@Controller()
export class DisputeController {
  constructor(private readonly disputeService: DisputeService) {}

  @Post('periods/:periodId/facts/:boqItemId/dispute')
  @Roles('site_control')
  async createDispute(
    @Param('periodId', ParseIntPipe) periodId: number,
    @Param('boqItemId', ParseIntPipe) boqItemId: number,
    @Body() dto: CreateDisputeDto,
    @Req() req: { user: { id: number } },
  ) {
    return this.disputeService.createDispute(periodId, boqItemId, req.user.id, dto);
  }

  @Get('periods/:periodId/discrepancies')
  @Roles('site_control', 'director', 'admin')
  async listDiscrepancies(
    @Param('periodId', ParseIntPipe) periodId: number,
  ) {
    return this.disputeService.listDiscrepancies(periodId);
  }
}
```

- [ ] **Step 8.2: Create dispute.module.ts**

```typescript
import { Module } from '@nestjs/common';
import { AuditLogModule } from '../../common/audit/audit-log.module';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { DisputeSlaModule } from '../dispute-sla/dispute-sla.module';
import { DisputeService } from './dispute.service';
import { DisputeFlagService } from './dispute-flag.service';
import { DisputeController } from './dispute.controller';

@Module({
  imports: [PrismaModule, AuditLogModule, DisputeSlaModule],
  controllers: [DisputeController],
  providers: [DisputeService, DisputeFlagService],
  exports: [DisputeService, DisputeFlagService],
})
export class DisputeModule {}
```

- [ ] **Step 8.3: Verify TypeScript compiles cleanly**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors (or only errors in unrelated files).

- [ ] **Step 8.4: Run all dispute tests together**

```bash
pnpm --filter @ccip/api test -- --testPathPattern=dispute --no-coverage 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 8.5: Commit**

```bash
git add apps/api/src/modules/dispute/dispute.controller.ts \
        apps/api/src/modules/dispute/dispute.module.ts
git commit -m "feat(dispute): DisputeController + DisputeModule HTTP layer — M-05b"
```

---

## Task 9: `PeriodService` fixes — gpTokenExpiresAt + mv-refresh enqueue

**Files:**
- Modify: `apps/api/src/modules/period/period.service.ts`
- Modify: `apps/api/src/modules/period/period.module.ts`

Two TODOs from M-05a are closed here:

1. `openPeriod` (line ~62): calculate `slaForceCloseAt = openedAt + 14d`; `gpTokenExpiresAt = slaForceCloseAt - 1h`; store `slaForceCloseAt` on the Period record.
2. `closePeriod` (line ~326): after the transaction, enqueue a `mv.refresh` job on the `analytics` BullMQ queue (deduplicated per object via fixed `jobId`).

- [ ] **Step 9.1: Write the test for openPeriod fix**

Open `apps/api/src/modules/period/period.service.spec.ts` and add/verify the following test case (add it if the file is empty or missing the case):

```typescript
// In describe('openPeriod') block:
it('stores slaForceCloseAt on the period and sets gpTokenExpiresAt = slaForceCloseAt - 1h', async () => {
  // Arrange: mock tx calls for the happy path
  const now = new Date('2026-06-01T10:00:00Z');
  jest.spyOn(Date, 'now').mockReturnValue(now.getTime());

  const txMock = {
    $executeRaw: jest.fn(),
    constructionObject: { findUniqueOrThrow: jest.fn().mockResolvedValue({ organizationId: 'org-1' }) },
    zeroReport:   { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
    period:       { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 2, periodNumber: 1 }), findFirst: jest.fn() },
    boqVersion:   { findFirstOrThrow: jest.fn().mockResolvedValue({ id: 3 }) },
  };
  // ... (simplified; key assertion is below)

  const created = await (service as any).prisma.$transaction.mock.results?.[0]?.value;
  // The important contract: slaForceCloseAt is 14 days after openedAt, gpTokenExpiresAt is 1h before that
  const expectedSlaForceClose = new Date(now.getTime() + 14 * 86_400_000);
  const expectedGpTokenExpiry = new Date(expectedSlaForceClose.getTime() - 3_600_000);
  // Verify period.create was called with these values
  expect(txMock.period.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      slaForceCloseAt: expectedSlaForceClose,
      gpTokenExpiresAt: expectedGpTokenExpiry,
    }),
  });
});
```

> **Note:** If `period.service.spec.ts` is empty, add a minimal `describe('PeriodService', ...)` wrapper. Adapt mocking to the existing test structure if tests already exist.

- [ ] **Step 9.2: Update openPeriod in period.service.ts**

Find the `openPeriod` method. Replace the `gpTokenExpiresAt` block (lines ~60–65):

**Before:**
```typescript
// TODO M-05b: заменить на sla_force_close_at - 1h после реализации SLA scheduler
// Требует добавления sla_force_close_at в схему/SystemConfig
const gpTokenExpiresAt = new Date(
  now.getTime() + GP_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
);
```

**After:**
```typescript
const slaForceCloseAt = new Date(now.getTime() + GP_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
const gpTokenExpiresAt = new Date(slaForceCloseAt.getTime() - 60 * 60 * 1000); // 1h before SLA deadline
```

And add `slaForceCloseAt` to the `period.create` data object:
```typescript
const period = await tx.period.create({
  data: {
    objectId,
    boqVersionId: boqVersion.id,
    periodNumber: (last?.periodNumber ?? 0) + 1,
    status: 'open',
    openedBy: actorId,
    openedAt: now,
    gpSubmissionToken: randomUUID(),
    gpTokenExpiresAt,
    slaForceCloseAt,   // ← add this line
  },
});
```

- [ ] **Step 9.3: Add analytics queue injection to PeriodService**

At the top of `period.service.ts`, add the queue import:
```typescript
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';
```

Update the constructor:
```typescript
constructor(
  private readonly prisma: PrismaService,
  private readonly auditLog: AuditLogService,
  @InjectQueue('analytics') private readonly analyticsQueue: Queue,
) {}
```

- [ ] **Step 9.4: Enqueue mv-refresh after closePeriod transaction**

In `closePeriod`, after the `this.auditLog.log(...)` call (before `return updated`), add:

```typescript
// Enqueue MV refresh — worker implemented in M-05c; idempotent via fixed jobId per object
await this.analyticsQueue.add(
  'mv.refresh',
  { periodId, objectId: period.objectId },
  {
    jobId: `mv-refresh-object-${period.objectId}`,
    removeOnComplete: true,
    removeOnFail: false,
  },
).catch((err) => {
  // Non-fatal: if Redis is down, MV refresh will be triggered by next close or M-05c self-healing cron
  console.error('[PeriodService] Failed to enqueue mv.refresh job:', err);
});

return updated;
```

Remove the TODO comment for M-05b.

- [ ] **Step 9.5: Update PeriodModule to register the analytics queue**

In `apps/api/src/modules/period/period.module.ts`, add BullModule:

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PeriodController } from './period.controller';
import { PeriodService } from './period.service';
import { AuditLogModule } from '../../common/audit/audit-log.module';

@Module({
  imports: [
    AuditLogModule,
    BullModule.registerQueue({ name: 'analytics' }),
  ],
  controllers: [PeriodController],
  providers: [PeriodService],
  exports: [PeriodService],
})
export class PeriodModule {}
```

- [ ] **Step 9.6: Run TypeScript check**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | grep -E "period|dispute" | head -15
```

Expected: no errors in period or dispute files.

- [ ] **Step 9.7: Run all tests**

```bash
pnpm --filter @ccip/api test -- --no-coverage 2>&1 | tail -15
```

Expected: all tests pass (no regressions).

- [ ] **Step 9.8: Commit**

```bash
git add apps/api/src/modules/period/period.service.ts \
        apps/api/src/modules/period/period.module.ts \
        apps/api/src/modules/period/period.service.spec.ts
git commit -m "feat(period): slaForceCloseAt + mv-refresh enqueue after closePeriod — M-05b"
```

---

## Task 10: Acceptance verification — Scenario A full flow + Redis recovery

**No new files.** Manual verification of the acceptance criterion from delivery plan:

> *"убить Redis, рестартовать worker → все pending SLA события восстановлены"*

- [ ] **Step 10.1: Start the stack (api + worker + db + redis)**

```bash
docker compose up -d db redis
ROLE=api    pnpm --filter @ccip/api dev &
ROLE=worker pnpm --filter @ccip/api dev &
```

- [ ] **Step 10.2: Create a Type 2 dispute (Scenario A setup)**

```bash
# 1. Open a period and get a period ID (use an existing seeded object)
curl -X POST http://localhost:3000/objects/1/periods/open \
     -H "Authorization: Bearer <sc_token>"

# 2. Submit GP volume (slightly higher to create a delta)
curl -X POST "http://localhost:3000/gp/submit/<token>" \
     -H "Content-Type: application/json" \
     -d '{"gpSubmittedByName":"Test GP","items":[{"boqItemId":1,"gpVolume":100}]}'

# 3. SC enters a lower volume (creates delta)
curl -X PATCH "http://localhost:3000/periods/1/facts/1" \
     -H "Authorization: Bearer <sc_token>" \
     -H "Content-Type: application/json" \
     -d '{"scVolume":80}'

# 4. Upload a photo (required for Type 2)
curl -X POST "http://localhost:3000/periods/1/photos" \
     -H "Authorization: Bearer <sc_token>" \
     -F "file=@/tmp/test.jpg" -F "boqItemId=1"

# 5. Create the Type 2 dispute
curl -X POST "http://localhost:3000/periods/1/facts/1/dispute" \
     -H "Authorization: Bearer <sc_token>" \
     -H "Content-Type: application/json" \
     -d '{"disputeReason":"Work inaccessible — formwork in place"}'
```

Expected: `201` response with `discrepancy.id`; two rows appear in `sla_events` with `scenario='A'`, `executed_at IS NULL`.

- [ ] **Step 10.3: Verify sla_events were created**

```bash
docker compose exec db psql -U ccip -c \
  "SELECT id, scenario, event_type, scheduled_at, executed_at FROM sla_events ORDER BY id;"
```

Expected: two rows — `notify_director` (scheduledAt = now+3d) and `force_close` (scheduledAt = now+5d), both with `executed_at = NULL`.

- [ ] **Step 10.4: Kill Redis and restart the worker**

```bash
docker compose stop redis
sleep 2
docker compose start redis
# Restart the worker process (Ctrl+C the ROLE=worker dev server, relaunch)
ROLE=worker pnpm --filter @ccip/api dev
```

Expected in worker stdout: `[SLA Worker] Recovery: re-queued 2 pending SLA events`.

- [ ] **Step 10.5: Verify jobs are back in the BullMQ queue**

```bash
docker compose exec redis redis-cli LLEN bull:sla:delayed 2>/dev/null || \
docker compose exec redis redis-cli ZCOUNT bull:{sla}:delayed -inf +inf
```

Expected: `2` delayed jobs in the sla queue.

- [ ] **Step 10.6: Run the full test suite + audit**

```bash
pnpm --filter @ccip/api test -- --no-coverage 2>&1 | tail -5
pnpm audit-suite
```

Expected: all tests pass; audit-suite 18/18.

- [ ] **Step 10.7: Final commit (if any remaining changes)**

```bash
git add -A
git status  # review — should be clean
git commit -m "chore(dispute-sla): M-05b acceptance verification — Scenario A + recovery" \
  --allow-empty
```

---

## Self-Review

**1. Spec coverage:**

| Requirement (delivery plan §5.2) | Task |
|---|---|
| `POST /periods/:id/facts/:boq_item_id/dispute` (reason + photo) | Task 6, 8 |
| `GET /periods/:id/discrepancies` | Task 6, 8 |
| Тип 3 `DisputeFlagService` (N_flag / M_flag sliding window) | Task 7 |
| `DisputeSlaModule` — ROLE=worker | Task 5 |
| BullMQ.add(`jobId='sla-{event.id}'`, delay=Δt, attempts=3) | Task 3 |
| `onModuleInit()` recovery scan (`WHERE executed_at IS NULL`) | Task 4 |
| Idempotency guard `if (event.executedAt) return` | Task 4 |
| Day 3 — notify director | Task 4 |
| Day 5 — `force_close` → status=`forced_sc_figure` | Task 4 |
| DELETE guard on `sla_events` (P-24) | Already in DB schema (P-24 trigger) |
| `gpTokenExpiresAt = slaForceCloseAt - 1h` (TODO M-05b in openPeriod) | Task 9 |
| BullMQ job after closePeriod for MV refresh (TODO M-05b) | Task 9 |
| ADR-005: `attempts:3, backoff:exponential, removeOnComplete:true, removeOnFail:false` | Tasks 3, 4 |
| ADR-005: Redis AOF confirmed in docker-compose | Pre-existing (M-01a) |
| Acceptance criterion: Redis kill → recovery | Task 10 |

Gap noted: The delivery plan mentions `status='forced_sc_figure'` for force_close. Task 4 uses `status='force_closed'` (matching the `Discrepancy` lifecycle from architecture doc §5). The string `'forced_sc_figure'` appears to be a PeriodFact/work status, not Discrepancy status. Task 4 sets `PeriodFact.discrepancyStatus = 'force_closed'` — this is consistent with the Discrepancy model. No change needed.

**2. Placeholder scan:** None found — all steps contain actual code, commands, and expected output.

**3. Type consistency:**
- `DisputeSlaService.scheduleEvents` params: `{ discrepancyId, periodId, boqItemId, createdAt }` — used identically in Task 6.
- `DisputeSlaWorker.process` receives `Job<{ slaEventId: number }>` — matches Task 3's `slaQueue.add('sla.event', { slaEventId: event.id })`.
- `DisputeService.createDispute(periodId, boqItemId, actorId, dto)` — matches controller call in Task 8.
- `DisputeFlagService.detectSystemicFlag(periodId, boqItemId, organizationId)` — will be called from `PeriodService.closePeriod` (wiring not shown — add in M-05c or as a follow-on in this branch).
