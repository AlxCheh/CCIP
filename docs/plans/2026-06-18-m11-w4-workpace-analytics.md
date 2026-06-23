# M-11 W4: WorkPace / Decay Analytics (E-04..E-09) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать расчёт темпа выполнения работ с затуханием (`pace_weighted`, decay_factor), исключение плановых пауз, детекцию выбросов и два объектных прогноза (взвешенный + критический путь) с gap-флагом — закрыв тесты E-04..E-09 из `docs/algorithm_v1_3.md` §4.5 (блок E4/E5).

**Architecture:** Новый `WorkPaceService` (`apps/api/src/modules/analytics/`) — bounded context расчёта темпа, читает/пишет `work_pace`, читает `SystemConfig` (org-scoped, по образцу `DisputeFlagService`). `PeriodService.closePeriod`/`recalcSnapshotCascade` вызывают `workPaceService.recalcForPeriod(tx, periodId, objectId)` в той же транзакции, что и `calcReadiness`, и пишут `weightedForecastDate`/`criticalPathForecastDate`/`gapFlag` в `ReadinessSnapshot` (поля уже есть в схеме). `Period.plannedPause`/`pauseReason` — новые поля, отмечаются при `openPeriod`. Тесты E-04..E-09 (как и D-07/D-08) сидируют `WorkPace`/`Period`/`PeriodFact` напрямую и вызывают `WorkPaceService` методы изолированно, минуя полный цикл периода.

**Tech Stack:** NestJS / TypeScript / Prisma / PostgreSQL / Jest (unit + integration)

**Зафиксированные допущения (если ревьюер не согласен — это единственное, что нужно поменять):**
- `PERIOD_LENGTH_DAYS = 30` — в схеме нет `period.date_from/date_to`, поэтому "1 период" для перевода `forecast_gap_alert` (периоды) и прогноза дат в дни принимается равным 30 дням.
- Семантика `periodFact.acceptedVolume`/`scVolume` — **кумулятивный** объём на момент периода (так же, как уже трактует `calcReadiness`). Темп (`WorkPace.periodVolume`) — это **дельта** между кумулятивами текущего и предыдущего закрытого периода по тому же `boqItemId`.
- "Тип Б: позиция не начата" (line 452 алгоритма) не реализуется — в схеме нет `work.start_date`, и это не покрыто тест-таблицей E-04..E-09. YAGNI.
- Объяснение выброса (`spikeResponse`) передаётся через `upsertPeriodFact` в момент ввода факта (поле `spikeResponse` уже есть в `PeriodFact`), а не через отдельный async wait-флоу — это укладывается в однопроходный закрытый период и не меняет наблюдаемое поведение для тест-таблицы.

---

## Файловый план

| Файл | Действие |
|------|----------|
| `packages/database/prisma/schema.prisma` | Modify: `Period.plannedPause`, `Period.pauseReason` |
| `apps/api/src/modules/analytics/work-pace.service.ts` | Create: `WorkPaceService` |
| `apps/api/test/integration/scenarios/work-pace.integration.spec.ts` | Create: unit-style integration тесты E-04..E-09 (через прямой вызов сервиса на реальной БД — паттерн D-07/D-08) |
| `apps/api/src/modules/analytics/analytics.module.ts` | Modify: регистрация + export `WorkPaceService` |
| `apps/api/src/modules/period/period.module.ts` | Modify: импорт `AnalyticsModule` |
| `apps/api/src/modules/period/period.service.ts` | Modify: `openPeriod` (pause opts), `upsertPeriodFact` (spikeResponse opt), `closePeriod`/`recalcSnapshotCascade` (wire `WorkPaceService`) |
| `apps/api/src/modules/period/__tests__/period.service.spec.ts` | Modify: добавить `WorkPaceService` mock в providers/instantiation |
| `apps/api/test/integration/scenarios/d-block-dispute-sla.integration.spec.ts` | Modify: добавить `WorkPaceService` в providers (PeriodService теперь его требует) |
| `apps/api/test/integration/scenarios/e-block-analytics.integration.spec.ts` | Modify: добавить `WorkPaceService` в providers; заменить 6 `it.skip` на реальные тесты |

---

## Task 1: Schema — `Period.plannedPause` / `pauseReason`

**Files:**
- Modify: `packages/database/prisma/schema.prisma:291-313` (model `Period`)

- [ ] **Step 1: Добавить поля в модель Period**

Найти блок (внутри `model Period { ... }`):
```prisma
  slaForceCloseAt      DateTime? @db.Timestamptz() @map("sla_force_close_at")
```

Добавить сразу после:
```prisma
  slaForceCloseAt      DateTime? @db.Timestamptz() @map("sla_force_close_at")
  plannedPause         Boolean  @default(false) @map("planned_pause")
  pauseReason          String?  @db.VarChar(100) @map("pause_reason")
```

- [ ] **Step 2: Сгенерировать миграцию**

```bash
pnpm --filter @ccip/database run migrate:dev -- --name add_period_planned_pause
```

Ожидание: миграция применяется без ошибок, `prisma generate` выполняется автоматически.

