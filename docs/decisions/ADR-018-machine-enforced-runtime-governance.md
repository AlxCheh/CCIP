---
adr: ADR-018
status: Принято rev 2
impl_anchors:
  - .claude/runtime/pre-agent-gate.js
  - .claude/runtime/tool-telemetry.js
  - .claude/runtime/aggregate-telemetry.js
  - .claude/runtime/read-gate.js
  - .claude/runtime/fallback-profiles.json
  - .claude/runtime/fallback-context.js
  - .claude/runtime/failure-detectors.js
  - .claude/runtime/contract-debt-injector.js
  - .claude/runtime/governance-manifest.json
  - tools/audit/rgs.js
  - tools/audit/fallback-profiles.js
  - tools/audit/trigger-integrity.js
---

# ADR-018 — Machine-Enforced Runtime Governance

**Статус:** Принято 2026-06-08 · ревизия 2026-06-10 (enforcement активирован, см. §Ревизия)
**Связано:** CLAUDE.md §15 State Contract; CLAUDE.md §16 Reading Discipline; ADR-017 (State Update Observability); closes RFC F-RT-05.

## Контекст

До этого ADR оркестрационные правила CLAUDE.md были декларативными: нарушения инварианта (например, превышение лимита агентов, пропуск `## State Update`, небезопасный полный Read архитектурного файла) проходили молча. Накопленные сигналы ухудшали routing-качество незаметно. Governance-слой существовал как набор соглашений, но без механизма наблюдения или принуждения на уровне runtime.

Четыре ключевые проблемы:

**W1** — Нарушения бюджета агентов и требования security-reviewer не обнаруживались до финального review человека.

**W2** — Инструментальные события (Read, Write, Bash) записывались непоследовательно, без единого формата; анализ toolchain-паттернов сессии был невозможен.

**W3** — Stop-хуки выполнялись без структурированного перечня инвариантов — нечего было проверять против манифеста.

**W4** — Деградация specialist-агентов (fallback на general-purpose) происходила без контекстного инжекта, теряя domain-invariants.

**W5** — Накопленный `contract_debt` (серия пропущенных `## State Update`) не корректировался автоматически до следующего Turn.

**W6** — Системный сигнал о деградации сессии (SSC < 0.8, telemetry blackout, handoff decay, contract collapse) отсутствовал.

**W7** — Governance-покрытие инвариантов не имело числового выражения; риск заслонения проблем был неизмерим.

**W8** — Reading Discipline (§16) нарушалась агентами без механизма обнаружения.

## Решение

Три-плоскостная machine-enforced архитектура с единым источником истины — `governance-manifest.json`.

### Плоскость 1 — Enforcement (PreToolUse deny)

Два блокирующих PreToolUse-хука реализуют **hard deny** (при `CCIP_*_ENFORCE=1`) или **shadow-режим** (по умолчанию, exit 0 + stderr-предупреждение):

- **`pre-agent-gate.js`** — R3 + R4: блокирует 4-й спавн агента (`INV-AGENT-BUDGET`) и отсутствие security-reviewer на HIGH-risk изменениях (`INV-SECURITY-COAGENT`). Deny-протокол: `{hookSpecificOutput:{permissionDecision:'deny',...}}`.
- **`read-gate.js`** — R7: блокирует полный Read защищённых категорий (`docs/architecture/`, `.claude/agents/`) без `limit`/`offset` (`INV-READING-DISCIPLINE`).

Инварианты с `kind:'block'` и `status:'shadow'` переводятся в `status:'enforced'` переменной среды — без изменения кода.

### Плоскость 2 — Telemetry (PostToolUse events)

Три Stop-хука формируют замкнутый pipeline наблюдения:

- **`tool-telemetry.js`** (PostToolUse) — R1: каждый вызов инструмента эмитит событие `{tool, target, ts, session_id}` в `events.jsonl` (`INV-TOOL-TELEMETRY`). `extractTarget` нормализует inline env-var префиксы (bug_003), чтобы целевой инструмент не утекал как `KEY=val`.
- **`aggregate-telemetry.js`** (Stop) — R2: свёртывает `observations[]` + `events.jsonl` в per-session метрики, записывает в `feedback-loop.md §5` (`INV-TELEMETRY-AGGREGATE`).
- **`failure-detectors.js`** (Stop, после aggregate-telemetry) — R6: пять pure-функций детектируют паттерны деградации и записывают `governance_alerts[]` в `session-state.json`:

  | Детектор | Условие | Kind |
  |---|---|---|
  | `detectSSC` | `(total-missing)/total < 0.8` | `silent_state_degradation` |
  | `detectTelemetryBlackout` | наблюдения есть, событий нет | `telemetry_blackout` |
  | `detectHandoffDecay` | пустые `handoff_notes > 40%` | `handoff_decay` |
  | `detectContractCollapse` | `contract_debt ≥ threshold` | `contract_collapse` |
  | `detectFallbackDegradation` | `general-purpose` шаг без `fallback_for` | `fallback_degradation` |

Порядок Stop-хуков жёстко зафиксирован и верифицируется тестом: `aggregate-telemetry → failure-detectors → flush-state`.

### Плоскость 3 — Semantic (governance-manifest + RGS + correction)

