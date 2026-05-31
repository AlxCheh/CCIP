# Task: тройной drift словаря статусов периода

**ID:** TASK-2026-05-31-period-status-vocab-drift
**Task Type:** Refactoring (консистентность словаря между БД, shared-enum, frontend)
**Routing:** `ccip-architect` (lead — зафиксировать канон) → co: `ccip-dba` (migration-файл ↔ DB CHECK), `ccip-frontend` (лейблы + shared-enum)
**Status:** open
**Raised:** 2026-05-31 (brainstorming Period Cycle, spec `docs/plans/2026-05-31-period-cycle-design.md`)

---

## Проблема

Статус периода (`periods.status`) описан **тремя несовместимыми словарями** в разных источниках.
Одно и то же состояние «верификация» пишется как `verification` / `verifying` / `verified`.

## Доказательство (точные источники)

| Источник | Словарь статусов | Файл |
|---|---|---|
| **Backend service (ground truth)** | `open`, `gp_submitted`, `verification`, `closed` | `apps/api/src/modules/period/period.service.ts` (create `open`; submitGp→`gp_submitted`; upsertPeriodFact→`verification`; closePeriod→`closed`); `SC_FACT_ALLOWED_STATUSES = ['gp_submitted','verification']` |
| **shared enum `PeriodStatus`** | `open`, `verifying`, `closed`, `force_closed` (нет `gp_submitted`/`verification`) | `packages/shared/src/types.ts:60-65` |
| **frontend лейблы** | `open`, `gp_submitted`, `verified`, `closed`, `forced_sc_figure` | `apps/web/src/pages/ObjectDetailPage.tsx:8-14` |
| **migration `0001_initial` CHECK** | `open`, `waiting_gp`, `verifying`, `closed`, `force_closed` | `packages/database/prisma/migrations/0001_initial/migration.sql:279-286` |

Дополнительно: `forced_sc_figure` в лейблах фронта — это на самом деле значение
`DiscrepancyStatus` (`packages/shared/src/types.ts:88`), ошибочно занесённое в период-статусы.

## Корень

Интеграционные тесты периода (`period.service.spec.ts`) **проходят** против реальной БД,
записывая `gp_submitted`/`verification` — значит фактический DB CHECK был выровнен под
service-канон при **B-01** (`fix(db): align periods_status_check ...`, коммит `c8e8292`),
но **файл `0001_initial` остался со старым словарём** (это часть migration-file↔DB drift,
закрытого как B-02 на уровне истории, но текст constraint в файле не обновлён).
shared-enum и лейблы фронта при этом никто не синхронизировал.

## Предлагаемое направление (требует решения архитектора)

Канон = **service-истина**: `open → gp_submitted → verification → closed` (+ force-close путь SLA).
Затем:
1. `packages/shared/src/types.ts` `PeriodStatus` → привести к канону (`gp_submitted`, `verification`; решить судьбу `verifying`/`force_closed`/`waiting_gp`).
2. `ObjectDetailPage` лейблы → канон; убрать ошибочный `forced_sc_figure` из период-статусов.
3. Зафиксировать актуальный DB CHECK (выяснить точные допустимые значения в применённой БД) и **синхронизировать текст `0001_initial`** (или добавить корректирующую миграцию), чтобы файл совпадал с БД.
4. Решить: использовать ли shared-enum как единый источник во всём коде (сейчас service пишет строковые литералы, enum игнорируется).

## Развилки для архитектора

- Включать ли `force_closed`/force-close в канон сейчас (SLA Scenario A) или отдельно.
- `waiting_gp` (есть в `0001`, нет в сервисе) — реальное состояние или мёртвое?
- Корректирующая миграция vs правка текста `0001_initial` (с учётом уже зафиксированного B-02 baseline).

## Вне scope

- Логика самой state machine (работает; меняем только словарь/консистентность).
- Period Cycle UI — строится на service-истине независимо (см. spec); реконсиляция не блокирует его.

## Ссылки

- Spec, где обнаружено — `docs/plans/2026-05-31-period-cycle-design.md` (§Канонические статусы)
- B-01/B-02 — `docs/project-state.md` (сноска ¹), коммит `c8e8292`
