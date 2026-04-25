# ADR-012 — Multi-tenancy: organization_id в WHERE + per-org system_config

**Статус:** Принято  
**Дата:** 2026-04-25  
**Закрытые пробелы §10.4:** Multi-tenancy · system_config per-object overrides

---

## Решение (одна строка)

Multi-tenancy реализуется через явный `organization_id` в `users`, `objects`, `system_config` с Prisma middleware на уровне приложения; `system_config` становится per-organization; per-object overrides конфигурации отложены до post-MVP.

---

## Контекст

CCIP — SaaS-платформа. На одной инстанции работает несколько тенантов — организаций строительного контроля. Каждый тенант — юрлицо, управляющее своими объектами ОКС, имеющее своих пользователей (admin, director, SC) и свою конфигурацию L0.

Исходная архитектура фильтрует данные по `objectId` на уровне сервисного слоя, но не имеет явной tenant-изоляции: любой запрос, не проходящий через `objectId`, потенциально видит данные чужого тенанта.

Выбор pooler-режима `session` для PgBouncer (ADR-001) совместим с обоими вариантами изоляции.

---

## Практический кейс

**Тенант A:** ООО «СтройКонтроль-Сибирь», Новосибирск, 5 объектов, 12 пользователей.  
**Тенант B:** ООО «ИнтерКонтроль», Москва, 3 объекта, 7 пользователей.  
Объекты тенантов имеют пересекающиеся имена («Складской комплекс, этап 1»).

Без изоляции: `GET /objects` от admin тенанта A может вернуть объекты тенанта B, если `organizationId` не инжектирован в WHERE. При application-level фильтре пропущенная фильтрация — видимая ошибка компилятора (TypeScript) или Prisma validation. При RLS пропущенный `SET LOCAL ccip.current_org = ?` — **молчаливая утечка данных**.

---

## Решение: application-level `organization_id` в WHERE

### Почему не Row-Level Security (RLS)

RLS требует `SET LOCAL ccip.current_org = :tenantId` в начале каждой транзакции через `prisma.$queryRaw`. Если эта строка не выполнилась (ошибка в middleware, тест без SET LOCAL, прямой Prisma-запрос в migration), PostgreSQL применяет политику по умолчанию — **запрос выполняется без фильтра**. Для системы с историей актов и объёмами работ это silent data leak.

Explicit `WHERE organization_id = ?`: пропуск фильтра — ошибка TypeScript или runtime validation, не тихая утечка.

### Архитектура изоляции

```
HTTP Request
     │
     ▼
TenantMiddleware  (читает organizationId из JWT claims)
     │             сохраняет в AsyncLocalStorage
     ▼
Prisma TenantExtension  (beforeQuery hook)
     │  — models: Object, User, SystemConfig
     │  — findMany/findFirst:  args.where.organizationId = tenantId
     │  — create:              args.data.organizationId  = tenantId
     │  — update/delete:       args.where.organizationId = tenantId
     ▼
Defense-in-depth в сервисах:
     — PeriodService.openPeriod(): assert object.organizationId === tenantId
     — BoQService.*():             assert object.organizationId === tenantId
     — (все сервисы верхнего уровня проверяют ownership)
```

Вложенные ресурсы (`periods`, `period_facts`, `discrepancies`, `sla_events`, `readiness_snapshots` и т.д.) достижимы **только через объект** — transitively scoped. Прямого доступа к `period_facts` по id без context объекта нет.

### system_config: per-organization, без per-object overrides

Текущая `system_config` — глобальная таблица `(key, value_type, value_numeric, value_text)`. После патча: каждый тенант получает собственный набор из 11 параметров L0.

Per-object overrides (`object_config`) явно отложены: для пилота с 1–3 объектами на тенанта единая org-конфигурация достаточна. При необходимости per-object overrides — отдельный ADR с таблицей `object_config (object_id, key, value_numeric, value_text)` и семантикой `object_config.value ?? system_config.value`.

### Super-admin маршруты

Внутренние маршруты (`/internal/admin`) обходят TenantExtension через `@BypassTenant()` декоратор, доступны только роли `super_admin` (новая системная роль, не в основной RBAC-матрице).