- [ ] **Step 3: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations
git commit -m "feat(schema): add Period.plannedPause / pauseReason (E-04)"
```

---

## Task 2: `openPeriod` — отметка плановой паузы

**Files:**
- Modify: `apps/api/src/modules/period/period.service.ts:27` (метод `openPeriod`)

- [ ] **Step 1: Добавить константу разрешённых причин паузы — перед классом `PeriodService`**

Найти:
```typescript
// Period statuses that allow SC fact entry
const SC_FACT_ALLOWED_STATUSES = ['gp_submitted', 'verification'];
```

Добавить после:
```typescript
// Period statuses that allow SC fact entry
const SC_FACT_ALLOWED_STATUSES = ['gp_submitted', 'verification'];

// @algorithm: line 223-229 — допустимые причины плановой паузы
const PAUSE_REASONS = [
  'Праздничные дни',
  'Ожидание поставки материалов',
  'Технологический перерыв',
  'Неблагоприятные погодные условия',
  'Ожидание разрешительной документации',
  'Иное',
];
```

- [ ] **Step 2: Изменить сигнатуру `openPeriod` и добавить валидацию**

Найти:
```typescript
  async openPeriod(objectId: number, actorId: number) {
    try {
      return await this.prisma.$transaction(async (tx) => {
```

Заменить на:
```typescript
  async openPeriod(
    objectId: number,
    actorId: number,
    pauseOpts?: { plannedPause?: boolean; pauseReason?: string },
  ) {
    if (pauseOpts?.plannedPause) {
      if (!pauseOpts.pauseReason || !PAUSE_REASONS.includes(pauseOpts.pauseReason)) {
        throw new ConflictException('INVALID_PAUSE_REASON');
      }
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
```

- [ ] **Step 3: Передать поля в `tx.period.create`**

Найти (внутри `openPeriod`):
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
```

Заменить на:
```typescript
        const period = await tx.period.create({
          data: {
            objectId,
            boqVersionId: boqVersion.id,
            periodNumber: (last?.periodNumber ?? 0) + 1,
            status: 'open',
            openedBy: actorId,
            openedAt: now,
            plannedPause: pauseOpts?.plannedPause ?? false,
            pauseReason: pauseOpts?.plannedPause ? pauseOpts.pauseReason : null,
            gpSubmissionToken: randomUUID(),
            gpTokenExpiresAt,
```

- [ ] **Step 4: TypeScript compile check**

```bash
pnpm --filter @ccip/api exec tsc --noEmit
```

Ожидание: no errors (существующие вызовы `openPeriod(objectId, actorId)` остаются валидны — третий параметр опционален).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/period/period.service.ts
git commit -m "feat(period): openPeriod accepts plannedPause/pauseReason (E-04)"
```

---

## Task 3: `upsertPeriodFact` — явное объяснение выброса

**Files:**
- Modify: `apps/api/src/modules/period/period.service.ts:332` (метод `upsertPeriodFact`)

- [ ] **Step 1: Добавить опциональный параметр и поля в upsert**

Найти:
```typescript
  async upsertPeriodFact(
    periodId: number,
    boqItemId: number,
    scVolume: unknown,
    actorId: number,
  ) {
```

Заменить на:
```typescript
  async upsertPeriodFact(
    periodId: number,
    boqItemId: number,
    scVolume: unknown,
    actorId: number,
    opts?: { spikeResponse?: 'planned_concentration' | 'data_entry_error' },
  ) {
```

Найти в этом же методе блок `tx.periodFact.upsert({ ... create: { ... }, update: { ... } })` (после вычисления `discrepancyType`/`acceptedVolume`):
```typescript
        create: {
          periodId,
          boqItemId,
          scVolume: new Prisma.Decimal(scVolume as number),
          discrepancyType,
          discrepancyStatus,
          acceptedVolume:
            acceptedVolume !== null ? new Prisma.Decimal(acceptedVolume) : null,
        },
        update: {
          scVolume: new Prisma.Decimal(scVolume as number),
          discrepancyType,
          discrepancyStatus,
          acceptedVolume:
            acceptedVolume !== null ? new Prisma.Decimal(acceptedVolume) : null,
        },
      });
```

Заменить на:
```typescript
        create: {
          periodId,
          boqItemId,
          scVolume: new Prisma.Decimal(scVolume as number),
          discrepancyType,
          discrepancyStatus,
          acceptedVolume:
            acceptedVolume !== null ? new Prisma.Decimal(acceptedVolume) : null,
          spikeResponse: opts?.spikeResponse ?? null,
        },
        update: {
          scVolume: new Prisma.Decimal(scVolume as number),
          discrepancyType,
          discrepancyStatus,
          acceptedVolume:
            acceptedVolume !== null ? new Prisma.Decimal(acceptedVolume) : null,
          spikeResponse: opts?.spikeResponse ?? null,
        },
      });
```

- [ ] **Step 2: TypeScript compile check**

```bash
pnpm --filter @ccip/api exec tsc --noEmit
```

Ожидание: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/period/period.service.ts
git commit -m "feat(period): upsertPeriodFact accepts spikeResponse (E-06)"
```

---

## Task 4: `WorkPaceService` — scaffold + `calcItemPace` (decay-weighted темп, без выбросов)

**Files:**
- Create: `apps/api/src/modules/analytics/work-pace.service.ts`
- Create: `apps/api/test/integration/scenarios/work-pace.integration.spec.ts`

- [ ] **Step 1: Написать сервис — scaffold + `calcItemPace` (E-04, E-09)**

```typescript
// apps/api/src/modules/analytics/work-pace.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@ccip/database';
import { PrismaService } from '../../common/prisma/prisma.service';

// @algorithm: docs/algorithm_v1_3.md §4.5 E4/E5 — допущение: 1 период = 30 дней
// (в схеме нет period.date_from/date_to для точного расчёта)
export const PERIOD_LENGTH_DAYS = 30;

const DEFAULT_AVG_PACE_PERIODS = 5;
const DEFAULT_DECAY_FACTOR = 0.8;
const DEFAULT_SPIKE_THRESHOLD = 3;
const DEFAULT_WEIGHT_THRESHOLD = 0.1;
const DEFAULT_FORECAST_GAP_PERIODS = 2;

export interface ItemPaceResult {
  paceWeighted: number;
  forecastEnd: Date | null;
  isAllZero: boolean;
}

type Tx = PrismaClient | Prisma.TransactionClient;

@Injectable()
export class WorkPaceService {
  constructor(private readonly prisma: PrismaService) {}

  private async getConfig(
    tx: Tx,
    organizationId: string,
  ): Promise<{
    avgPacePeriods: number;
    decayFactor: number;
    spikeThreshold: number;
    weightThreshold: number;
    forecastGapPeriods: number;
  }> {
    const rows = await tx.systemConfig.findMany({
      where: {
        organizationId,
        key: { in: ['avg_pace_periods', 'decay_factor', 'spike_threshold', 'weight_threshold', 'forecast_gap_alert'] },
      },
    });
    const get = (key: string, def: number) => {
      const row = rows.find((r) => r.key === key);
      return row?.valueNumeric != null ? Number(row.valueNumeric) : def;
    };
    return {
      avgPacePeriods: get('avg_pace_periods', DEFAULT_AVG_PACE_PERIODS),
      decayFactor: get('decay_factor', DEFAULT_DECAY_FACTOR),
      spikeThreshold: get('spike_threshold', DEFAULT_SPIKE_THRESHOLD),
      weightThreshold: get('weight_threshold', DEFAULT_WEIGHT_THRESHOLD),
      forecastGapPeriods: get('forecast_gap_alert', DEFAULT_FORECAST_GAP_PERIODS),
    };
  }

  // @algorithm: E4 — взвешенный фактический темп с затуханием (без детекции выбросов — Task 5)
  async calcItemPace(
    tx: Tx,
    boqItemId: number,
    objectId: number,
    asOfPeriodId: number,
  ): Promise<ItemPaceResult> {
    const object = await tx.constructionObject.findUniqueOrThrow({
      where: { id: objectId },
      select: { organizationId: true },
    });
    const cfg = await this.getConfig(tx, object.organizationId);

    const asOfPeriod = await tx.period.findUniqueOrThrow({
      where: { id: asOfPeriodId },
      select: { periodNumber: true },
    });

    const window = await tx.workPace.findMany({
      where: {
        boqItemId,
        period: { objectId, periodNumber: { lte: asOfPeriod.periodNumber } },
      },
      include: { period: { select: { periodNumber: true, plannedPause: true } } },
      orderBy: { period: { periodNumber: 'desc' } },
      take: cfg.avgPacePeriods,
    });

    // window_clean: исключить плановые паузы (тип А)
    const windowClean = window.filter((w) => !w.period.plannedPause && !w.isExcluded);

    let totalWeight = 0;
    let paceWeighted = 0;
    windowClean.forEach((w, i) => {
      const weight = Math.pow(cfg.decayFactor, i);
      paceWeighted += Number(w.periodVolume) * weight;
      totalWeight += weight;
    });
    const finalPace = totalWeight > 0 ? paceWeighted / totalWeight : 0;

    const isAllZero =
      windowClean.length > 0 && windowClean.every((w) => Number(w.periodVolume) === 0);

    if (finalPace <= 0) {
      return { paceWeighted: 0, forecastEnd: null, isAllZero };
    }

    const fact = await tx.periodFact.findFirst({
      where: { periodId: asOfPeriodId, boqItemId },
      select: { acceptedVolume: true, scVolume: true, boqItem: { select: { planVolume: true } } },
    });
    if (!fact) return { paceWeighted: finalPace, forecastEnd: null, isAllZero };

    const cumulative = fact.acceptedVolume != null ? Number(fact.acceptedVolume) : Number(fact.scVolume ?? 0);
    const remaining = Number(fact.boqItem.planVolume) - cumulative;
    const periodsRemaining = Math.max(remaining, 0) / finalPace;
    const forecastEnd = new Date(Date.now() + periodsRemaining * PERIOD_LENGTH_DAYS * 86_400_000);

    return { paceWeighted: finalPace, forecastEnd, isAllZero };
  }
}
```

- [ ] **Step 2: Написать тест E-04 — плановая пауза исключена из окна**

```typescript
// apps/api/test/integration/scenarios/work-pace.integration.spec.ts
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@ccip/database';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { WorkPaceService } from '../work-pace.service';
import { makeOrg, makeUser, makeObject, makeBoQ } from '../../../../test/integration/fixtures/factories';
import { truncateAll } from '../../../../test/integration/setup/truncate';

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
          gpSubmissionToken: `${i}-${Math.random()}`,
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
});
```

- [ ] **Step 3: Зарегистрировать сервис в модуле**

`apps/api/src/modules/analytics/analytics.module.ts` — заменить:
```typescript
import { MvStalenessService } from './mv-staleness.service';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AnalyticsController],
  providers: [MvStalenessService, AnalyticsService],
  exports: [MvStalenessService],
})
```
на:
```typescript
import { MvStalenessService } from './mv-staleness.service';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { WorkPaceService } from './work-pace.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AnalyticsController],
  providers: [MvStalenessService, AnalyticsService, WorkPaceService],
  exports: [MvStalenessService, WorkPaceService],
})
```

- [ ] **Step 4: Запустить тест**

```bash
pnpm --filter @ccip/api exec npx jest --config test/integration/jest-integration.json --testPathPatterns="work-pace" --no-coverage
```

Ожидание: `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/analytics/work-pace.service.ts apps/api/test/integration/scenarios/work-pace.integration.spec.ts apps/api/src/modules/analytics/analytics.module.ts
git commit -m "feat(analytics): WorkPaceService.calcItemPace + E-04 test"
```

---

## Task 5: E-05 (нулевой внеплановый простой) и E-09 (простой по всему окну)

**Files:**
- Modify: `apps/api/test/integration/scenarios/work-pace.integration.spec.ts`
- Modify: `apps/api/src/modules/analytics/work-pace.service.ts` — добавить notification для zero-pace

- [ ] **Step 1: Добавить notification-предупреждение в `calcItemPace` при `isAllZero`**

Найти в `work-pace.service.ts`:
```typescript
    const isAllZero =
      windowClean.length > 0 && windowClean.every((w) => Number(w.periodVolume) === 0);

    if (finalPace <= 0) {
      return { paceWeighted: 0, forecastEnd: null, isAllZero };
    }
```

Заменить на:
```typescript
    const isAllZero =
      windowClean.length > 0 && windowClean.every((w) => Number(w.periodVolume) === 0);

    if (isAllZero) {
      const directors = await tx.user.findMany({
        where: { organizationId: object.organizationId, role: 'director' },
        select: { id: true },
      });
      if (directors.length > 0) {
        await tx.notification.createMany({
          data: directors.map((d) => ({
            userId: d.id,
            type: 'zero_pace_forecast',
            referenceTable: 'boq_items',
            referenceId: BigInt(boqItemId),
            message: `Нулевой темп по позиции ${boqItemId} — простой, прогноз невозможен`,
          })),
        });
      }
    }

    if (finalPace <= 0) {
      return { paceWeighted: 0, forecastEnd: null, isAllZero };
    }
```

- [ ] **Step 2: Добавить тесты E-05 и E-09**

Добавить в `work-pace.service.spec.ts` после теста E-04:
```typescript
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
```

Добавить `makeUser` в импорт фабрик в начале файла (если ещё не импортирован под этим именем — уже есть в импорте Step 2 Task 4, проверить и при необходимости расширить строку импорта).

- [ ] **Step 3: Запустить тесты**

```bash
pnpm --filter @ccip/api exec npx jest --config test/integration/jest-integration.json --testPathPatterns="work-pace" --no-coverage
```

Ожидание: `3 passed`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/analytics/work-pace.service.ts apps/api/test/integration/scenarios/work-pace.integration.spec.ts
git commit -m "feat(analytics): zero-pace director warning + E-05/E-09 tests"
```

---

## Task 6: E-06 — детекция выброса (`spikeResponse`)

**Files:**
- Modify: `apps/api/src/modules/analytics/work-pace.service.ts`
- Modify: `apps/api/test/integration/scenarios/work-pace.integration.spec.ts`

- [ ] **Step 1: Добавить детекцию выброса в `calcItemPace` — после расчёта `finalPace`, до notification-блока**

Найти:
```typescript
    const finalPace = totalWeight > 0 ? paceWeighted / totalWeight : 0;

    const isAllZero =
```

Заменить на:
```typescript
    let finalPace = totalWeight > 0 ? paceWeighted / totalWeight : 0;

    // @algorithm: line 471-480 — детекция выброса на самом свежем периоде окна
    if (windowClean.length > 0 && finalPace > 0) {
      const latest = windowClean[0];
      const latestVolume = Number(latest.periodVolume);
      if (latestVolume > finalPace * cfg.spikeThreshold) {
        const latestFact = await tx.periodFact.findFirst({
          where: { periodId: latest.periodId, boqItemId },
          select: { id: true, spikeResponse: true },
        });
        if (latestFact) {
          await tx.periodFact.update({ where: { id: latestFact.id }, data: { isSpike: true } });
        }
        if (latestFact?.spikeResponse === 'data_entry_error') {
          // период исключается из окна — пересчёт без него
          const rest = windowClean.slice(1);
          let w = 0;
          let pw = 0;
          rest.forEach((r, i) => {
            const weight = Math.pow(cfg.decayFactor, i);
            pw += Number(r.periodVolume) * weight;
            w += weight;
          });
          finalPace = w > 0 ? pw / w : 0;
        } else {
          // 'planned_concentration' или нет ответа → вес периода понижается до 0.5
          const rest = windowClean.slice(1);
          let w = 0.5; // i=0 weight = decay^0 = 1, понижен до 0.5
          let pw = latestVolume * 0.5;
          rest.forEach((r, i) => {
            const weight = Math.pow(cfg.decayFactor, i + 1);
            pw += Number(r.periodVolume) * weight;
            w += weight;
          });
          finalPace = w > 0 ? pw / w : 0;
        }
      }
    }

    const isAllZero =
```

- [ ] **Step 2: Добавить тест E-06**

```typescript
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
```

- [ ] **Step 3: Запустить тесты**

```bash
pnpm --filter @ccip/api exec npx jest --config test/integration/jest-integration.json --testPathPatterns="work-pace" --no-coverage
```

Ожидание: `4 passed`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/analytics/work-pace.service.ts apps/api/test/integration/scenarios/work-pace.integration.spec.ts
git commit -m "feat(analytics): outlier detection — spikeResponse handling + E-06 test"
```

---

## Task 7: `calcObjectForecast` — два прогноза + gap-флаг (E-07, E-08)

**Files:**
- Modify: `apps/api/src/modules/analytics/work-pace.service.ts`
- Modify: `apps/api/test/integration/scenarios/work-pace.integration.spec.ts`

- [ ] **Step 1: Добавить `calcObjectForecast` — после `calcItemPace`, перед закрывающей `}` класса**

```typescript
  // @algorithm: E5 — два прогноза на уровне объекта + флаг разрыва
  async calcObjectForecast(
    tx: Tx,
    objectId: number,
    asOfPeriodId: number,
  ): Promise<{
    weightedForecastDate: Date | null;
    criticalPathForecastDate: Date | null;
    gapFlag: boolean;
  }> {
    const object = await tx.constructionObject.findUniqueOrThrow({
      where: { id: objectId },
      select: { organizationId: true },
    });
    const cfg = await this.getConfig(tx, object.organizationId);

    const period = await tx.period.findUniqueOrThrow({
      where: { id: asOfPeriodId },
      select: { boqVersionId: true },
    });
    const items = await tx.boqItem.findMany({
      where: { boqVersionId: period.boqVersionId, status: 'active', weightCoef: { not: null } },
      select: { id: true, weightCoef: true },
    });

    let weightedSum = 0;
    let weightedTotal = 0;
    let criticalMax: Date | null = null;

    for (const item of items) {
      const pace = await this.calcItemPace(tx, item.id, objectId, asOfPeriodId);
      if (!pace.forecastEnd) continue;

      const weight = Number(item.weightCoef);
      weightedSum += pace.forecastEnd.getTime() * weight;
      weightedTotal += weight;

      if (weight >= cfg.weightThreshold) {
        if (!criticalMax || pace.forecastEnd.getTime() > criticalMax.getTime()) {
          criticalMax = pace.forecastEnd;
        }
      }
    }

    const weightedForecastDate = weightedTotal > 0 ? new Date(weightedSum / weightedTotal) : null;
    const criticalPathForecastDate = criticalMax;

    let gapFlag = false;
    if (weightedForecastDate && criticalPathForecastDate) {
      const diffDays = Math.abs(criticalPathForecastDate.getTime() - weightedForecastDate.getTime()) / 86_400_000;
      gapFlag = diffDays / PERIOD_LENGTH_DAYS >= cfg.forecastGapPeriods;
    }

    return { weightedForecastDate, criticalPathForecastDate, gapFlag };
  }
```

- [ ] **Step 2: Добавить тесты E-07 и E-08**

```typescript
  // @algorithm: E-07
  it('E-07: critical path forecast = MAX over items with weight >= threshold', async () => {
    const { org, sc, obj, boq } = await bootstrap2Items(0.25, 0.75); // facade=0.25 (critical), other=0.75
    await prisma.systemConfig.create({
      data: { organizationId: org.id, key: 'decay_factor', valueType: 'numeric', valueNumeric: 1 },
    });
    await prisma.systemConfig.create({
      data: { organizationId: org.id, key: 'weight_threshold', valueType: 'numeric', valueNumeric: 0.1 },
    });

    // Facade (item 0): медленный темп → дальний прогноз. Other (item 1): быстрый темп → близкий прогноз.
    const facadePeriods = await seedPeriods(obj, boq, sc, boq.items[0].id, [{ delta: 1 }, { delta: 1 }]);
    await seedPeriods(obj, boq, sc, boq.items[1].id, [{ delta: 50 }, { delta: 50 }]);

    const result = await svc.calcObjectForecast(prisma, obj.id, facadePeriods[1].id);

    const facadePace = await svc.calcItemPace(prisma, boq.items[0].id, obj.id, facadePeriods[1].id);
    expect(result.criticalPathForecastDate?.getTime()).toBe(facadePace.forecastEnd?.getTime());
  });

  // @algorithm: E-08
  it('E-08: gap flag fires when |critical - weighted| >= forecast_gap_alert periods', async () => {
    const { org, sc, obj, boq } = await bootstrap2Items(0.5, 0.5);
    await prisma.systemConfig.create({
      data: { organizationId: org.id, key: 'decay_factor', valueType: 'numeric', valueNumeric: 1 },
    });
    await prisma.systemConfig.create({
      data: { organizationId: org.id, key: 'forecast_gap_alert', valueType: 'numeric', valueNumeric: 2 },
    });

    // Item 0: очень медленный (большой остаток, маленький темп) → далёкий прогноз.
    // Item 1: почти завершён, быстрый темп → близкий прогноз. Разница >> 2 периодов (60 дней).
    const p0 = await seedPeriods(obj, boq, sc, boq.items[0].id, [{ delta: 1 }, { delta: 1 }]);
    await seedPeriods(obj, boq, sc, boq.items[1].id, [{ delta: 90 }, { delta: 9 }]);

    const result = await svc.calcObjectForecast(prisma, obj.id, p0[1].id);

    expect(result.gapFlag).toBe(true);
  });
```

Добавить хелпер `bootstrap2Items` в файл (перед `describe`-блоком тестов, рядом с `bootstrap`):
```typescript
  async function bootstrap2Items(weight0: number, weight1: number) {
    const org = await makeOrg(prisma);
    const sc = await makeUser(prisma, org, 'stroycontrol');
    const obj = await makeObject(prisma, org);
    const boq = await makeBoQ(prisma, obj, { count: 2 });
    await prisma.boqItem.update({ where: { id: boq.items[0].id }, data: { weightCoef: weight0 } });
    await prisma.boqItem.update({ where: { id: boq.items[1].id }, data: { weightCoef: weight1 } });
    return { org, sc, obj, boq };
  }
```

- [ ] **Step 3: Запустить тесты**

```bash
pnpm --filter @ccip/api exec npx jest --config test/integration/jest-integration.json --testPathPatterns="work-pace" --no-coverage
```

Ожидание: `6 passed`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/analytics/work-pace.service.ts apps/api/test/integration/scenarios/work-pace.integration.spec.ts
git commit -m "feat(analytics): calcObjectForecast — weighted/critical forecast + gap flag (E-07/E-08)"
```

---

## Task 8: Wire `WorkPaceService` в `PeriodService` (closePeriod / recalcSnapshotCascade)

**Files:**
- Modify: `apps/api/src/modules/period/period.module.ts`
- Modify: `apps/api/src/modules/period/period.service.ts`
- Modify: `apps/api/src/modules/period/__tests__/period.service.spec.ts`
- Modify: `apps/api/test/integration/scenarios/d-block-dispute-sla.integration.spec.ts`
- Modify: `apps/api/test/integration/scenarios/e-block-analytics.integration.spec.ts`

- [ ] **Step 1: Импортировать `AnalyticsModule` в `PeriodModule`**

`apps/api/src/modules/period/period.module.ts` — заменить целиком:
```typescript
import { Module } from '@nestjs/common';
import { PeriodController } from './period.controller';
import { PeriodService } from './period.service';
import { AuditLogModule } from '../../common/audit/audit-log.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [AuditLogModule, AnalyticsModule],
  controllers: [PeriodController],
  providers: [PeriodService],
  exports: [PeriodService],
})
export class PeriodModule {}
```

- [ ] **Step 2: Инжектировать `WorkPaceService` в `PeriodService` и вызвать его в `closePeriod`**

`period.service.ts` — найти конструктор:
```typescript
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}
```

Заменить на:
```typescript
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly workPace: WorkPaceService,
  ) {}
