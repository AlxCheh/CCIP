---
status: Draft (под ADR-ревью)
proposed_adr: ADR-016
author: orchestration
date: 2026-05-22
target_locations:
  - .claude/agents/token-efficiency-auditor.md
  - .claude/audit/
related:
  - ccip-session-optimizer (.claude/agents/ccip-session-optimizer.md)
  - state-protocol (.claude/runtime/state-protocol.md §15)
  - reading-discipline (CLAUDE.md §16)
---

# Token-Efficiency Auditor — proposal draft

> Это **draft под ADR-ревью**, не утверждённое решение. Архитектор может:
> (a) одобрить с минорными правками → конвертировать в `docs/decisions/ADR-016-*.md`,
> (b) потребовать существенных изменений → этот файл правится, ревью повторяется,
> (c) отклонить → файл переезжает в `docs/decisions/` со статусом Rejected или удаляется.

## Цель

Автономный аудитор токен-эффективности AI-сессий. Анализирует transcript,
выявляет bloat по правилам R-NNN, обучает собственный rule-set, формирует
отчёт. Read-only over session — не правит ход сессии.

## Архитектура (L1–L7)

```
┌─────────────────────────────────────────────────────────────┐
│ L1 Trigger Layer         resolve_trigger() → run_context    │
│ L2 Ingestor              session-state.json                  │
│                          (agent_outputs + observations)      │
│                          → segments                          │
│ L3 Classifier            segments → labeled_segments        │
│ L4 Metric Engine         labeled → metrics_vector           │
│ L5 Rule Engine           labeled + rules.active → findings  │
│ L6 Self-Critique         findings → vetted_findings         │
│ L7 Report + Rule Updater vetted → report + rules_delta      │
└─────────────────────────────────────────────────────────────┘
                        ↓
            Memory (rules / metrics / antipatterns)
```

Принципы: stateless ядро + stateful память; двойная петля self-critique
(findings и rules_delta); никаких записей в активный transcript.

**Источник данных (constraint из ревью архитектора).** Полный raw transcript
текущей сессии в runtime CCIP **недоступен** — `post-agent-hook.js` пишет
только производные в `.claude/runtime/session-state.json`. Поэтому L2
Ingestor работает с `agent_outputs[*]` (summary + artifacts + handoff_notes)
и `observations[]` (outcome + estimated context_tokens). Правила, требующие
raw turn-level token attribution (см. R-007, R-009, R-012 ниже), стартуют в
quarantine с флагом `requires_transcript_access: true` и могут быть
промотированы только после реализации transcript-доступа в runtime.

## Файловая иерархия (предлагаемая)

```
.claude/audit/
├── rules/
│   ├── active.yaml          # боевой набор R-001..R-NNN
│   ├── quarantine.yaml      # испытательный срок 3 сессии
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

## Lifecycle правила

```
proposed → quarantine(3 сессии) → active ──┐
                ↓                          ↓
            rejected                  deprecated
