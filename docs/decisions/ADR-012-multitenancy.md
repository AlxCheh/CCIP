# ADR-012 — Multi-tenancy: organization_id в WHERE

**Статус:** Принято
**Закрытый риск/пробел:** §10.4

## Решение
Multi-tenancy через явный `organization_id` в `WHERE` с Prisma TenantExtension + `TenantMiddleware` (AsyncLocalStorage). Per-object config overrides отложены до post-MVP.

## Контекст
CCIP — SaaS. На одной инстанции несколько тенантов. Исходная архитектура фильтрует по `objectId`, но не имеет явной tenant-изоляции. RLS при пропущенном `SET LOCAL` даёт silent data leak; explicit WHERE — ошибка TypeScript или runtime validation.

## Практический кейс
Admin тенанта А запрашивает `GET /objects`. `TenantMiddleware` читает `organizationId` из JWT, сохраняет в `AsyncLocalStorage`. `PrismaTenantExtension` beforeQuery перехватывает `findMany({model:'Object'})` → добавляет `WHERE organization_id=tenantA`. Объекты тенанта B невидимы. BullMQ Worker (без HTTP-контекста) читает `sla_events` по PK → по цепочке `period_id → object_id → organization_id` напрямую из БД.

## Контракт реализации

**P-26:** `organizations(id UUID PK, name TEXT, slug TEXT UNIQUE, plan TEXT DEFAULT 'starter', is_active BOOLEAN, created_at TIMESTAMPTZ)`

**P-27:** `ALTER TABLE users ADD organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT`; `ALTER TABLE objects ADD organization_id ...`. Индексы `idx_users_org`, `idx_objects_org`.

**P-28:** `system_config` — добавить `organization_id`; `PK key` → `UNIQUE(organization_id, key)`. Migration seed на дефолтную organization.

**P-29:** `audit_log.organization_id NOT NULL` (денормализовано для per-tenant запросов без JOIN); индекс `idx_audit_log_org`.

**`PrismaTenantExtension`:** перехватывает `findMany/findFirst/findUnique` → `args.where.organizationId=tenantId`; `create` → `args.data.organizationId=tenantId`; `update/delete` → `args.where.organizationId=tenantId`. Модели: `Object`, `User`, `SystemConfig`, `AuditLog`. Если `tenantId` пуст — запрос без модификации (super_admin / internal).

**`TenantMiddleware`:** читает `req.jwtPayload.organizationId` → `tenantStorage.run({organizationId}, next)`. Регистрируется глобально в `AppModule.configure()`.

**Defense-in-depth:** сервисы верхнего уровня (`PeriodService`, `BoQService`) явно проверяют `object.organizationId === tenantId`.

**Вложенные ресурсы** (`periods`, `period_facts`, `discrepancies`, `sla_events`, `readiness_snapshots`) достижимы только через объект — transitively scoped.

**Super-admin:** роль `super_admin`, маршруты `/internal/admin`, декоратор `@BypassTenant()` обходит TenantExtension.

**Advisory lock (ADR-002):** совместим — `object.id` UUID глобально уникален между тенантами.

## Отклонённые альтернативы
| Альтернатива | Причина |
|---|---|
| PostgreSQL RLS | SET LOCAL пропущен = silent data leak; сложнее тестировать изолированно |
| Отдельная схема per-tenant | Несовместимо с Prisma single-schema migrations; сложный pg_partman |
| Отдельная БД per-tenant | Операционная сложность ×N; невозможен cross-tenant super-admin |
