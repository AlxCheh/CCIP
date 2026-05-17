---
adr: ADR-015
status: Принято
impl_anchors:
  - apps/api/src/modules/dispute-sla/
  - docs/delivery_plan_v1_0.md
  - docs/delivery/phase-4-7-backend-modules.md
related:
  - ADR-005
  - ADR-007
---

# ADR-015 — SLA Worker Canonical Path

**Статус:** Принято
**Закрывает:** Red Team C-004, multi-agent-ecosystem F-015 / F-017

## Решение
SLA worker (M-05b) реализуется в `apps/api/src/modules/dispute-sla/`. Это canonical path, замещающий phantom `apps/api/src/sla-scheduler/` (top-level), который упоминался в delivery docs до коммита `859484a` (2026-05-17).

## Контекст
До 2026-05-17 `docs/delivery_plan_v1_0.md` и `docs/delivery/phase-4-7-backend-modules.md` ссылались на несуществующий `apps/api/src/sla-scheduler/sla-scheduler.module.ts`. Реальная конвенция проекта — `apps/api/src/modules/<name>/`. Сам модуль не был создан — phantom path (Red Team §6 C-004, multi-agent-ecosystem F-017).

Решение о canonical path фиксировалось в memory M-05b и `.keep` файле, но не в `docs/decisions/`. Этот ADR делает решение явным SoT.

## Контракт
- Модуль `apps/api/src/modules/dispute-sla/` — единственный canonical SLA worker location.
- Существующий `apps/api/src/modules/dispute/` — DisputesModule (HTTP handler, классификация Type 1/2, DisputeFlagService Type 3), **не** SLA worker.
- ADR-005 invariants (`replicas: 1`, `strategy: Recreate`, recovery scan, P-24 DELETE guard, BullMQ jobId deduplication) применяются к deployment модуля `dispute-sla/`.
- ADR-007 invariants (period immutability) — SLA worker не модифицирует `period_work_items` напрямую; только пишет в `audit_log` и обновляет `discrepancies` / `sla_events`.

## Отклонённые альтернативы
| Альтернатива | Причина |
|---|---|
| `apps/api/src/sla-scheduler/` (top-level) | Нарушает конвенцию `apps/api/src/modules/<name>/` всего проекта |
| Слияние с `apps/api/src/modules/dispute/` | Разные runtime concerns: HTTP handler vs BullMQ worker. ADR-005 reliability требования (replicas:1, Recreate strategy, ROLE=worker env) применимы только к worker процессу |
| Только расширение ADR-005 без нового ADR | ADR-005 описывает invariants worker'а; canonical path — отдельное cross-cutting decision, закрывающее аудитное finding (F-015/F-017) и явно фиксирующее замену phantom `sla-scheduler/` |
