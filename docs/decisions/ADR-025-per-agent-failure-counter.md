---
adr: ADR-025
status: Принято
impl_anchors:
  - .claude/runtime/execute-dag.js
  - .claude/runtime/post-agent-hook.js
  - .claude/runtime/failure-detectors.js
  - docs/schemas/session-state.schema.json
related:
  - ADR-017
  - ADR-019
  - ADR-024
---

# ADR-025 — Per-Agent Failure Counter + DAG Auto-Switch

**Статус:** Принято 2026-06-14  
**Reviewer:** live-сессия sign-off, ветка `feat/wave2-signal-enforce`  
**Связано:** ADR-017 (State Update), ADR-024 (signal→enforced), roadmap §XII.6.

---

## Context

CLAUDE.md §Feedback гласит «`agent fails >= 2 → switch to backup`», но §18 честно отмечал: «Нет автоматического счётчика failures/agent | LLM-оркестратор». Wave 2 #6 закрывает эту дыру.

---

## Decision

### `agent_failure_counts` в session-state

Новое поле `{ agentName: count }` в `session-state.json` (схема обновлена). Счётчик инкрементируется двумя write-точками:

1. **`post-agent-hook.js`** (inline-сессии): в ветке `missingBlock` (`parsed === null && !exempt`) добавлен `state.agent_failure_counts[agent]++`.
2. **`execute-dag.js::applyStepResult`** (DAG): в ветке `upd === null && !isContractExempt(step.agent)` (уже добавленной ADR-024) — `state.agent_failure_counts[step.agent]++`.

### `detectAgentFailures` в failure-detectors.js

Новый детектор в `runDetectors`: если `agent_failure_counts[agent] >= threshold` (default 2, `CCIP_AGENT_FAIL_THRESHOLD`) → `governance_alert { kind: 'agent_failure_degraded', degraded: [...], threshold }`. Срабатывает на Stop-time; `governance-reactor.js` (G-1) поверхностно инжектирует в следующий ход.

### `selectEffectiveAgent` в execute-dag.js (DAG auto-switch)

Перед retry-loop: проверяет `agent_failure_counts[step.agent] >= threshold`. Если да — ищет backup в `AGENT_BACKUP_MAP` (кодирует таблицу Intent→Agent→Backup из CLAUDE.md). При нахождении возвращает `{ ...step, agent: backupAgent, fallback_for: originalAgent }`. Решение бакуется на момент старта шага.

```js
const AGENT_BACKUP_MAP = {
  'ccip-architect': 'general-purpose', 'ccip-dba': 'ccip-backend-core',
  'ccip-backend-core': 'general-purpose', 'ccip-backend-aux': 'ccip-backend-core',
  'ccip-frontend': 'general-purpose',  'ccip-devops': 'general-purpose',
  'ccip-qa': 'general-purpose',        'ccip-mobile': 'general-purpose',
  'ccip-security': 'ccip-architect',   'ccip-doc-writer': 'general-purpose',
};
```

Если для агента нет backup (напр. `general-purpose`) — шаг выполняется оригинальным агентом без изменений.

---

## Enforcement scope

| Режим | Механизм | Уровень |
|---|---|---|
| DAG-runtime | `selectEffectiveAgent` auto-switch | machine-enforced (всегда срабатывает pre-spawn) |
| Inline-сессии | `agent_failure_counts` + `detectAgentFailures` alert + governance-reactor | signal (LLM реагирует на alert в следующем ходе) |

---

## Consequences

- CLAUDE.md §18: строка `agent fails >= 2 → switch to backup` переведена из «LLM-оркестратор» в «DAG: machine / Inline: LLM-реакция».
- 9 новых тестов: 402/402, 22/22.
- `detectFallbackDegradation` получает реальные данные: `fallback_for` теперь проставляется автоматически при auto-switch.

---

## Rejected Alternatives

- **Threshold > 2** — CLAUDE.md говорит «>= 2»; менять без обновления документа нет оснований.
- **Inline auto-switch** — не имеет механизма перехвата spawn; governance-alert — максимум достижимого без harness-API.
- **Отдельный backup-agents.json** — дополнительный файл для мониторинга; inline-constant в execute-dag.js проще и всегда синхронизирован.