- **`governance-manifest.json`** — единый реестр 12 инвариантов. Каждый имеет `id`, `claim`, `doc_anchor`, `enforcement` (file#MARKER), `kind` (block/signal/advisory), `status` (shadow/observed/enforced).
- **`rgs.js`** — R9: **Runtime Governance Score** (advisory, exit 0). Формула:
  - Статическая (нет runtime-данных): `(EC + TI) / 2`
  - Полная (есть state + events): `(EC×0.30 + CCR×0.25 + FC×0.20 + TI×0.15) / 0.90`
  - Компоненты: EC = доля block+signal инвариантов; CCR = 1 − missing/total observations; FC = 1 если events есть при активности, 0 если нет; TI = 0/1 от `trigger-integrity.js`.
  - RC (Routing Confidence) исключена — требует history store intent→agent success rate; отложена.
- **`contract-debt-injector.js`** — R5/§5.2: UserPromptSubmit Level-2-correct; при `contract_debt > 0` инжектирует governance-напоминание через `hookSpecificOutput.additionalSystemPrompt` (`INV-CONTRACT-CORRECTION`).
- **`fallback-profiles.json` + `fallback-context.js`** — R8: при запуске fallback-шага (`fallback_for` поле DAG) `buildFallbackContext` инжектирует `domain_anchors` и `invariants` деградировавшего специалиста в промпт через маркер `[INV-FALLBACK-PROFILE]` в `execute-dag.buildPrompt` (`INV-FALLBACK-PROFILE`).

## Реализация

Покрыто четырьмя PR на `feat/state-update-observability`:

| PR | Содержание |
|---|---|
| **#17** Foundation | `tool-telemetry.js` (R1), `aggregate-telemetry.js` (R2) — telemetry pipeline; `governance-manifest.json` (первые 8 инвариантов) |
| **#18** Enforcement | `pre-agent-gate.js` (R3+R4), shadow deny-протокол |
| **#19** Phase 3 | `read-gate.js` (R7, Windows path normalization), `fallback-profiles.json` + `fallback-context.js` (R8), `rgs.js` (R9 advisory) |
| **#20** Gaps | `failure-detectors.js` (R6), full RGS formula (CCR+FC), `contract-debt-injector.js` (UserPromptSubmit Level-2) |

Тест-покрытие: 264 тестов, 22/22 фазы audit-suite. Каждый поведенческий инвариант верифицируется wiring-тестом.

### Метрики на момент принятия (статическая сессия)

```
[RGS] governance-static=0.96 (EC=0.92 TI=1) — advisory
```

EC = 11/12 инвариантов имеют `kind` block или signal (один advisory). При получении runtime-данных полная формула добавляет CCR, FC.

## Инварианты

| ID | Kind | Status | Plane |
|---|---|---|---|
| INV-STATE-CONTRACT | signal | observed | telemetry |
| INV-STATE-CONTRACT-DAG | signal | observed | telemetry |
| INV-OBSERVABILITY-ROLLUP | signal | observed | telemetry |
| INV-TOOL-TELEMETRY | signal | observed | telemetry |
| INV-CONTRACT-DEBT | signal | observed | telemetry |
| INV-AGENT-BUDGET | block | **enforced** | enforcement |
| INV-SECURITY-COAGENT | block | **enforced** | enforcement |
| INV-TELEMETRY-AGGREGATE | signal | observed | telemetry |
| INV-READING-DISCIPLINE | block | **enforced** | enforcement |
| INV-CONTRACT-CORRECTION | signal | observed | semantic |
| INV-FAILURE-DETECTOR | signal | observed | telemetry |
| INV-FALLBACK-PROFILE | advisory | observed | semantic |

Три block-инварианта (`INV-AGENT-BUDGET`, `INV-SECURITY-COAGENT`, `INV-READING-DISCIPLINE`) **активированы** (`status:enforced`) после прохождения миграционного пути ниже — реально выдают `permissionDecision:deny` под `CCIP_GATE_ENFORCE=1` / `CCIP_READGATE_ENFORCE=1` (в `.claude/settings.json`). Историческая shadow-фаза и активация задокументированы в §Ревизия.

## Ревизия

### 2026-06-09 — активация enforcement (D-01/D-02/D-03)

Три block-инварианта переведены `shadow → enforced` после pre-flight верификации
(22/22 прогонов audit-suite, 0 false-positive). Активация выполнена через
`CCIP_GATE_ENFORCE=1` (pre-agent-gate: `INV-AGENT-BUDGET`, `INV-SECURITY-COAGENT`) и
`CCIP_READGATE_ENFORCE=1` (read-gate: `INV-READING-DISCIPLINE`) в `.claude/settings.json`,
плюс `status:enforced` в `governance-manifest.json`. Миграционный путь shadow→enforced
(см. §Последствия) пройден для этих трёх. Таблица §Инварианты обновлена.

### 2026-06-10 — закалка механизмов (cert 2026-06-10)

Независимая сертификация выявила обходы активированных гейтов; устранены:
- **INV-AGENT-BUDGET:** `override` теперь требует строку-обоснование (не boolean), снимает
  только budget, пишет durable-аудит (`governance-audit.jsonl`); параллельный burst закрыт
  учётом `inflight_spawns` с TTL (E-1, E-2).
- **INV-SECURITY-COAGENT:** `SECURITY_RE` расширен до полного канона CLAUDE.md
  (JWT/GpToken/multi-tenancy/AuditLog); триггер стал surface-driven при **любом** risk
  (раньше требовал HIGH) — занижение risk-метки больше не пропускает reviewer; security-часть
  override неснимаема (E-3, E-7).
- **INV-READING-DISCIPLINE:** case-insensitive матч пути + лимит сверх потолка
  (`CCIP_READ_MAX_LINES`) считается полным чтением (E-4, E-5).

Добавлен 13-й инвариант **`INV-GOVERNANCE-REACTOR`** (signal, `governance-reactor.js`,
UserPromptSubmit): замыкает петлю detect→react — не-surfaced `governance_alerts[]`
инжектятся в контекст следующего turn (G-1). Таблица §Инварианты выше отражает исходные
12 инвариантов решения; реестр-истина — `governance-manifest.json`.

## Последствия

**Позитивные:**
- Governance-покрытие: ~5% (декларативное) → ~60–70% (machine-observed), при активации enforce → ~90%.
- Деградация сессии (SSC < 0.8, blackout, decay) становится машинно-наблюдаемой через `governance_alerts[]`.
- `contract_debt` корректируется автоматически на следующем Turn без ручного вмешательства.
- Fallback-шаги сохраняют domain-context деградировавшего специалиста.
- `governance-manifest.json` — единственное место для изменения статуса инварианта; не требует правки кода хука.

**Негативные / ограничения:**
- Shadow→Enforce требует накопления FPR (false positive rate) из реальных сессий. Преждевременная активация может блокировать легитимную работу.
- Формула RGS без RC (Routing Confidence) неполна; компонент RC требует отдельного history-store ADR.
- B1 (RGS hard-fail в CI при score < threshold) отложен до стабилизации baseline.
- B2 (Breaking Change для агентских промптов при изменении `governance-manifest.json`) требует migration path при добавлении нового block-инварианта.

**Путь миграции shadow → enforced:**

```
1. Наблюдать FPR по stderr-предупреждениям ≥ 5 сессий
2. Если FPR < 5% → CCIP_<INV>_ENFORCE=1 в .claude/settings.env
3. Обновить status в governance-manifest.json: "shadow" → "enforced"
4. Обновить docs/schemas/governance-manifest.schema.json если enum расширяется
```
