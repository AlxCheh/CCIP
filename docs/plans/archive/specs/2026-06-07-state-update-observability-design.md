# State Update Observability — Design Spec

**Date:** 2026-06-07
**Status:** Approved (brainstorming)
**Scope:** Пункт 1 из `docs/tasks/runtime-enforcement-design-gap.md` — видимость пропуска `## State Update`. Пункт 2 (enforcement Feedback-петли) — вне scope, отдельный цикл.
**Closes findings:** F-RT-02, F-RT-04 (runtime-аудит 2026-06-06).

---

## Проблема

Контракт §15 объявляет блок `## State Update` обязательным, но его отсутствие/битость проходит молча:
- `post-agent-hook.js:180` — fallback summary `"${agent} completed (no structured block)"`, без машинного сигнала.
- `execute-dag.js:264` — `outcome:'success'` захардкожен даже при `extractUpdate()===null`.
- Подтверждение в проде: `session-state.json` уже содержит `ccip-architect` и `ccip-session-optimizer` с `"(no structured block)"`.

Деградация невидима: ни один читатель не реагирует, ни один сигнал не всплывает.

## Цель

Сделать пропуск блока **машинно-наблюдаемым и заметным человеку**, СОХРАНИВ «allowed»-семантику (не блокируем, не ретраим, не корректируем).

## Принятые решения (brainstorming)

| # | Решение | Обоснование |
|---|---------|-------------|
| Сила реакции | **Запись + сигнал** (не passive, не correction) | Наблюдаемость, которую реально замечают, без рисков авто-ретрая |
| Представление | **Отдельное поле `missing_state_update:boolean`**, `outcome` ортогонален | `outcome`=результат задачи, флаг=соблюдение контракта; не конфлатить |
| outcome при пропуске | **остаётся `success`** + флаг | Агент мог сделать работу идеально, но забыть блок. `partial` создал бы ложный сигнал «не справляется» → ошибочный рероут на general-purpose |
| Канал сигнала | **stderr (по-событийно) + человекочитаемая сводка на Stop** | stderr — существующий паттерн хуков; сводка видна в отрендеренном MD и называет провинившихся агентов |
| Документирование | **новый ADR-017** | On-topic (State Contract observability); ADR-016 (token-auditor) — чужая тема + «Принято» (rev-bump). DoR требует ADR для §15/schema |

## Модель данных

`docs/schemas/session-state.schema.json` — в `observations[].items.properties` добавить **опциональное**:
```json
"missing_state_update": { "type": "boolean" }
```
Не входит в `required[]`. Обратная совместимость: старые observations без поля валидны; читатели/сводка трактуют отсутствие как `false`.

## Компоненты и поток данных

Оба писателя state выставляют флаг единообразно (урок H-RT-4 — кросс-писательская согласованность).

### `post-agent-hook.js` (PostToolUse[Agent])
После `const parsed = extractStructured(text);`:
```js
const missingBlock = parsed === null;
if (missingBlock) {
  process.stderr.write(`[post-agent-hook] ⚠ ${agent}: no valid ## State Update block\n`);
}
```
В push observation добавить поле `missing_state_update: missingBlock`. `outcome` и summary-fallback не меняются.

### `execute-dag.js` `applyStepResult` (строки 250-270)
`const upd = extractUpdate(output);` уже есть. В push observation добавить `missing_state_update: upd === null`. `outcome` остаётся `'success'`. При `upd === null` — stderr:
```js
if (upd === null) {
  console.error(`[execute-dag] ⚠ ${step.agent}: no valid ## State Update block`);
}
```
Для тестируемости — экспортировать `applyStepResult` (как уже сделано с `writeState` и др.).

### `flush-state.js` (Stop)
Уже итерирует observations для `lines`. Добавить подсчёт:
```js
const missing = observations.filter(o => o.missing_state_update === true);
```
Если `missing.length > 0` — после `...lines` в `block` добавить человекочитаемую строку и stderr:
```
> ⚠ ${sessionId.slice(0,10)}: ${missing.length}/${observations.length} agents без ## State Update (${missing.map(o=>o.agent).join(', ')})
```
Считаются только явные `true` (backward compat). Строка идёт внутри того же idempotent-блока (F-RT-03), поэтому не дублируется при повторном flush.

## Влияние на контракт §15

`CLAUDE.md §15` — строку:
> `Missing block -> post-agent-hook.js sets a fallback summary (allowed, lowers routing quality).`

дополнить (семантика «allowed» сохраняется):
> `Missing block -> fallback summary + observation flagged missing_state_update:true (allowed, lowers routing quality); surfaced via stderr and a Stop-time rollup in feedback-loop.md §4. See ADR-017.`

После правки — обязательный прогон `node tools/audit/state-contract-section.js` (секция цела) + `node tools/audit/session-state.js` (runtime↔schema).

## ADR-017

`docs/decisions/ADR-017-state-update-observability.md` (~30 строк): status «Принято», context (молчаливая деградация контракта), decision (флаг + сводка, observability без enforcement; outcome ортогонален), consequences (наблюдаемость; не блокирует; задел под пункт 2). `impl_anchors`: три хука + схема.

## Граничные случаи

- «Нет блока» и «битый JSON» → оба дают `parsed/upd === null` → `true` (обе — нарушения; флаг = «нет валидного блока»).
- Обратная совместимость: сводка и читатели считают только явные `true`.
- `outcome`-detection в post-agent-hook (строки 171-175) не затрагивается.
- Idempotent-flush (F-RT-03): rollup-строка внутри batch-блока → не дублируется.

## Тестирование (поведенческое, §17)

1. `post-agent-hook`: payload без блока → `observations[0].missing_state_update === true` + stderr непустой; с валидным блоком → `false`.
2. `execute-dag`: `applyStepResult(state, step, outputBezBloka)` → флаг `true`, `outcome === 'success'`; с блоком → `false`.
3. `flush-state`: смесь помеченных/чистых observations → в feedback-loop.md есть строка `N/M agents без ## State Update` с именами; при чистой сессии строки нет.
4. `schema`: валидна с полем и без него (backward compat) — через `session-state.js`.
5. Регрессия: `audit-suite` 19/19 + `state-contract-section.js` OK после правки §15.

## Файлы

| Файл | Изменение |
|------|-----------|
| `docs/schemas/session-state.schema.json` | + опц. поле `missing_state_update` |
| `.claude/runtime/post-agent-hook.js` | флаг + stderr |
| `.claude/runtime/execute-dag.js` | флаг в applyStepResult + stderr + export |
| `.claude/runtime/flush-state.js` | подсчёт + rollup-строка + stderr |
| `CLAUDE.md` §15 | дополнить строку про missing block |
| `docs/decisions/ADR-017-state-update-observability.md` | новый ADR |
| `docs/decisions/index.md` | + строка ADR-017 |
| `tools/audit/__tests__/*` | новые поведенческие тесты (3-4 файла/кейса) |

## Вне scope

- Пункт 2 (enforcement Feedback-петли, consume observations для routing) — отдельный цикл.
- Любая коррекция/ретрай/блокировка при пропуске блока.
- Телеметрия инлайн-сессий (resolved: `token-audit-inline-session-gap.md`).
