---
adr: ADR-016
status: Принято rev 2
impl_anchors:
  - .claude/agents/token-efficiency-auditor.md
  - .claude/audit/
---

<!-- Связанные документы (не ADR, поэтому вне frontmatter `related`):
     CLAUDE.md §15 State Contract, §16 Reading Discipline,
     docs/proposals/token-efficiency-auditor-draft.md (proposal-черновик). -->


# ADR-016 — Token-Efficiency Auditor Agent

**Статус:** Принято rev 2 (уточнён 2026-05-25 — см. «Уточнение (2026-05-25)»)
**Закрывает:** Открытые вопросы из `docs/proposals/token-efficiency-auditor-draft.md` (п. 3, 5, 6)

## Решение

В CCIP вводится автономный агент `token-efficiency-auditor`, работающий в read-only режиме над сессионным состоянием. Агент анализирует `session-state.json` (поля `agent_outputs[*]` и `observations[]`), выявляет bloat по правилам R-NNN, самообучается по двухуровневой петле и формирует отчёт. Агент **не обращается** к raw transcript и не модифицирует ход активной сессии.

Правила, требующие raw turn-level token attribution (R-007, R-009, R-012), стартуют исключительно в `quarantine.yaml` с флагом `requires_transcript_access: true` и не могут быть промотированы в `active` без реализации transcript-доступа в runtime.

## Контекст

Per-session token cost является управляемым ресурсом в многоагентной CCIP-оркестрации. До введения этого ADR не существовало формализованного механизма обнаружения токен-расточительных паттернов (redundant reads, verbose padding, context bloat). §16 Reading Discipline описывает правила, но не контролирует их соблюдение.

Ограничение runtime: `post-agent-hook.js` пишет только производные данные в `session-state.json`; полный raw transcript текущей сессии не экспонируется агентам. Источником истины для аудитора является `agent_outputs[*]` + `observations[]`.

Связь с §15: аудитор является полноправным агентом State Contract — обязан эмитить `## State Update` блок, читается `post-agent-hook.js`.

## Контракт

### Файловая иерархия

```
.claude/audit/
├── rules/
│   ├── active.yaml          # боевой набор R-001..R-NNN
│   ├── quarantine.yaml      # испытательный срок 3 сессии; quarantined rules несут флаг requires_transcript_access
│   ├── deprecated.yaml      # архив с причинами
│   └── baseline.yaml        # immutable seed (откат при катастрофе)
├── metrics/
│   ├── history.jsonl        # append-only, 1 строка = 1 сессия
│   └── rolling-30.json      # производный агрегат
├── antipatterns/
│   └── AP-NNN.md            # атомарные карточки
├── evidence/
│   └── <session-id>.json    # сырые findings + token-attribution
└── reports/
    └── <session-id>.md      # человекочитаемый отчёт
```

### YAML агента (`.claude/agents/token-efficiency-auditor.md`)

Frontmatter-схема CCIP (`docs/schemas/agent-frontmatter.schema.json`) закрыта
(`additionalProperties: false`) и допускает только `name / description / tools /
model / summary`. Поэтому frontmatter — канонический:

```yaml
name: token-efficiency-auditor
description: "Автономный аудитор токен-эффективности... Read-only over session. См. ADR-016."
tools: Read, Write, Edit, Glob, Grep, Bash
model: claude-haiku-4-5-20251001
summary: "Read-only аудит токен-bloat по session-state.json ... Triggers T-01,T-02,T-06..T-10 (T-03/T-04/T-05 quarantine — нет API для raw token attribution). ADR-016."
```

Контрактные поля (`primary_input`, `state_contract`, `model_override_allowed`,
`invariants`) живут в **body** агента машиночитаемым `agent-contract`-блоком —
схема frontmatter их не допускает:

```yaml
# agent-contract (в body)
primary_input: .claude/runtime/session-state.json
state_contract: required
model_override_allowed: true
invariants:
  - read_only_over_session
  - never_modifies_user_visible_output
  - never_deletes_baseline.yaml
  - quality_gate_rollback_if_E_resp_drops_gt_5pct
```

### Invariants

1. `read_only_over_session` — не модифицирует ничего за пределами `.claude/audit/` и `## State Update` блока.
2. `never_modifies_user_visible_output` — не правит активный transcript, агентские промты, CLAUDE.md.
3. `never_deletes_baseline.yaml` — `baseline.yaml` иммутабелен; только `active.yaml` / `quarantine.yaml` изменяемы.
4. `quality_gate_rollback_if_E_resp_drops_gt_5pct` — если `ΔE_resp < −0.05` при `ΔT < 0`, правила-виновники откатываются в `quarantine`. Применяется при `min_confidence ≥ 0.6`; ниже порога — авто-промоушен запрещён.

### Lifecycle правила

```
proposed → quarantine(3 сессии) → active ──┐
                ↓                          ↓
            rejected                  deprecated
```

Промоушен `quarantine → active`: ΔT ≥ +5% AND ΔQ ≥ 0 AND precision ≥ 0.7.
Авто-deprecate: hit_count = 0 за 20 сессий ИЛИ precision < 0.4.

### Триггеры