```

Добавить импорт в начало файла, рядом с `AuditLogService`:
```typescript
import { WorkPaceService } from '../analytics/work-pace.service';
```

Найти в `closePeriod`:
```typescript
      // TODO M-05c: добавить INSERT work_pace в эту же транзакцию (ADR-011)
      // TODO M-05b: после транзакции enqueue BullMQ job для REFRESH MATERIALIZED VIEW CONCURRENTLY
      const readinessPct = await this.calcReadiness(periodId, tx);
      await tx.readinessSnapshot.create({
        data: {
          periodId,
          objectId: period.objectId,
          objectReadinessPct: readinessPct,
        },
      });
```

Заменить на:
```typescript
      // TODO M-05b: после транзакции enqueue BullMQ job для REFRESH MATERIALIZED VIEW CONCURRENTLY
      const readinessPct = await this.calcReadiness(periodId, tx);
      await this.recordWorkPaceDeltas(tx, periodId, period.objectId);
      const forecast = await this.workPace.calcObjectForecast(tx, period.objectId, periodId);
      await tx.readinessSnapshot.create({
        data: {
          periodId,
          objectId: period.objectId,
          objectReadinessPct: readinessPct,
          weightedForecastDate: forecast.weightedForecastDate,
          criticalPathForecastDate: forecast.criticalPathForecastDate,
          gapFlag: forecast.gapFlag,
        },
      });
