# M-10 Security / Immutability / REVOKE — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Завершить ADR-007 (app-level immutability) и ADR-009 (public-routes allowlist) — добавить `assertPeriodEditable`, `adminCorrectFact`, `recalcSnapshotCascade`, HTTP-эндпоинт Admin и задокументировать публичные маршруты.

**Architecture:** App-level guard (`assertPeriodEditable`) блокирует любую запись в закрытый период до того, как изменение дойдёт до БД. Admin-коррекция идёт строго через DB SECURITY DEFINER функцию `fn_admin_correct_fact` — единственный легальный UPDATE path на period_facts (REVOKE уже в migration 0001). `recalcSnapshotCascade` пересчитывает снимки асинхронно, не блокируя HTTP-ответ.

**Tech Stack:** NestJS / TypeScript, Prisma `$executeRaw`, Jest integration tests (PostgreSQL, реальная БД).

---

## File Map

| Action | Path |
|--------|------|
| Modify | `apps/api/src/modules/period/period.service.ts` |
| Modify | `apps/api/src/modules/admin/admin.controller.ts` |
| Modify | `apps/api/src/modules/admin/admin.module.ts` |
| Create | `apps/api/src/modules/admin/dto/correct-fact.dto.ts` |
| Create | `docs/security/public-routes-allowlist.txt` |
| Modify | `apps/api/test/integration/invariants/adr-007-period-immutability.integration.spec.ts` |

---

## Task 1: `assertPeriodEditable` — app-level immutability

Существующий integration-тест `adr-007-period-immutability.integration.spec.ts` уже написан и ожидает исключения `/PERIOD_(NOT_OPEN|CLOSED|IMMUTABLE)/` и `/PERIOD_(NOT_OPEN|ALREADY_CLOSED)/`. Сейчас оба кейса бросают `PERIOD_WRONG_STATUS` и тест ПАДАЕТ. Задача: добавить guard и сделать тест зелёным.

**Files:**
- Modify: `apps/api/src/modules/period/period.service.ts`

- [ ] **Step 1: Запустить существующий integration-тест — убедиться в RED**

```bash
cd D:/Claude/CCIP
pnpm --filter @ccip/api exec jest --config test/integration/jest-integration.json --testPathPattern="adr-007" --no-coverage 2>&1 | tail -30
```

Ожидаемый результат: **2 FAIL** — `PERIOD_WRONG_STATUS` не совпадает с regex.

- [ ] **Step 2: Добавить `assertPeriodEditable` в `period.service.ts`**

В файл `apps/api/src/modules/period/period.service.ts` добавить приватный метод сразу после `assertGpTokenValid` (после строки 218, перед `// ─── getGpFormData`):

```typescript
  // ─── assertPeriodEditable ─────────────────────────────────────────────────────

  private assertPeriodEditable(period: { status: string }): void {
    if (period.status === 'closed' || period.status === 'force_closed') {
      throw new ForbiddenException('PERIOD_ALREADY_CLOSED');
    }
  }
```

- [ ] **Step 3: Вызвать `assertPeriodEditable` в `upsertPeriodFact`**

В методе `upsertPeriodFact` (строка ~330) — сразу после того, как `period` прочитан из БД (после `findUniqueOrThrow`), до строки `if (!SC_FACT_ALLOWED_STATUSES.includes(period.status))`:

```typescript
      const period = await tx.period.findUniqueOrThrow({
        where: { id: periodId },
        include: { object: { select: { organizationId: true } } },
      });

      this.assertPeriodEditable(period); // ADR-007: closed/force_closed → 403

      if (!SC_FACT_ALLOWED_STATUSES.includes(period.status)) {
```

- [ ] **Step 4: Вызвать `assertPeriodEditable` в `closePeriod`**

В методе `closePeriod` (строка ~416) — сразу после `findUniqueOrThrow`, до проверки `period.status !== 'verification'`:

