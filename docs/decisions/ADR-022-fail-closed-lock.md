---
adr: ADR-022
status: Принято
impl_anchors:
  - .claude/runtime/state-lock.js
related:
  - ADR-019
  - ADR-021
---

# ADR-022 — Fail-Closed Flag for State Lock (high-assurance opt-in)

**Статус:** Принято 2026-06-14
**Reviewer:** live-сессия sign-off (human-in-the-loop), ветка `feat/fail-closed-lock`
**Связано:** ADR-019 (cross-process state lock + наблюдаемый fail-open by design), CLAUDE.md §18 (fail-open-остаток = advisory конвенция), roadmap §XII.4.

## Контекст

ADR-019 зафиксировал **наблюдаемый fail-open** при таймауте acquire: fn выполняется БЕЗ лока, факт репортится через `state_lock_failed_open` alert. Это был осознанный выбор: дедлок хуков хуже, чем иногда-безлоковая запись. §XII.4 рекомендует fail-closed под флагом для high-assurance окружений, где важнее пропустить запись, чем записать без гарантии атомарности.

## Решение

1. **Глобальный флаг:** `CCIP_STATE_LOCK_FAILCLOSED=1` (env) — fail-closed для всех вызовов `withStateLock`.
2. **Per-call override:** `opts.failClosed = true/false` — переопределяет env для конкретного вызова.
3. **Семантика fail-closed:** при таймауте acquire fn НЕ вызывается → возвращается `null`. Governance не ломает сессию (нет throw). Событие репортится в stderr (`[state-lock] fail-closed: ...`) + `opts.onFailClosed(reason)` (параллельно `opts.onFailOpen` из ADR-019).
4. **Дефолт неизменён:** без флага — прежнее fail-open поведение ADR-019 (нет регрессии).

## Семантическое обоснование «пропуск записи, не throw»

throw → роняет hook → fail-open на уровне хука (exit неноль ≠ сессия падает, но hook-mutator не завершился). Пропуск записи + durable stderr-сигнал — более предсказуем: caller получает `null`, знает что обновление пропущено, и может среагировать через `opts.onFailClosed`. Инвариант «governance не ломает сессию» сохраняется.

## Последствия

- `withStateLock` возвращает `null` при fail-closed таймауте (вместо результата fn). Callers должны обрабатывать `null` как «обновление пропущено» — `updateStateLocked` уже возвращает `null` на ENOENT/parse-fail, так что API-контракт согласован.
- ADR-019 не редактируется (immutability). ADR-022 дополняет: флаг-opt-in, дефолт прежний.
- Применимость: high-assurance CI, автономные прогоны DAG, где потеря мутации предпочтительнее неатомарной записи. Для обычных hook-сессий флаг не рекомендуется (предпочтителен наблюдаемый fail-open).