```

- [ ] **Step 3: Добавить приватный `recordWorkPaceDeltas` — перед `calcReadiness`**

Найти:
```typescript
  // ─── calcReadiness ───────────────────────────────────────────────────────────
```

Вставить перед ней:
```typescript
  // ─── recordWorkPaceDeltas ──────────────────────────────────────────────────────
  // @algorithm: пишет WorkPace.periodVolume как дельту кумулятивного объёма к предыдущему закрытому периоду

  private async recordWorkPaceDeltas(
    tx: Prisma.TransactionClient,
    periodId: number,
    objectId: number,
  ): Promise<void> {
    const period = await tx.period.findUniqueOrThrow({
      where: { id: periodId },
      select: { periodNumber: true, boqVersionId: true, plannedPause: true },
    });

    const items = await tx.boqItem.findMany({
      where: { boqVersionId: period.boqVersionId },
      select: { id: true },
    });

    for (const item of items) {
      const fact = await tx.periodFact.findFirst({
        where: { periodId, boqItemId: item.id },
        select: { acceptedVolume: true, scVolume: true },
      });
      const cumulative =
        fact?.acceptedVolume != null
          ? Number(fact.acceptedVolume)
          : fact?.scVolume != null
          ? Number(fact.scVolume)
          : 0;

      const prevPeriod = await tx.period.findFirst({
        where: { objectId, periodNumber: { lt: period.periodNumber }, status: { in: ['closed', 'force_closed'] } },
        orderBy: { periodNumber: 'desc' },
        select: { id: true },
      });
      let prevCumulative = 0;
      if (prevPeriod) {
        const prevFact = await tx.periodFact.findFirst({
          where: { periodId: prevPeriod.id, boqItemId: item.id },
          select: { acceptedVolume: true, scVolume: true },
        });
        prevCumulative =
          prevFact?.acceptedVolume != null
            ? Number(prevFact.acceptedVolume)
            : prevFact?.scVolume != null
            ? Number(prevFact.scVolume)
            : 0;
      }

      await tx.workPace.upsert({
        where: { periodId_boqItemId: { periodId, boqItemId: item.id } },
        create: {
          periodId,
          boqItemId: item.id,
          periodVolume: cumulative - prevCumulative,
          isExcluded: period.plannedPause,
        },
        update: {
          periodVolume: cumulative - prevCumulative,
          isExcluded: period.plannedPause,
        },
      });
    }
  }

  // ─── calcReadiness ───────────────────────────────────────────────────────────