```typescript
      const period = await tx.period.findUniqueOrThrow({
        where: { id: periodId },
        include: { object: { select: { organizationId: true } } },
      });

      this.assertPeriodEditable(period); // ADR-007: closed/force_closed → 403

      if (period.status !== 'verification') {
```

- [ ] **Step 5: Запустить тест — убедиться в GREEN**

```bash
cd D:/Claude/CCIP
pnpm --filter @ccip/api exec jest --config test/integration/jest-integration.json --testPathPattern="adr-007" --no-coverage 2>&1 | tail -20
```

Ожидаемый результат: **2 PASS**.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/period/period.service.ts
git commit -m "feat(period): assertPeriodEditable — ADR-007 app-level immutability guard"
```

---

## Task 2: `adminCorrectFact` + `recalcSnapshotCascade` в PeriodService

**Files:**
- Modify: `apps/api/src/modules/period/period.service.ts`
- Modify: `apps/api/src/modules/period/__tests__/period.service.spec.ts`

- [ ] **Step 1: Написать unit-тест для `adminCorrectFact`**

Добавить в `apps/api/src/modules/period/__tests__/period.service.spec.ts` новый describe-блок:

```typescript
describe('adminCorrectFact', () => {
  it('calls fn_admin_correct_fact with correct args and fires recalc async', async () => {
    const mockExecuteRaw = jest.fn().mockResolvedValue(undefined);
    const mockFindUnique = jest.fn().mockResolvedValue({
      periodId: 10,
      period: { objectId: 3, periodNumber: 2 },
    });

    const prismaMock = {
      periodFact: { findUniqueOrThrow: mockFindUnique },
      $executeRaw: mockExecuteRaw,
    } as unknown as PrismaService;

    // Spy on recalcSnapshotCascade — it should be fired but not awaited
    const svc = new PeriodService(prismaMock, {} as AuditLogService);
    const recalcSpy = jest
      .spyOn(svc as any, 'recalcSnapshotCascade')
      .mockResolvedValue(undefined);

    await svc.adminCorrectFact(42, 150, 140, 1, 'Ошибка ввода');

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: 42 },
      select: { periodId: true, period: { select: { objectId: true, periodNumber: true } } },
    });
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    // recalcSnapshotCascade called async — allow microtask queue to flush
    await Promise.resolve();
    expect(recalcSpy).toHaveBeenCalledWith(10, 3, 2);
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться в RED**

```bash
cd D:/Claude/CCIP
pnpm --filter @ccip/api exec jest --testPathPattern="period.service.spec" --no-coverage 2>&1 | tail -20
```

Ожидаемый результат: **FAIL** — `adminCorrectFact is not a function`.

- [ ] **Step 3: Реализовать `adminCorrectFact` в `period.service.ts`**

Добавить после `assertPeriodEditable` (или в конец класса перед закрывающей скобкой):

```typescript
  // ─── adminCorrectFact ────────────────────────────────────────────────────────

  async adminCorrectFact(
    factId: number,
    scVolume: number,
    accepted: number,
    adminId: number,
    reason: string,
  ): Promise<void> {
    const fact = await this.prisma.periodFact.findUniqueOrThrow({
      where: { id: factId },
      select: {
        periodId: true,
        period: { select: { objectId: true, periodNumber: true } },
      },
    });

    // fn_admin_correct_fact is SECURITY DEFINER — the only legal UPDATE path (ADR-007 / P-25)
    await this.prisma.$executeRaw`SELECT fn_admin_correct_fact(
      ${factId}::integer,
      ${scVolume}::numeric,
      ${accepted}::numeric,
      ${adminId}::integer,
      ${reason}::text
    )`;

    // Fire-and-forget: cascade recalc does not block HTTP response
    this.recalcSnapshotCascade(fact.periodId, fact.period.objectId, fact.period.periodNumber).catch(
      (err) => console.error('[adminCorrectFact] recalcSnapshotCascade failed', err),
    );
  }

  // ─── recalcSnapshotCascade ───────────────────────────────────────────────────

  async recalcSnapshotCascade(
    fromPeriodId: number,
    objectId: number,
    fromPeriodNumber: number,
  ): Promise<void> {
    const periods = await this.prisma.period.findMany({
      where: {
        objectId,
        periodNumber: { gte: fromPeriodNumber },
        status: { in: ['closed', 'force_closed'] },
      },
      select: { id: true },
      orderBy: { periodNumber: 'asc' },
    });

    for (const p of periods) {
      await this.prisma.$transaction(async (tx) => {
        await tx.readinessSnapshot.deleteMany({ where: { periodId: p.id } });
        // TODO M-05c: replace 0 with calcReadiness() from AnalyticsService
        await tx.readinessSnapshot.create({
          data: { periodId: p.id, objectId, objectReadinessPct: 0 },
        });
      });
    }

    await this.prisma.$executeRawUnsafe(
      'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_object_current_status',
    );
  }
```

- [ ] **Step 4: Запустить тест — убедиться в GREEN**

```bash
cd D:/Claude/CCIP
pnpm --filter @ccip/api exec jest --testPathPattern="period.service.spec" --no-coverage 2>&1 | tail -20
```

Ожидаемый результат: **PASS**.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/period/period.service.ts \
        apps/api/src/modules/period/__tests__/period.service.spec.ts
git commit -m "feat(period): adminCorrectFact + recalcSnapshotCascade (ADR-007)"
```

---

## Task 3: Admin HTTP-эндпоинт `POST /admin/correct-fact`

**Files:**
- Create: `apps/api/src/modules/admin/dto/correct-fact.dto.ts`
- Modify: `apps/api/src/modules/admin/admin.controller.ts`
- Modify: `apps/api/src/modules/admin/admin.module.ts`

- [ ] **Step 1: Создать DTO**

Создать файл `apps/api/src/modules/admin/dto/correct-fact.dto.ts`:

```typescript
import { IsInt, IsNumber, IsString, MaxLength, Min } from 'class-validator';

export class CorrectFactDto {
  @IsInt()
  factId!: number;

  @IsNumber()
  @Min(0)
  scVolume!: number;

  @IsNumber()
  @Min(0)
  accepted!: number;

  @IsString()
  @MaxLength(500)
  reason!: string;
}
```

- [ ] **Step 2: Подключить PeriodModule в AdminModule**

Заменить `apps/api/src/modules/admin/admin.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuthModule } from '../../common/guards/auth.module';
import { PeriodModule } from '../period/period.module';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';

