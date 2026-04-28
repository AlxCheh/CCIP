# CCIP — Delivery: Phases 1–3 — Foundation & Backend Core

**Требует:** ADR-012 принят → [phase-0-architecture-gaps.md](phase-0-architecture-gaps.md)  
**Следующий файл:** [phase-4-7-backend-modules.md](phase-4-7-backend-modules.md)  
**Critical path:** [critical-path.md](critical-path.md)

---

## Этап 1 — Подготовка репозиториев и окружений

> **Цель:** у каждого разработчика работает `docker compose up` за < 5 минут.  
> **Критерий перехода:** все сервисы отвечают на health-check, CI прогоняет пустые тесты.

### 1.1 Репозитории и монорепо

- `[H]` 🔴 CRITICAL PATH — Инициализировать монорепо структуру
  ```
  ccip/
    apps/
      api/           # NestJS backend
      web/           # React frontend
    packages/
      database/      # Prisma schema + migrations
      shared/        # Общие типы TS (DTOs, enums)
    infra/
      docker/        # docker-compose.yml, Dockerfiles
      k8s/           # Kubernetes manifests
    docs/            # architecture, ADR, delivery plan
  ```
  - Артефакт: репозиторий с `.gitignore`, `turbo.json`, `pnpm-workspace.yaml`
  - **Monorepo-инструмент: Turborepo** (подтверждено 2026-04-26; NX отклонён — избыточная конфигурация)

- `[H]` Создать `packages/database` — Prisma schema из `schema.sql`
  - Перевести все P-01..P-32 в `schema.prisma`
  - Создать начальную миграцию `0001_initial`
  - ⚠️ ADR-001: `pool_mode=session` — настроить в `DATABASE_URL` с `pgbouncer=true` если PgBouncer
  - Артефакт: `packages/database/schema.prisma` + `migrations/0001_initial.sql`
  - Критерий: `prisma migrate deploy` на чистой БД проходит без ошибок

- `[H]` Создать `packages/shared` — типы и enums
  - `UserRole`, `PeriodStatus`, `DiscrepancyType`, `SyncStatus`, `SlaScenario`
  - Артефакт: `packages/shared/src/types.ts` с полным набором enum-ов

### 1.2 Docker Compose (dev окружение)

- `[H]` 🔴 CRITICAL PATH — `docker-compose.yml` с полным стеком
  ```yaml
  services:
    postgres:    # PostgreSQL 16, порт 5432, init-script из schema.sql
    redis:       # Redis 7, AOF persistence обязательна (⚠️ ADR-005)
    minio:       # MinIO для S3-совместимого хранилища
    pgbouncer:   # PgBouncer pool_mode=session (⚠️ ADR-001, ADR-002)
    mailhog:     # Перехват SMTP в dev
  ```
  - Артефакт: `infra/docker/docker-compose.yml`
  - Критерий: `docker compose up -d` + `prisma migrate deploy` + `prisma db seed` выполняются без ошибок

- `[H]` Seed-скрипт для dev-данных
  - 1 организация, 3 пользователя (admin, director, stroycontrol), 1 объект, 1 BoQ v1.0 с 5 позициями
  - `SUM(weight_coef) == 1.0` обязательно
  - Артефакт: `packages/database/seed.ts`

### 1.3 CI/CD базовая конфигурация

- `[H]` CI pipeline (GitHub Actions / GitLab CI)
  - Шаги: `pnpm install` → `tsc --noEmit` (typecheck) → `prisma validate` → `jest --ci`
  - Артефакт: `.github/workflows/ci.yml`
  - Критерий: pipeline проходит на пустых тестах

- `[M]` Pre-commit hooks
  - ESLint + Prettier + `prisma format`
  - Артефакт: `.husky/` конфигурация

### 1.4 Переменные окружения

- `[H]` Файлы `.env.example` для каждого приложения
  ```
  DATABASE_URL=         # с pgbouncer=true параметром
  REDIS_URL=
  JWT_ACCESS_SECRET=
  JWT_REFRESH_SECRET=
  S3_ENDPOINT=
  S3_BUCKET=
  SMTP_HOST=
  WORKER_ROLE=          # 'api' | 'worker' — для BullMQ ROLE separation (⚠️ ADR-005)
  ```
  - Критерий: нет хардкода секретов в коде; все настраивается через env

---

## Этап 2 — Backend: Auth и фундамент

> **Цель:** работающий JWT/RBAC слой, без которого нельзя защитить ни один endpoint.  
> **Критерий перехода:** Postman/curl возвращает 401 на все защищённые маршруты; роли корректно разграничены.

### 2.1 NestJS Bootstrap

- `[H]` 🔴 CRITICAL PATH — Инициализировать `apps/api` (NestJS)
  - Global pipes: `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`
  - Global filters: `HttpExceptionFilter`
  - Global interceptors: `TransformInterceptor` (обёртка ответа)
  - Helmet, CORS настройка
  - Артефакт: `apps/api/src/main.ts` + `AppModule`