---

## Контракт реализации

### Новая сущность: Organization

```typescript
// organizations: главная anchor-таблица тенанта
{
  id:         UUID PK
  name:       TEXT NOT NULL
  slug:       TEXT UNIQUE  -- для поддомена / URL
  plan:       TEXT DEFAULT 'starter'
  is_active:  BOOLEAN DEFAULT TRUE
  created_at: TIMESTAMPTZ DEFAULT NOW()
}
```

### Изменения существующих таблиц

| Таблица | Добавляемое поле | Индекс |
|---------|-----------------|--------|
| `users` | `organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT` | `idx_users_org` |
| `objects` | `organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT` | `idx_objects_org` |
| `system_config` | `organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT` | composite UNIQUE `(organization_id, key)` |
| `audit_log` | `organization_id UUID NOT NULL` | `idx_audit_log_org` — для per-tenant audit queries |

`audit_log.organization_id` денормализовано для эффективных запросов истории тенанта без JOIN через users/objects.

### Prisma TenantExtension (псевдокод)

```typescript
export const tenantExtension = Prisma.defineExtension((client) =>
  client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const tenantId = tenantStorage.getStore()?.organizationId;
          if (!tenantId) return query(args); // super-admin или internal

          const TENANT_MODELS = ['Object', 'User', 'SystemConfig', 'AuditLog'];
          if (!TENANT_MODELS.includes(model)) return query(args);

          if (['findMany', 'findFirst', 'findUnique'].includes(operation)) {
            args.where = { ...args.where, organizationId: tenantId };
          }
          if (operation === 'create') {
            args.data = { ...args.data, organizationId: tenantId };
          }
          if (['update', 'updateMany', 'delete', 'deleteMany'].includes(operation)) {
            args.where = { ...args.where, organizationId: tenantId };
          }
          return query(args);
        },
      },
    },
  })
);
```

### TenantMiddleware (NestJS)

```typescript
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const payload = req.jwtPayload; // выставляется JwtAuthGuard
    if (payload?.organizationId) {
      tenantStorage.run({ organizationId: payload.organizationId }, next);
    } else {
      next();
    }
  }
}
// Регистрируется глобально в AppModule.configure()
```

### Совместимость с advisory lock (ADR-002)

`pg_advisory_xact_lock(md5-hash of object_id)` не затрагивается: `object.id` — UUID уникален глобально, коллизий между тенантами нет.

### Совместимость с SLA Scheduler (ADR-005)

BullMQ Worker не работает с HTTP-контекстом и не имеет tenantId в AsyncLocalStorage. Worker читает `sla_events` по `event.id` (PK) и далее по `period_id → object_id → organization_id` из БД — прямой запрос без tenant middleware. Это допустимо: worker не является точкой входа пользователя.

---

## Патчи схемы БД

| Патч | Содержание |
|------|-----------|
| **P-26** | Таблица `organizations(id, name, slug, plan, is_active, created_at)` |
| **P-27** | `ALTER TABLE users ADD organization_id`; `ALTER TABLE objects ADD organization_id`; индексы |
| **P-28** | `system_config`: добавить `organization_id`; старый PK `key` → новый UNIQUE `(organization_id, key)`; migration seed данных на дефолтную organization |
| **P-29** | `audit_log.organization_id NOT NULL`; индекс `idx_audit_log_org` |

---

## Отклонённые альтернативы

| Альтернатива | Причина отклонения |
|-------------|-------------------|
| PostgreSQL Row-Level Security | SET LOCAL пропущен = silent data leak; Prisma $extends менее зрелый; сложнее тестировать изолированно |
| Отдельная схема PostgreSQL per-tenant | Избыточно для монолита; несовместимо с Prisma single-schema migrations; сложный pg_partman per-schema |
| Отдельная БД per-tenant | Операционная сложность × N; невозможен cross-tenant super-admin; дорого при малом числе тенантов |
| Per-object config overrides (сейчас) | Не нужно для MVP/pilot с 1–3 объектами; отложено |