| ID | Когда | Зависимости |
|----|-------|-------------|
| T-01 | `/token-audit` явная команда | — |
| T-02 | «Завершаем сессию» / `/session-end` | `depends_on: [ccip-session-optimizer]`; запускается после optimizer |
| T-03 | context_used ≥ 70% | — |
| T-04 | turn_tokens > mean + 2·stdev | — |
| T-05 | single_assistant_tokens > 4000 | — |
| T-06 | один `(path,offset)` прочитан ≥ 3 раз | — |
| T-07 | tool_calls_per_turn > 15 | — |
| T-08 | ExitPlanMode invoked | — |
| T-09 | turn_index % 20 == 0 | — |
| T-10 | agent_failures ≥ 2 за последние 5 turns | — |

### Метрики

| Метрика | Доступность | Примечание |
|---------|-------------|------------|
| `T_total` | точная | из `observations[].context_tokens` |
| `T_useful` | estimated | пропорция non-bloat сегментов |
| `IDC = T_useful/T_total` | estimated | цель ≥ 0.65; `min_confidence: 0.6` |
| `E_resp` | estimated | `goals_met × IDC × (1 − R_dup)`; `min_confidence: 0.6` |
| `CoT_ratio` | недоступен | null в текущем runtime; reserved |
| `R_dup` | estimated | цель ≤ 0.08 |
| `ΔT_session` | точная | vs rolling-30 mean |

### Seed-правила

Правила R-001..R-006, R-008, R-010, R-011, R-013..R-015 стартуют в `active.yaml`.
Правила R-007, R-009, R-012 стартуют в `quarantine.yaml` с флагом `requires_transcript_access: true`.

## Уточнение (2026-05-25): scope для inline-сессий без субагентов

**Контекст.** `/token-audit` (T-01) на сессии, выполненной целиком главным агентом (inline Read/Edit/Bash, без `Agent`-вызовов), давал немой `trivial-skip`: `agent_outputs`/`observations` наполняет только `post-agent-hook.js` на границе субагента, а токены главного агента хукам недоступны (`audit-trigger-hook.js`, `audit-turn-hook.js`). См. `docs/tasks/token-audit-inline-session-gap.md`.

**Решение (направление B).** Scope аудитора подтверждается: token-attribution измеряет **мульти-агентную оркестрацию** через `observations[].context_tokens` — единственную точную метрику. Inline-сессии остаются **вне token-attribution**, но перестают быть немыми:

1. `observations[]` и контракт §15 **не меняются** — остаются agent-boundary; `docs/schemas/session-state.schema.json` не трогается.
2. Recorder (`tools/audit/token-session-record.js`) при `agents === 0` различает два исхода:
   - `inline-session` — в `trigger-state.json` есть реальная inline-активность (`total_calls ≥ 5`, повторные `read_counts`, либо сработавшие триггеры). Возвращает явный `scope: out-of-token-attribution` + качественные сигналы (`dup_reads`, `tool_calls`, `triggers_fired`); строку в `history.jsonl` **не пишет** (нет точного `T_total`), инкрементит `sessions_inline` в `rolling-30.json`.
   - `trivial-skip` — пустая сессия без активности либо `agents > 0 && T_total < MIN_TOKENS`. Поведение прежнее.
3. **Никаких оценочных токенов из tool-call-счётчиков** — сохраняется инвариант «`T_total` точен»; estimated-данные в историю не попадают. Сигналы сообщаются качественно, без числа токенов (инвариант ADR-016 о пометке estimated соблюдён тривиально — оценочных метрик не эмитим).
4. Мульти-агентный путь (`post-agent-hook.js` → `agent_outputs`/`observations` → `recorded`) не затронут.

**Отклонено (направление A).** Писать coarse turn-level `observations` с оценкой токенов из `tool_calls` в `session-state.json`: загрязнило бы единственную точную метрику `T_total` оценочным шумом (tool-calls ≠ токены), потребовало бы дискриминатора `kind`/флага `estimated` в схеме и переписывания recorder на раздельный учёт — большая правка контракта §15 ради низкокачественных данных. Доступ к raw-transcript / per-message токенам остаётся вне scope (ограничение runtime — см. ниже).

## Отклонённые альтернативы

| Альтернатива | Причина |
|---|---|
| Аудитор читает raw transcript | Transcript текущей сессии недоступен в CCIP runtime — `post-agent-hook.js` не экспонирует его агентам. Реализация потребует изменения runtime и выходит за рамки данного ADR |
| Размещение state в `tools/audit/` вместо `.claude/audit/` | `tools/audit/` содержит CI/runtime инструменты Node.js. Данные аудитора (rules, metrics, evidence) — agent-owned persistent state, логично изолировать в `.claude/` namespace |
| Запуск auditor параллельно с `ccip-session-optimizer` на T-02 | Аудитор читает артефакты optimizer'а как дополнительный input — последовательность обязательна. Параллельный запуск создаст race condition на `session-state.json` |
| Статическая rule library без self-learning | Не адаптируется к стилю конкретного проекта и теряет точность со временем. Двухуровневая петля self-critique и lifecycle quarantine→active обеспечивают precision ≥ 0.7 |
| Runtime-конвенция уровня `.claude/runtime/` без ADR | Изменение пересекает §15 (State Contract), §16 (Reading Discipline) и вводит новый класс агента с persistent state и self-modification права — требует явного ADR |
