---
description: Запустить token-efficiency-auditor по текущей сессии (триггер T-01, ADR-016)
argument-hint: "[focus: rules | metrics | all] (опц., по умолчанию all)"
allowed-tools: Task, Read, Glob, Grep, Bash
---

Триггер **T-01** агента `token-efficiency-auditor` (см. `docs/decisions/ADR-016-token-efficiency-auditor.md`).

Запусти субагента **token-efficiency-auditor** для аудита токен-эффективности текущей сессии.

## Контекст запуска

- **Источник данных:** `.claude/runtime/session-state.json` (`agent_outputs[*]` + `observations[]`). Raw transcript недоступен — правила с `requires_transcript_access: true` (R-007/R-009/R-012) не оценивать как active.
- **Правила:** `.claude/audit/rules/active.yaml` (live) + shadow-прогон `.claude/audit/rules/quarantine.yaml`.
- **Фокус (`$ARGUMENTS`):**
  - `rules` — только findings + обновление rule-set, без полного отчёта по метрикам;
  - `metrics` — только метрики (T_total, IDC, R_dup, E_resp, ΔT_session), без правки правил;
  - `all` или пусто — полный цикл L1→L7.

## Что агент обязан вернуть

1. Отчёт в `.claude/audit/reports/<session-id>.md` по формату из агента (Сводка → Найденные проблемы → Стоимость → Исправления → Обновления правил → Прогноз → Self-critique).
2. Evidence в `.claude/audit/evidence/<session-id>.json`, append в `.claude/audit/metrics/history.jsonl`.
3. Блок `## State Update` (контракт CLAUDE.md §15) в финале вывода.

## Инварианты (напомни агенту)

- read-only over session: писать только в `.claude/audit/`;
- не модифицировать активный поток, промты, CLAUDE.md;
- не промотировать правила с `requires_transcript_access: true` на текущем runtime;
- findings без `token_cost` и ссылки на сегмент — невалидны.

После завершения агента кратко резюмируй: сколько bloat найдено (в токенах), какие правила обновлены, путь к отчёту.
