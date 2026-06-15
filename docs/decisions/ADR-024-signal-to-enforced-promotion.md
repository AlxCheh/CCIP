---
adr: ADR-024
status: Принято
impl_anchors:
  - .claude/runtime/execute-dag.js
  - .claude/runtime/governance-manifest.json
  - .claude/runtime/failure-detectors.js
related:
  - ADR-017
  - ADR-019
  - ADR-023
---

# ADR-024 — Signal → Enforced Promotion: INV-STATE-CONTRACT-DAG и INV-TOOL-TELEMETRY

**Статус:** Принято 2026-06-14  
**Reviewer:** live-сессия sign-off (human-in-the-loop), ветка `feat/wave2-signal-enforce`  
**Связано:** ADR-017 (State Update observability), ADR-019 (FPR-методика), roadmap §XII.2.

---

## Context

После Волны 1 два инварианта в `governance-manifest.json` оставались со статусом `"observed"`:

- `INV-STATE-CONTRACT-DAG` — DAG-runner должен фиксировать пропуск `## State Update` так же, как это делает `post-agent-hook.js` (inline-режим). По факту `execute-dag.js` только логировал в stderr, без записи в `governance_alerts[]`.
- `INV-TOOL-TELEMETRY` — каждый tool call должен порождать событие телеметрии. Structural guarantee (PostToolUse always fires) существовала, но wiring blackout → governance_alert не был формально задокументирован и не имел end-to-end теста.

Методика «observed → enforced» (из ADR-019): FPR=0 — доказывается либо структурной гарантией (путь всегда проходится), либо exemption-allowlist (ложных срабатываний нет по design).

---

## Decision

### INV-STATE-CONTRACT-DAG

В `execute-dag.js::applyStepResult` добавлен governance alert-push:

```js
const { isContractExempt } = require('./contract-exempt');

// В applyStepResult, после проверки upd === null:
if (!isContractExempt(step.agent)) {
  state.governance_alerts = state.governance_alerts || [];
  state.governance_alerts.push({
    kind: 'state_contract_degraded',
    at: new Date().toISOString(),
    agent: step.agent,
    source: 'execute-dag',
  });
}
```

**FPR=0 аргумент:** `isContractExempt` проверяет `contract-exempt.js` allowlist (только relay-агенты). Non-relay DAG-агенты обязаны публиковать `## State Update`. Нет ложных срабатываний.

### INV-TOOL-TELEMETRY

Изменений в runtime-коде нет — enforcement уже существовал:

1. `tool-telemetry.js` (PostToolUse hook) — пишет событие для каждого tool call. PostToolUse — это harness-level гарантия: hook всегда вызывается после любого tool result.
2. `failure-detectors.js::detectTelemetryBlackout` — Stop-hook: если `observations.length > 0` и `events.length === 0` → `telemetry_blackout` → `governance_alerts[]` через `updateStateLocked`.

**FPR=0 аргумент:** PostToolUse структурно не может пропустить tool call (это гарантия платформы). Blackout-детектор срабатывает только при полном отсутствии событий в присутствии наблюдений — ложные срабатывания исключены тем, что idle-сессии (без наблюдений) не считаются blackout.

Добавлен end-to-end wiring test (`failure-detectors-wiring.test.js`): spawn `failure-detectors.js` с state, содержащим наблюдение, но без events-файла → проверяет наличие `telemetry_blackout` в `governance_alerts[]`.

---

## Consequences

- `governance-manifest.json`: `INV-STATE-CONTRACT-DAG` и `INV-TOOL-TELEMETRY` → `"status": "enforced"`.
- RGS (governance-static) в audit-suite: 0.46 → 0.96.
- DAG-runner теперь полностью паритетен с inline-runner по State Contract enforcement.
- Telemetry blackout получает durable governance alert, видимый через `governance-reactor.js` в следующем ходе.
- Тесты: 393/393, 22/22.

---

## Rejected Alternatives

- **Extend trigger-integrity для множественных enforcement-anchors** — избыточно; задача устранена через `enforcement_secondary` поле (вне проверки trigger-integrity) + ясный claim.
- **Ждать N сессий live-данных перед promotion** — структурные FPR=0 аргументы достаточны; ожидание данных нужно только при вероятностных утверждениях.
