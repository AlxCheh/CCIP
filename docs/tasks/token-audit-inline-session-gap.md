# Task: token-audit слеп к сессиям без субагентов

**ID:** TASK-2026-05-24-token-audit-inline-gap
**Task Type:** Architecture Change (правит State Contract §15 + ADR-016)
**Routing:** `ccip-architect` (lead) → T4; co-agent при реализации хука — `ccip-backend-aux`
**Status:** resolved · ADR-решение принято (направление B, 2026-05-25)
**Raised:** 2026-05-24 (сессия audit-remediation, PR #2 merge `37babaa`)
**Resolved:** 2026-05-25 — ADR-016 «Уточнение (2026-05-25)», ветка `docs/token-audit-inline-gap`

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

## Решение (2026-05-25)

Принято **направление B** (scope + явный исход), отклонено A (расширение хука + схемы). Полная мотивировка — ADR-016 «Уточнение (2026-05-25)».

Реализация:
- `tools/audit/token-session-record.js` — исход `inline-session` (`scope: out-of-token-attribution` + сигналы из `trigger-state.json`), отдельный счётчик `sessions_inline`. Контракт §15 и схема **не тронуты**.
- `.claude/agents/token-efficiency-auditor.md` — L2 Ingest и список исходов recorder отражают inline-сессию.
- `CLAUDE.md §15` — заметка «Inline-session scope (ADR-016)».
- Тесты `token-session-record.test.js` — 2 новых кейса (inline-session с активностью; пустой trigger-state → trivial-skip). 11/11 зелёные.

## Definition of Ready (Architecture Change)

- [x] **ADR** — ADR-016 «Уточнение (2026-05-25)»: scope аудитора подтверждён, §15 уточнён (без структурной правки).
- [ ] **Phase** — n/a (инфраструктура AI-слоя, вне M-карты)
- [x] **Dependency** — затронуты `tools/audit/token-session-record.js`, проза агента, `CLAUDE.md §15`. Хуки и схема **не менялись** (следствие направления B).
- [x] **AC** — см. ниже, все выполнены.

## Acceptance Criteria

1. [x] `/token-audit` на сессии без субагентов даёт **детерминированный понятный исход** — явный `inline-session` (вне token-attribution) вместо немого `trivial-skip`.
2. [x] Путь turn-level observations **не выбран** → схема не трогалась; `session-state.schema.json` без изменений (n/a).
3. [x] estimated-метрики не эмитятся для inline (только качественные сигналы) → инвариант ADR-016 соблюдён тривиально.
4. [x] Регрессия не ломает мульти-агентный путь: `recorded`/`trivial-skip`/`idempotent-skip` без изменений, 9 старых тестов зелёные.

## Вне scope

- Доступ к raw transcript / per-message токенам (недоступно хукам на текущем runtime).
- Изменение триггерной логики T-06..T-10 (работает корректно).

## Ссылки

- ADR-016 — `docs/decisions/ADR-016-token-efficiency-auditor.md`
- State Contract — `CLAUDE.md §15`
- Хуки — `.claude/runtime/{audit-turn-hook,audit-trigger-hook,post-agent-hook}.js`
- Схема — `docs/schemas/session-state.schema.json`
