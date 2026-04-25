# CCIP — Delivery: Phase 0 — Architecture Gaps

**Цель:** закрыть открытые архитектурные пробелы до первой строки кода.  
**Критерий перехода:** ADR-012 принят и зафиксирован.  
**Следующий файл:** [phase-1-3-foundation-backend.md](phase-1-3-foundation-backend.md)  
**Critical path:** [critical-path.md](critical-path.md)

---

## Этап 0 — Архитектурное завершение

### 0.1 Multi-tenancy решение

- `[H]` 🔴 CRITICAL PATH — Принять ADR-012: RLS vs `organization_id` в WHERE
  - Опция A: Row-Level Security (Prisma `$extends` + `SET LOCAL ccip.current_org`)
  - Опция B: `organization_id` в каждой таблице + Prisma middleware фильтр
  - **Решение необходимо до** создания Prisma-схемы и любого сервиса
  - Артефакт: `docs/decisions/ADR-012-multitenancy.md`
  - Критерий приёмки: ADR подписан, Prisma-middleware или RLS-политики описаны на псевдокоде

- `[M]` Определить стратегию `system_config` per-object overrides
  - §10.4 arch: нужен `object_config` при >1 ОКС на аккаунте
  - Артефакт: примечание в ADR-012 или отдельный ADR-013
  - Если откладывается — явно записать как технический долг

### 0.2 Открытые пробелы, не блокирующие MVP

- `[M]` PDF-генерация: выбрать движок (Puppeteer vs WeasyPrint) и определить шаблоны
  - Артефакт: `docs/decisions/ADR-013-pdf-reports.md` (может быть принят позже)
- `[M]` Push-уведомления mobile: выбрать провайдер (FCM/APNs)
  - `notifications` таблица есть; нужен только интеграционный слой
- `[L]` ML-pipeline: зарезервировано в схеме (`ml_features`, `forecast_scenarios`), не в MVP