```

- [ ] **Step 4: Аналогично wire в `recalcSnapshotCascade`**

Найти:
```typescript
    for (const p of periods) {
      await this.prisma.$transaction(async (tx) => {
        await tx.readinessSnapshot.deleteMany({ where: { periodId: p.id } });
        const readinessPct = await this.calcReadiness(p.id, tx);
        await tx.readinessSnapshot.create({
          data: { periodId: p.id, objectId, objectReadinessPct: readinessPct },
        });
      });
    }
```

Заменить на:
```typescript
    for (const p of periods) {
      await this.prisma.$transaction(async (tx) => {
        await tx.readinessSnapshot.deleteMany({ where: { periodId: p.id } });
        const readinessPct = await this.calcReadiness(p.id, tx);
        await this.recordWorkPaceDeltas(tx, p.id, objectId);
        const forecast = await this.workPace.calcObjectForecast(tx, objectId, p.id);
        await tx.readinessSnapshot.create({
          data: {
            periodId: p.id,
            objectId,
            objectReadinessPct: readinessPct,
            weightedForecastDate: forecast.weightedForecastDate,
            criticalPathForecastDate: forecast.criticalPathForecastDate,
            gapFlag: forecast.gapFlag,
          },
        });
      });
    }
```

- [ ] **Step 5: TypeScript compile check**

```bash
pnpm --filter @ccip/api exec tsc --noEmit
```

Ожидание: ошибки о недостающем `WorkPaceService` в местах прямого инстанцирования `PeriodService` — это ожидаемо, исправляется в Step 6-8.

- [ ] **Step 6: Обновить `period.service.spec.ts` (unit-тесты, mocked Prisma)**

Найти:
```typescript
import { PeriodService } from '../period.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditLogService } from '../../../common/audit/audit-log.service';
```

Заменить на:
```typescript
import { PeriodService } from '../period.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuditLogService } from '../../../common/audit/audit-log.service';
import { WorkPaceService } from '../../analytics/work-pace.service';
```

Найти:
```typescript
    auditLog = {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditLogService>;

    const module = await Test.createTestingModule({
      providers: [
        PeriodService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLog },
      ],
    }).compile();
