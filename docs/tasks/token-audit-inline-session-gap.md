# Task: token-audit слеп к сессиям без субагентов

**ID:** TASK-2026-05-24-token-audit-inline-gap
**Task Type:** Architecture Change (правит State Contract §15 + ADR-016)
**Routing:** `ccip-architect` (lead) → T4; co-agent при реализации хука — `ccip-backend-aux`
**Status:** deferred · ожидает ADR-решения
**Raised:** 2026-05-24 (сессия audit-remediation, PR #2 merge `37babaa`)

---

## Проблема

`/token-audit` (T-01) на сессии, выполненной целиком главным агентом (inline Bash/Edit/Read, без `Agent`-вызовов), всегда даёт `trivial-skip`: единственный источник данных аудитора пуст.

## Доказательство (эта сессия)

Два независимых state-файла, заполняются разными хуками:

| Файл | Кто пишет (hook) | Эта сессия |
|---|---|---|
| `.claude/audit/trigger-state.json` | `audit-turn-hook.js` (UserPromptSubmit) + `audit-trigger-hook.js` (PostToolUse[*]) | ✅ заполнен: 66 вызовов, 9 turns, T-07 сработал |
| `.claude/runtime/session-state.json` | `post-agent-hook.js` (PostToolUse[**Agent**]) | ❌ пуст (INIT): `agent_outputs:{}`, `observations:[]` |

Триггерный конвейер отработал штатно (T-07 → `pending_audit`), но `agent_outputs`/`observations` наполняет **только** `post-agent-hook.js` на завершении субагента. За сессию субагентов не было → массивы пусты → аудитору нечего сегментировать (L2 Ingest), recorder возвращает `trivial-skip` («сессии без `agent_outputs`»).

## Корень (by-design, не баг)

1. `audit-turn-hook.js` / `audit-trigger-hook.js` пишут только в `trigger-state.json`; `session-state.json` лишь читают (для `session_id`).
2. `audit-trigger-hook.js` документирует: *«T-03/T-04/T-05 not handled — no API exposes per-message tokens to hooks»* — токены main-агента хукам недоступны.
3. ADR-016: аудитор измеряет телеметрию **мульти-агентной оркестрации** (`agent_outputs[*]` + `observations[]`), а не inline-работу главного агента.

## Предлагаемое направление (требует ADR-решения)

Расширить `audit-turn-hook.js`, чтобы он писал **coarse turn-level `observations`** в `session-state.json` (outcome + грубая оценка по tool-calls/turn из уже имеющихся счётчиков `trigger-state.json`), делая inline-сессии частично аудируемыми без raw-transcript.

**Развилки для ccip-architect:**
- Менять ли контракт `session-state.schema.json` (`observations[]` сейчас наполняются на границе агента) — затрагивает §15.
- Источник оценки токенов при отсутствии raw transcript (хуки видят только tool-call counts) — насколько достоверны estimated-метрики.
- Не дублировать ли это с trigger-state (избежать двух источников истины).
- Альтернатива: оставить как есть и явно задокументировать в ADR-016, что аудитор покрывает только мульти-агентные сессии (тогда `/token-audit` без субагентов должен отвечать понятным «вне scope», а не `trivial-skip`).

## Definition of Ready (Architecture Change)

- [ ] **ADR** — required: расширение/уточнение ADR-016 (scope аудитора + контракт §15). **Блокер до начала реализации.**
- [ ] **Phase** — n/a (инфраструктура AI-слоя, вне M-карты)
- [ ] **Dependency** — `.claude/runtime/*` hooks, `docs/schemas/session-state.schema.json`
- [ ] **AC** — см. ниже

## Acceptance Criteria (черновик, финализирует ccip-architect/PO)

1. `/token-audit` на сессии без субагентов даёт **детерминированный понятный исход** (либо частичный отчёт по turn-level observations, либо явный «вне scope» — по решению ADR), **не** немой `trivial-skip`.
2. Если выбран путь turn-level observations: `session-state.json` валиден по схеме после правки; `tools/audit/session-state.js` зелёный.
3. estimated-метрики помечаются `estimated:true` (инвариант ADR-016 при отсутствии raw transcript).
4. Регрессия не ломает мульти-агентный путь (`post-agent-hook.js` по-прежнему наполняет `agent_outputs`).

## Вне scope

- Доступ к raw transcript / per-message токенам (недоступно хукам на текущем runtime).
- Изменение триггерной логики T-06..T-10 (работает корректно).

## Ссылки

- ADR-016 — `docs/decisions/ADR-016-token-efficiency-auditor.md`
- State Contract — `CLAUDE.md §15`
- Хуки — `.claude/runtime/{audit-turn-hook,audit-trigger-hook,post-agent-hook}.js`
- Схема — `docs/schemas/session-state.schema.json`