```

Промоушен `quarantine → active` требует одновременно:
1. ΔT ≥ +5% (правило экономит токены)
2. ΔQ ≥ 0 (качество не упало; см. метрика E_resp)
3. precision ≥ 0.7

Авто-deprecate: hit_count = 0 за последние 20 сессий ИЛИ precision < 0.4.

## Seed-правила R-001..R-015

| ID | Категория | Что ловит |
|----|-----------|-----------|
| R-001 | redundant_io | Read файла > 200 строк без limit/offset |
| R-002 | redundant_io | Повторное чтение того же `path:offset` |
| R-003 | verbose_padding | Преамбула «Сейчас я …» > 1 предложения |
| R-004 | verbose_padding | Финальное summary, повторяющее tool diff |
| R-005 | repeated_info | Один путь упомянут ≥ 4 раз в одном turn |
| R-006 | useless_clarification | Уточнение, ответ на которое есть в системном промте |
| R-007 † | suboptimal_cot | CoT длиннее ответа более чем в 3 раза |
| R-008 | inefficient_prompt | User prompt > 2000 токенов без структурирования |
| R-009 † | context_bloat | Tool result полностью вставлен в следующий промт |
| R-010 | over_explanation | Объяснение того, что видно из diff |
| R-011 | redundant_tool_call | Параллелизируемые Read'ы выполнены последовательно |
| R-012 † | suboptimal_cot | «Thinking out loud» без thinking-блока |
| R-013 | context_bloat | Дублирование handoff_notes между co-agent'ами |
| R-014 | verbose_padding | Поздравительный/эмпатический шум |
| R-015 | inefficient_prompt | «Расскажи всё про X» без явного scope |

† — стартует в `quarantine.yaml` с флагом `requires_transcript_access: true`.
Промоушен в `active` возможен только после реализации raw transcript
доступа в runtime; на данный момент только `R-001..R-006, R-008,
R-010..R-011, R-013..R-015` доказуемы из `session-state.json`.

## Метрики

- `T_total` (из суммы `observations[].context_tokens`)
- `T_useful` (estimated — пропорция non-bloat сегментов)
- `IDC = T_useful/T_total` (estimated, цель ≥ 0.65) †
- `R_dup ≤ 0.08`, `CoT_ratio` ∈ [0.3, 2.0] ‡
- `E_resp = goals_met × IDC × (1 − R_dup)` (estimated) †
- `ΔT_session` vs rolling-30 mean
- `ToolCall_efficiency`, `Repeat_reads = 0` (target)

† — `estimated`: вычисляется приближённо по `observations[].context_tokens` и
classified сегментам из `agent_outputs[*]`. Точное значение требует raw
transcript и недоступно в текущем runtime.

‡ — `CoT_ratio` недоступен без transcript; метрика декларативно сохранена для
будущей реализации, текущий runtime эмитит `null`.

Quality-gate: ΔT < 0 (экономия), но ΔE_resp < −0.05 → откат правил-виновников.
Поскольку E_resp estimated, quality-gate применяется с дополнительным
threshold'ом доверия (`min_confidence: 0.6`) — ниже порога правила не
промотируются автоматически.

## Триггеры (10)

| ID | Когда | Зависимости |
|----|-------|-------------|
| T-01 | `/token-audit` явная команда | — |
| T-02 | «Завершаем сессию» / «End session» / `/session-end` | `depends_on: [ccip-session-optimizer]` — auditor запускается **после** optimizer; читает его `agent_outputs[ccip-session-optimizer].artifacts` как дополнительный input |
| T-03 | context_used ≥ 70% | — |
| T-04 | turn_tokens > mean + 2·stdev |
| T-05 | single_assistant_tokens > 4000 |
| T-06 | один `(path,offset)` прочитан ≥ 3 раз |
| T-07 | tool_calls_per_turn > 15 |
| T-08 | ExitPlanMode invoked |
| T-09 | turn_index % 20 == 0 (периодический чекпойнт) |
| T-10 | agent_failures ≥ 2 за последние 5 turns |

## YAML агента (`.claude/agents/token-efficiency-auditor.md`)

```yaml
---
name: token-efficiency-auditor
description: |
  Автономный аудитор токен-эффективности AI-сессий. Анализирует transcript,
  выявляет bloat по правилам R-NNN, обучает rule-set, формирует отчёт.
  Read-only over session.
tools: [Read, Write, Edit, Glob, Grep, Bash]
model: claude-haiku-4-5-20251001
model_override_allowed: true  # допустимо форсировать Sonnet для сложных промоушенов
summary: |
  Reads .claude/audit/rules/active.yaml + .claude/runtime/session-state.json
  (agent_outputs + observations); writes report.md + rules-delta.
  Self-critique двухслойный. Не пишет в активный поток.
primary_input: .claude/runtime/session-state.json
state_contract: required  # обязан эмитить ## State Update; иначе post-agent-hook ставит fallback и теряет artifacts
invariants:
  - read_only_over_session
  - never_modifies_user_visible_output
  - never_deletes_baseline.yaml
  - quality_gate_rollback_if_E_resp_drops_gt_5pct
learning:
  quarantine_period_sessions: 3
  promotion: { delta_T_pct: 5, delta_Q: 0, precision: 0.7 }
  deprecation: { zero_hit_sessions: 20, precision_floor: 0.4 }
---
```

## Открытые вопросы для архитектора

1. **Конфликт с `ccip-session-optimizer`.** Оба срабатывают на T-02. Чья
   очередь первой? Предложено: optimizer → auditor (читает его артефакты).
   Согласуется ли это с текущим протоколом завершения сессии?
2. **Локация `.claude/audit/`.** Альтернатива — `tools/audit/` (там уже
   есть инструменты). Какая конвенция корректнее?
3. **Стоит ли ADR.** Изменение пересекает несколько ADR-зон (state contract
   §15, reading discipline §16). Достаточно ли веса для ADR-016, или это
   runtime-конвенция уровня `.claude/runtime/`?
4. **Модель.** Предложено Haiku 4.5. Допустимо ли для project-internal
   агента, который сам читает session-state и rules?
5. **Доступ к transcript.** Существует ли в текущем runtime'е путь к
   полному transcript'у текущей сессии? Если нет — какой источник истины
   использовать (post-agent-hook логи? observations[]?).
6. **Интеграция с `state-protocol.md` §15.** Должен ли auditor читать
   `agent_outputs[*]` и `observations[]` как input, и писать `## State
   Update` блок в своём выводе?

## Что выдать в ревью

- Вердикт: approve / approve-with-changes / reject
- Если approve: draft ADR-016 (имя файла, frontmatter, ключевые разделы)
- Если changes: точечный список с file_path:section
- Если reject: причина + альтернатива
