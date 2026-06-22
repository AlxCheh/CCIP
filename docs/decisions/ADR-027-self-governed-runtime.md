---
adr: ADR-027
status: Принято
impl_anchors:
  - .claude/runtime/governance-reactor.js
  - docs/schemas/session-state.schema.json
related:
  - ADR-021
  - ADR-025
---

# ADR-027 — Self-Governed Runtime: AUTO_CORRECTIONS Dictionary for Governance-Reactor

## Контекст

Governance-reactor (G-1, ADR-017) поверхностно передаёт advisory-директивы в orchestrator через
`additionalSystemPrompt`. Каждый класс аномалий имеет специфичные признаки и специфичное исправление.
Без структурированного словаря исправлений реакция остаётся «напоминанием», а не «самокоррекцией».
ADR-021 установил паттерн: детерминированный класс аномалий → детерминированное действие (path-canonical
`--fix`). ADR-027 обобщает этот паттерн на governance-reactor (§XII.9).

## Решение

**`AUTO_CORRECTIONS` map** — словарь `kind → { type, label, template }` рядом с `DIRECTIVES`.

Начальные корректируемые классы (тип `inject` — добавить repair-блок в prompt):
- `state_contract_degraded` → вставить точный шаблон `## State Update` с форматом JSON
- `contract_collapse` → расширенный шаблон с повышенной срочностью
- `agent_failure_degraded` → направить на `AGENT_BACKUP_MAP` в execute-dag.js

**`selfGoverned` opt:** `buildReaction(state, { selfGoverned: true })` обогащает directive
repair-блоком, добавляя `[SELF-CORRECTED]` маркер и template из `AUTO_CORRECTIONS`. Возвращает
`correctedKinds[]` — список исправленных видов. Default `selfGoverned=false` — чистый advisory
без изменений (backward-compatible).

**Env gate:** `CCIP_SELF_GOVERN=1` — main entrypoint передаёт `selfGoverned:true` и помечает
исправленные алерты `auto_corrected:true` в session-state (дополняет `surfaced:true`, не заменяет).

## Границы (честно)

- Тип коррекции — только `inject` (вставить директиву в prompt). Тип `shell` (фактически запустить
  команду) не реализован в V1: UserPromptSubmit — не место для side-effect-команд. Shell-коррекции
  (например, вызов path-canonical `--fix` из ADR-021) требуют отдельного механизма (Stop hook /
  pre-commit триггер — кандидат для Волны 4).
- `correctedKinds` отражают только классы из `AUTO_CORRECTIONS`; неизвестные виды алертов получают
  стандартную advisory-директиву без коррекции (fail-safe, forward-compatible).
- `CCIP_SELF_GOVERN=1` не включён по умолчанию: поведение по умолчанию — advisory-only, идентично
  поведению до ADR-027.

## Связь

Обобщает паттерн ADR-021 (первый класс детерминированного авто-действия, path-canonical `--fix`).
Дополняет ADR-025 (`agent_failure_degraded` алерты теперь получают repair-директиву в self-governed
режиме). Поверх G-1 из ADR-017 (detect→react loop остаётся advisory; ADR-027 добавляет опциональный
repair-слой).