@Module({
  imports: [PrismaModule, AuthModule, PeriodModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
```

- [ ] **Step 3: Добавить эндпоинт в AdminController**

Заменить `apps/api/src/modules/admin/admin.controller.ts`:

```typescript
import { Controller, Post, Body, Request, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/guards/roles.decorator';
import { AdminService } from './admin.service';
import { PeriodService } from '../period/period.service';
import { CorrectFactDto } from './dto/correct-fact.dto';

interface AuthRequest {
  user: { id: string; email: string; role: string; organizationId: string };
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly periodService: PeriodService,
  ) {}

  @Post('refresh-dashboard')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  refreshDashboard() {
    return this.adminService.refreshDashboard();
  }

  @Post('correct-fact')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async correctFact(@Body() dto: CorrectFactDto, @Request() req: AuthRequest) {
    await this.periodService.adminCorrectFact(
      dto.factId,
      dto.scVolume,
      dto.accepted,
      parseInt(req.user.id, 10),
      dto.reason,
    );
  }
}
```

- [ ] **Step 4: TypeScript compile check**

```bash
cd D:/Claude/CCIP
pnpm --filter @ccip/api exec tsc --noEmit 2>&1 | head -30
```

Ожидаемый результат: **0 ошибок**.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin/dto/correct-fact.dto.ts \
        apps/api/src/modules/admin/admin.controller.ts \
        apps/api/src/modules/admin/admin.module.ts
git commit -m "feat(admin): POST /admin/correct-fact endpoint (ADR-007)"
```

---

## Task 4: `docs/security/public-routes-allowlist.txt`

ADR-009 требует: каждое `@Public()` должно быть внесено в этот файл; CI проверяет diff.

**Files:**
- Create: `docs/security/public-routes-allowlist.txt`

- [ ] **Step 1: Создать allowlist**

Создать файл `docs/security/public-routes-allowlist.txt`:

```
# Public routes — exempt from JwtAuthGuard (ADR-009)
# RULE: every @Public() usage in any controller MUST have an entry here.
# CI checks: if @Public() is added without updating this file → build fails (grep diff).
#
# Format: METHOD /path  (path params as :param)
# Separate section for GP-token routes (secured via GpTokenGuard, not @Public but exempt from JWT).

## @Public() decorated endpoints
POST /auth/login
POST /auth/refresh

## GP-token secured endpoints (GpTokenGuard replaces JwtAuthGuard)
GET  /periods/gp/:token
POST /periods/gp/submit/:token
```

- [ ] **Step 2: Проверить что все текущие @Public() покрыты**

```bash
grep -rn "@Public()" apps/api/src --include="*.ts"
```

Ожидаемый вывод — только `auth.controller.ts` (login, refresh). Если появятся другие — дописать в allowlist.

- [ ] **Step 3: Commit**

```bash
git add docs/security/public-routes-allowlist.txt
git commit -m "docs(security): public-routes-allowlist — ADR-009 compliance artifact"
```

---

## Task 5: DB-level REVOKE integration test (граница M-10 / M-11)

Проверяет, что REVOKE UPDATE/DELETE из migration 0001 реально действует: Prisma-клиент (роль `ccip_app`) не может напрямую UPDATE `period_facts`.

**Files:**
- Modify: `apps/api/test/integration/invariants/adr-007-period-immutability.integration.spec.ts`

- [ ] **Step 1: Добавить import Prisma в тест**

В начало файла добавить:

```typescript
import { Prisma } from '@ccip/database';
```

- [ ] **Step 2: Добавить тест DB REVOKE**

В существующий `describe` блок добавить третий тест:

```typescript
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
        discrepancyStatus: 'confirmed',
      },
    });

    // Direct UPDATE must be rejected by PostgreSQL (error 42501 permission denied)
    await expect(
      prisma.$executeRaw`UPDATE period_facts SET sc_volume = 200 WHERE id = ${fact.id}`
    ).rejects.toMatchObject({
      message: expect.stringMatching(/permission denied/i),
    });
  });
```

- [ ] **Step 3: Запустить все три теста ADR-007**

```bash
cd D:/Claude/CCIP
pnpm --filter @ccip/api exec jest --config test/integration/jest-integration.json --testPathPattern="adr-007" --no-coverage 2>&1 | tail -30
```

Ожидаемый результат: **3 PASS**.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/integration/invariants/adr-007-period-immutability.integration.spec.ts
git commit -m "test(adr-007): DB-level REVOKE UPDATE verification — M-10/M-11 boundary"
```

---

## Итог M-10

После выполнения всех задач:

| Компонент | Статус |
|-----------|--------|
| `assertPeriodEditable` в `upsertPeriodFact` / `closePeriod` | ✅ |
| `adminCorrectFact` → `fn_admin_correct_fact` SECURITY DEFINER | ✅ |
| `recalcSnapshotCascade` (async каскад снимков) | ✅ |
| `POST /admin/correct-fact` `@Roles('admin')` | ✅ |
| `docs/security/public-routes-allowlist.txt` | ✅ |
| Integration-тест REVOKE UPDATE на period_facts | ✅ |

Разблокирует: **M-11 W2** (D/E блоки тестов).
