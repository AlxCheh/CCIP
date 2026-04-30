# Execution Workflow

Lifecycle contract — применяется к каждой задаче независимо от task_type и module.

---

## Phase File Reading

| Условие | Действие |
|---------|----------|
| Стандартное чтение | `offset:<N> limit:60` |
| Задача не закрылась через 60 строк | `offset:<N+60> limit:40` |

> `delivery_plan_v1_0.md` читать запрещено — заменён phase files.

---

## Pre-execution

| Момент | Действие | Источник |
|--------|----------|----------|
| Начало любой задачи | `project-state.md` (limit:25) — фаза, блокеры | project-state.md |
| До выполнения | DoR checks по Priority tier | definition-of-ready.md + priority-policy.md |
| `change_impact = HIGH/CRITICAL` | Проверить `bounded-context-deps.md §2` | bounded-context-deps.md |

---

## Post-execution

| Момент | Действие | Источник |
|--------|----------|----------|
| Завершение задачи (всегда) | Отметить в phase file + errors_log | feedback-loop.md §4 |
| Любое отклонение | Классифицировать → FEEDBACK-запись | feedback-loop.md §1–§3 |
| Arch impact | Обновить `architecture/<module>.md` или создать ADR | arch module |
| Delivery impact | Обновить AC phase file или `critical-path.md` | phase file |

> Без post-execution шага "Завершение задачи" — задача считается незавершённой.
