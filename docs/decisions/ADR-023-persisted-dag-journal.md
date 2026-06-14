---
adr: ADR-023
status: Принято
impl_anchors:
  - .claude/runtime/dag-journal.js
  - .claude/runtime/execute-dag.js
related:
  - ADR-017
  - ADR-019
  - ADR-022
---

# ADR-023 — Persisted DAG Journal for Cross-Session Resume

**Статус:** Принято 2026-06-14
**Reviewer:** live-сессия sign-off (human-in-the-loop), ветка `feat/fail-closed-lock`
**Связано:** ADR-017 (State Update observability), ADR-019 (cross-process state lock), roadmap §XII.3.

## Контекст

`execute-dag.js` (Level 3.5) уже поддерживал `--resume` и circuit-breaker, но оба механизма опирались на `session-state.json`. При рестарте сессии `session-state.json` инициализируется заново → прогресс DAG (done-шаги) терялся. §XII.3 требует, чтобы журнал шагов переживал рестарт сессии и resume читал из него.

## Решение

1. **`dag-journal.js`** — append-only NDJSON журнал (`dag-journal.jsonl`), хранится рядом с `events.jsonl`. Независим от `session-state.json`. Содержит события: `run_start`, `step_done`, `run_done`, `run_blocked`.

2. **`run_id`** — hex-random уникальный идентификатор каждого прогона (генерируется при старте или восстанавливается при journal-resume).

3. **`dag_hash`** — SHA-1(8) структуры DAG (step/agent/depends_on). Если DAG изменился между сессиями — журнал предыдущего прогона не применяется (разные задачи).

4. **Resume-логика (только незавершённых):** `findResumableRun(dagHash)` находит последний `run_start` без `run_done`/`run_blocked` для этого hash. `getDoneSteps(runId)` восстанавливает done-шаги → `execute-dag` помечает их `status='done'` в state ПЕРЕД выполнением волн.

5. **TTL 7 дней:** `prune()` вызывается при каждом старте, удаляет записи старше 7 дней.

6. **Env-инжекция:** `CCIP_DAG_JOURNAL_FILE` переопределяет путь журнала — позволяет тестировать без загрязнения реального файла.

## Разрешённые развилки

| Развилка | Решение |
|---|---|
| Формат журнала | NDJSON (близко к events.jsonl-паттерну) |
| Resume-политика | только незавершённых (completed runs не резюмируются) |
| TTL | 7 дней |

## Последствия

- `execute-dag.js` теперь пишет `dag-journal.jsonl` при каждом шаге/прогоне. Журнал добавляется в `.gitignore` (runtime-артефакт).
- `session-state.json` по-прежнему авторитетен внутри сессии; journal — источник правды о done-шагах МЕЖДУ сессиями.
- Совместимость: без `--resume` execute-dag всегда стартует новый `run_id` → журнал растёт, prune ограничивает размер.
- Capability-assessment §II «Долгоживущие workflow 45%» → переоценка вверх: базовые многошаговые workflow теперь возобновимы между сессиями.