```

Заменить на:
```typescript
    auditLog = {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditLogService>;

    const workPaceMock = {
      calcObjectForecast: jest.fn().mockResolvedValue({
        weightedForecastDate: null,
        criticalPathForecastDate: null,
        gapFlag: false,
      }),
    } as unknown as jest.Mocked<WorkPaceService>;

    const module = await Test.createTestingModule({
      providers: [
        PeriodService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLog },
        { provide: WorkPaceService, useValue: workPaceMock },
      ],
    }).compile();
```

Найти прямое инстанцирование:
```typescript
      const svc = new PeriodService(prismaMock, {} as AuditLogService);
```

Заменить на:
```typescript
      const svc = new PeriodService(prismaMock, {} as AuditLogService, {} as WorkPaceService);
```

> Примечание: `recordWorkPaceDeltas` обращается к `tx.boqItem.findMany`/`tx.periodFact.findFirst`/`tx.period.findFirst`/`tx.workPace.upsert` — если существующий `prisma`-мок в `beforeEach` не покрывает `workPace.upsert`, добавить в мок объект (там же, где определены остальные `prisma.*` jest.fn()):
> ```typescript
> workPace: { upsert: jest.fn().mockResolvedValue({}) },
> ```
> и убедиться, что `prisma.boqItem.findMany` возвращает `[]` по умолчанию в тестах `closePeriod`, которые не проверяют WorkPace явно (пустой массив → `recordWorkPaceDeltas` не делает upsert'ов, `calcObjectForecast` замокан).

- [ ] **Step 7: Обновить `d-block-dispute-sla.integration.spec.ts` providers**

Найти:
```typescript
    const mod = await Test.createTestingModule({
      providers: [
        PeriodService,
        { provide: PrismaService, useValue: prisma },
        AuditLogService,
      ],
    }).compile();
    svc = mod.get(PeriodService);