- `[H]` PrismaModule — глобальный, инжектируется во все сервисы
  - `onModuleInit()`: `$connect()`; `onModuleDestroy()`: `$disconnect()`
  - Артефакт: `apps/api/src/prisma/prisma.module.ts`

- `[H]` AuditLogService — реализовать **первым** среди сервисов
  - Метод: `record({ tableName, recordId, action, oldData, newData, reason, performedBy })`
  - **Только INSERT** — нет методов update/delete (⚠️ ADR-007, ADR-010)
  - Артефакт: `apps/api/src/audit-log/audit-log.service.ts`
  - Критерий: `REVOKE UPDATE,DELETE` для `ccip_app` проверен интеграционным тестом

### 2.2 Аутентификация (⚠️ ADR-009)

- `[H]` 🔴 CRITICAL PATH — AuthModule: регистрация, login, refresh, logout
  - `POST /auth/login` → Access Token (15 min, Bearer) + Refresh Token (30d, HTTP-only cookie)
  - `POST /auth/refresh` → ротация Refresh Token; хэш SHA-256 в `refresh_tokens`
  - `POST /auth/logout` → `revoked_at = NOW()`
  - Артефакт: `apps/api/src/auth/auth.module.ts` + `JwtStrategy` + `RefreshStrategy`
  - Критерий: refresh token ротируется; повторное использование старого возвращает 401

- `[H]` 🔴 CRITICAL PATH — `JwtAuthGuard` + `RolesGuard` — глобальная регистрация
  - Декоратор `@Roles('admin', 'director', 'stroycontrol')`
  - Декоратор `@Public()` для открытых endpoints
  - Артефакт: guards зарегистрированы глобально в `AppModule`

- `[H]` 🔴 CRITICAL PATH — `GpTokenGuard` — stateless токен ГП (⚠️ ADR-009)
  - Валидация `gp_submission_token` из `periods`
  - Блокировка после `gp_submitted_at IS NOT NULL`
  - Блокировка после `gp_token_expires_at < NOW()`
  - Rate limiting: `@Throttle(10, 60)` (активен с первого деплоя)
  - Артефакт: `apps/api/src/auth/gp-token.guard.ts`

- `[M]` UsersModule — CRUD пользователей (только Admin)
  - `GET /users`, `POST /users`, `PATCH /users/:id`, `DELETE /users/:id` (soft delete `is_active=false`)

### 2.3 Multi-tenancy middleware (⚠️ ADR-012)

- `[H]` 🔴 CRITICAL PATH — Реализовать стратегию из ADR-012
  - Если RLS: Prisma `$extends` + SET LOCAL при каждой транзакции
  - Если `organization_id`: Prisma middleware добавляет фильтр ко всем queries
  - **Все последующие сервисы зависят от этого слоя**
  - Артефакт: `apps/api/src/prisma/tenant.middleware.ts`
  - Критерий: пользователь tenant A не видит данных tenant B — проверено тестом

---

## Этап 3 — Backend: Инициализация объекта (Блок A)

> **Цель:** Admin может создать объект, загрузить BoQ с весами — и система проверяет инварианты.  
> **Критерий перехода:** `SUM(weight_coef) == 1.0` гарантируется; объект переходит в статус `initialized`.

- `[H]` 🔴 CRITICAL PATH — `ObjectsModule`
  - `POST /objects` — создание паспорта (L1): name, class, permit_number, connection_date
  - `GET /objects`, `GET /objects/:id`
  - `POST /objects/:id/participants` — SCD Type 2: сохранить `valid_from/valid_to/is_current`
  - Артефакт: `apps/api/src/objects/objects.module.ts`

- `[H]` 🔴 CRITICAL PATH — `SystemConfigModule`
  - `GET /config` — все 11 параметров L0
  - `PATCH /config` — только `@Roles('admin')`
  - Артефакт: `apps/api/src/system-config/system-config.module.ts`

- `[H]` 🔴 CRITICAL PATH — `BoQModule` — версионирование BoQ (Блок G, ⚠️ ADR-006)
  - `POST /objects/:id/boq` — создать BoQ v1.0 с позициями
  - Каждый `boq_item` получает `work_lineage_id = randomUUID()` (новая позиция)
  - `GET /objects/:id/boq/active` — текущая активная версия
  - `GET /objects/:id/boq-versions` — журнал версий
  - Триггер `trg_boq_items_weight_coef` проверяется на уровне DB; сервис читает ошибку и пробрасывает 422
  - Артефакт: `apps/api/src/boq/boq.module.ts`
  - Критерий: POST с `SUM(weight_coef) != 1.0` возвращает 422 с понятным сообщением

- `[M]` L2-документы: `POST /objects/:id/documents` — загрузка ССР/РДЦ/калплана в S3
  - Артефакт: `apps/api/src/documents/documents.module.ts`
