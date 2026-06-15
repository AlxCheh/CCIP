---
adr: ADR-026
status: Принято
impl_anchors:
  - .claude/runtime/execute-dag.js
  - .claude/runtime/pre-agent-gate.js
  - docs/schemas/session-state.schema.json
related:
  - ADR-019
  - ADR-025
---

## Контекст

До ADR-026 `agent_outputs` использовал голое имя агента как ключ (`agent_outputs["ccip-architect"]`). При
повторном использовании одного типа агента в двух шагах DAG (параллельно или последовательно) второй вызов
перезаписывал handoff_notes первого, нарушая изоляцию шагов. Лимит агентов `CCIP_MAX_AGENTS=3` (ADR-019)
не позволял строить DAG из 4–5 шагов без принудительного override, хотя per-step контроль достаточен.

## Решение

**Составной ключ (DAG-режим):** `applyStepResult` записывает в `agent_outputs["${agent}:${step}"]`.
Это гарантирует, что два шага с одним типом агента (например, два `ccip-backend-core`) не пересекаются в
state. `validateDependencyOutputs` ищет по составному ключу. `buildPrompt` отображает без суффикса шага.

**Inline-режим** (`post-agent-hook.js`, вне DAG): ключ остаётся голым именем агента. Смешивание форматов
безопасно: `buildPrompt` и `detectHandoffDecay` работают через `Object.values()` / итерацию без привязки
к формату ключа.

**Бюджет 3→5:** `CCIP_MAX_AGENTS` default поднят до 5 и в `evaluateGate` pure function, и в entrypoint.
При per-step изоляции state collision невозможна — рост лимита безопасен. Override-путь (E-1) остаётся.

## Границы (честно)

- Изоляция защищает от коллизий записи; независимость чтения (агент видит все предыдущие outputs) не
  изменилась — `buildPrompt` передаёт все записи как "Previous Agents".
- Количество до 5 выбрано как разумный компромисс для DAG CCIP-масштаба; для >5 нужен явный
  `CCIP_MAX_AGENTS=N` или override с обоснованием.
- `AGENT_BACKUP_MAP` в execute-dag.js покрывает все 10 специалистов; при добавлении нового агента MAP
  ОБЯЗАТЕЛЕН к расширению перед поднятием бюджета.

## Связь

Дополняет ADR-019 (state-lock RMW обеспечивает атомарность записей). Поверх ADR-025 (agent_failure_counts
и selectEffectiveAgent не затронуты — они по-прежнему ключируются по имени агента, не шагу).