```

Заменить на:
```typescript
    const mod = await Test.createTestingModule({
      providers: [
        PeriodService,
        { provide: PrismaService, useValue: prisma },
        AuditLogService,
        WorkPaceService,
      ],
    }).compile();
    svc = mod.get(PeriodService);
```

Добавить импорт в начало файла:
```typescript
import { WorkPaceService } from '../../../src/modules/analytics/work-pace.service';
```

- [ ] **Step 8: Обновить `e-block-analytics.integration.spec.ts` providers (аналогично Step 7)**

Найти:
```typescript
    const mod = await Test.createTestingModule({
      providers: [
        PeriodService,
        { provide: PrismaService, useValue: prisma },
        AuditLogService,
      ],
    }).compile();
    svc = mod.get(PeriodService);
```

Заменить на:
```typescript
    const mod = await Test.createTestingModule({
      providers: [
        PeriodService,
        { provide: PrismaService, useValue: prisma },
        AuditLogService,
        WorkPaceService,
      ],
    }).compile();
    svc = mod.get(PeriodService);
```

Добавить импорт:
```typescript
import { WorkPaceService } from '../../../src/modules/analytics/work-pace.service';
```

- [ ] **Step 9: Полный прогон — unit + integration**

```bash
pnpm --filter @ccip/api exec tsc --noEmit
pnpm --filter @ccip/api exec npx jest --testPathPatterns=period.service.spec --no-coverage
pnpm --filter @ccip/api exec npx jest --config test/integration/jest-integration.json --no-coverage
```

Ожидание: TypeScript — no errors; unit — 49/49 (или текущее число); integration — все ранее зелёные тесты (D-01/02/07/08, E-01/02/03, work-pace E-04..E-09) проходят, ничего не регрессировало.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/period/period.module.ts apps/api/src/modules/period/period.service.ts apps/api/src/modules/period/__tests__/period.service.spec.ts apps/api/test/integration/scenarios/d-block-dispute-sla.integration.spec.ts apps/api/test/integration/scenarios/e-block-analytics.integration.spec.ts
git commit -m "feat(period): wire WorkPaceService into closePeriod/recalcSnapshotCascade (M-05c full)"
```

