# Task: дизайн enforcement'а рантайм-контрактов (State Update / Feedback-петля)

**ID:** TASK-2026-06-06-runtime-enforcement-design
**Task Type:** Architecture Change (правит State Contract §15 + рантайм-хуки)
**Routing:** `brainstorming` (skill, обязательно первым) → `ccip-architect` (lead, T4); co-agent при реализации — `ccip-backend-aux` (хуки)
**Status:** open · backlog — требуется brainstorming-сессия по выбору scope (пункт 1 ИЛИ 2)
**Raised:** 2026-06-06 (runtime-focused Red Team аудит, runtime integrity score 61/100)

---

## Проблема

Корневая слабость мультиагентной системы (по итогам runtime-аудита): **сильная статическая governance (`audit-suite` 19/19) при слабом рантайм-enforcement.** Поведенческие контракты описаны прозой в CLAUDE.md, но не принуждаются кодом. Нужно спроектировать (через brainstorming) enforcement для одной из двух самых дорогих недоработок.

## Пункт 1 — State Update контракт не enforced, деградация невидима

§15 объявляет блок `## State Update` обязательным, но его отсутствие проходит молча, без машинного сигнала.

**Доказательство (CONFIRMED по коду):**
- `.claude/runtime/post-agent-hook.js:180` — при отсутствии блока ставит `summary: "${agent} completed (no structured block)"`. Нет счётчика, флага, метрики.
- `.claude/runtime/execute-dag.js:264` — `outcome: 'success'` захардкожен, даже когда `extractUpdate(output) === null`. Отсутствие блока неотличимо от успеха в `observations[]`.
- `.claude/runtime/session-state.json` — уже содержит `ccip-architect` и `ccip-session-optimizer` с `"(no structured block)"`. Контракт нарушается в проде, без последствий.
- Ни один читатель `agent_outputs` в рантайме не реагирует на суффикс `"(no structured block)"` как на сигнал.

**Направление дизайна:** сделать пропуск/malformed-блок машинно-наблюдаемым (напр. `outcome: 'partial'` + поле `missing_state_update: true` в observation), не меняя «allowed»-семантику. `outcome`-enum схемы уже содержит `partial`.

## Пункт 2 — Feedback-петля голодает + правило без enforcement

CLAUDE.md §Feedback декларирует «IF agent fails ≥ 2 → switch to backup», но это конвенция без кода и без данных.

**Доказательство (CONFIRMED по коду):**
- `.claude/runtime/post-agent-hook.js:151` — `if (payload.tool_name !== 'Agent') return;`. Инлайн-сессии (Read/Edit/Bash без `Agent`-вызова) создают **ноль** observations.
- `.claude/runtime/flush-state.js:24` — `if (observations.length === 0) return;` — пустые observations → нет следа в feedback-loop.md.
- Grep по `.claude/runtime/*.js` на `fails`/`backup`/routing-решение — **ноль hits**. Правило «fails≥2→backup» нигде в рантайме не читается и не применяется.

**Направление дизайна (развилки для brainstorming):**
- (a) дать routing-feedback-петле реальные данные + code-путь, который их потребляет; либо
- (b) честно понизить правило в CLAUDE.md до «manual heuristic», если автоматизация не предполагается.
- Связь с resolved-задачей `token-audit-inline-session-gap.md`: там для **token-attribution** выбрали направление B (инлайн вне scope, хуки/схему не трогали). Здесь вопрос про **routing-quality** телеметрию — отдельный, решение B по токенам его не закрывает.

## Развилки уровня архитектуры (общие)

- Менять ли `session-state.schema.json` / §15 (затрагивает State Contract — высокий риск дрейфа, под `state-contract-section.js`).
- Не плодить ли второй источник истины (есть `trigger-state.json` от audit-хуков).
- Любая правка §15 требует bump и сверки `node tools/audit/state-contract-section.js`.

## Definition of Ready (Architecture Change)

- [ ] **Brainstorming** — выбран scope (пункт 1 ИЛИ 2), зафиксированы требования и не-цели.
- [ ] **ADR** — при изменении §15/схемы нужен ADR или уточнение существующего.
- [ ] **Phase** — n/a (инфраструктура AI-слоя, вне M-карты).
- [ ] **Dependency** — затрагиваемые файлы определены (хуки / схема / CLAUDE.md §15).
- [ ] **AC** — сформулировать после brainstorming.

## Acceptance Criteria

TBD — формулируются на выходе brainstorming.

## Вне scope

- Реализация без предварительного brainstorming + (при правке §15/схемы) ADR-решения.
- Прочие runtime-findings аудита (F-RT-01 tmp без PID, F-RT-03 double-write, F-RT-06/07 sanitizeHandoff обходы) — отдельные задачи, не смешивать.

## Ссылки

- Runtime Red Team аудит — сессия 2026-06-06 (runtime integrity 61/100, H-RT-1/H-RT-2 CONFIRMED)
- State Contract — `CLAUDE.md §15`
- Хуки — `.claude/runtime/{post-agent-hook,flush-state,execute-dag}.js`
- Схема — `docs/schemas/session-state.schema.json`
- Смежная resolved-задача — `docs/tasks/token-audit-inline-session-gap.md`