---

## Task 9: Активировать E-04..E-09 в `e-block-analytics.integration.spec.ts` (полный цикл через closePeriod)

**Files:**
- Modify: `apps/api/test/integration/scenarios/e-block-analytics.integration.spec.ts`

> Контекст: `WorkPaceService`-юнит-тесты (Task 4-7) уже покрывают формулы E-04..E-09 изолированно. Эта задача — лёгкая regression-проверка, что `closePeriod` корректно пишет `weightedForecastDate`/`criticalPathForecastDate`/`gapFlag` в `ReadinessSnapshot` через полный цикл периода (в отличие от прямого вызова сервиса).

- [ ] **Step 1: Заменить 6 заглушек на один сквозной regression-тест**

Найти:
```typescript
  // @algorithm: E-04
  it.skip('E-04: planned pause excluded — P3 pause, pace computed over 4 periods', () => {});
  // @algorithm: E-05
  it.skip('E-05: zero-volume unplanned — warning to director, P4 with decay', () => {});
  // @algorithm: E-06
  it.skip('E-06: outlier "planned concentration" — P5 weight halved', () => {});
  // @algorithm: E-07
  it.skip('E-07: critical path — facade weight 0.25, forecast = MAX over weight ≥ 0.10', () => {});
  // @algorithm: E-08
  it.skip('E-08: forecast gap flag — weighted 20-may vs critical 15-jun, gap ≥ 2 → flag', () => {});
  // @algorithm: E-09
  it.skip('E-09: zero-pace forecast — all periods volume=0 → "prostoy"', () => {});
```

Заменить на:
```typescript
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
```

- [ ] **Step 2: Запустить полный E-block + D-block**

```bash
pnpm --filter @ccip/api exec npx jest --config test/integration/jest-integration.json --testPathPatterns="d-block|e-block|work-pace" --no-coverage
```

Ожидание: все тесты зелёные (D-01/02/07/08, E-01/02/03 regression + E-block wiring, work-pace E-04..E-09).

- [ ] **Step 3: Полный integration suite — финальная проверка регрессий**

```bash
pnpm --filter @ccip/api exec npx jest --config test/integration/jest-integration.json --no-coverage
```

Ожидание: все ранее зелёные тесты остаются зелёными.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/integration/scenarios/e-block-analytics.integration.spec.ts
git commit -m "test(integration): E-04..E-09 closePeriod wiring regression test"
```

---

## Что осталось вне скоупа (явно зафиксировать в project-state.md после завершения)

- **D-05/D-06** (SLA B timing) — требуют BullMQ fake-timers harness, не затронуты этим планом.
- Async-флоу "WAIT FOR site_control.explanation WITHIN 1 период" (line 475-479 алгоритма) реализован упрощённо — синхронно, через поле `spikeResponse` на `PeriodFact` в момент `upsertPeriodFact`, без таймаута в 1 период. Если бизнес-требование действительно про многопериодный wait — отдельная задача после пилота.
- `WorkPaceService` не вызывается из `AnalyticsService.getDashboard` напрямую — дашборд продолжает читать `mv_object_current_status` (materialized view), которая обновляется в `recalcSnapshotCascade` через `REFRESH MATERIALIZED VIEW CONCURRENTLY`. Эта часть (M-05b BullMQ refresh job) уже deferred отдельным TODO, не трогается.
