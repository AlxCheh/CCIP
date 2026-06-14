# Wave 1 Implementation Plan — §XII Foundations

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать независимые основания Волны 1 (#5 token-attribution → #1 auto-remediation → #4 fail-closed → #3 persisted DAG), начиная с полностью детализированного #5.

**Architecture:** Все четыре — изолированные дополнения поверх существующих хуков (`.claude/runtime/`) и аудита (`tools/audit/`). #5 строит эвристическую оценку токенов tool-I/O поверх готового канала `events.jsonl`, не трогая hook-модель (sync, офлайн, fail-open). Каждый пункт — отдельный набор коммитов под TDD + live re-cert.

**Tech Stack:** Node.js (CommonJS), `node:test` + `node:assert/strict`, AJV 2020 (event.schema.json), канонический раннер `node tools/audit/run-tests.js`, `node tools/audit/audit-suite.js`.

**Базис:** roadmap `docs/plans/2026-06-12-capability-xii-roadmap.md`; capability-assessment `docs/audits/2026-06-12-capability-assessment.md` §XII; решение по источнику #5 — **A: bytes→tokens + non_ascii поправка** (офлайн-эвристика, метка [ЧАСТ.]).

**Процессные инварианты (каждая задача):** TDD с serial-guard · commit-per-механизм · после пункта — канонический раннер (≥362) + audit-suite (≥22) зелёные · ADR-immutability (новые решения — новым ADR, не правкой accepted) · честная метка без overclaim.

---

## Файловая карта #5

| Файл | Действие | Ответственность |
|---|---|---|
| `tools/audit/_lib/token-estimate.js` | Create | Чистая функция оценки токенов из bytes + non_ascii_ratio |
| `tools/audit/__tests__/token-estimate.test.js` | Create | Unit-тесты чистой функции |
| `.claude/runtime/tool-telemetry.js` | Modify | `buildEvent` добавляет `non_ascii_ratio` + `est_tokens` на event-time |
| `docs/schemas/event.schema.json` | Modify | Новые поля (схема `additionalProperties:false` — обязательно) |
| `tools/audit/__tests__/tool-telemetry.test.js` | Modify | Проверка новых полей + schema-валидация |
| `.claude/runtime/aggregate-telemetry.js` | Modify | Сумма `est_tokens` за сессию → в §5 metrics-строку |
| `tools/audit/__tests__/aggregate-telemetry.test.js` | Modify | Проверка `est_tokens=` в строке, фильтр по сессии |
| `docs/decisions/ADR-020-main-agent-token-estimate.md` | Create | Решение: эвристическая частичная атрибуция (ADR-016 closure) |
| `docs/audits/2026-06-12-capability-assessment.md` | Modify | Промоут строк token-blindness → [ЧАСТ.] + журнал |

---

## Task 5.1: Чистый эстиматор токенов

**Files:**
- Create: `tools/audit/_lib/token-estimate.js`
- Test: `tools/audit/__tests__/token-estimate.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tools/audit/__tests__/token-estimate.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { nonAsciiRatio, estimateTokens } = require('../_lib/token-estimate');

test('nonAsciiRatio: 0 for pure ASCII, ~1 for pure Cyrillic, half for mix', () => {
  assert.strictEqual(nonAsciiRatio('hello world'), 0);
  assert.strictEqual(nonAsciiRatio(''), 0);
  assert.strictEqual(nonAsciiRatio('абвг'), 1);
  assert.strictEqual(nonAsciiRatio('ab вг'), 0.4); // 2 non-ascii of 5 chars
});

test('estimateTokens: ASCII uses K_ASCII=4, zero bytes → 0', () => {
  assert.strictEqual(estimateTokens(0, 0), 0);
  assert.strictEqual(estimateTokens(4000, 0), 1000); // 4000 / 4
});

test('estimateTokens: Cyrillic packs more tokens per byte (smaller divisor)', () => {
  // r=1 → K_CYR=3 → 3000/3 = 1000; ASCII same bytes → 3000/4 = 750
  assert.strictEqual(estimateTokens(3000, 1), 1000);
  assert.ok(estimateTokens(3000, 1) > estimateTokens(3000, 0),
    'Cyrillic estimate must exceed ASCII for identical byte volume');
});

test('estimateTokens: ratio clamped to [0,1]; opts override divisors', () => {
  assert.strictEqual(estimateTokens(1000, 5), estimateTokens(1000, 1)); // clamp high
  assert.strictEqual(estimateTokens(1000, -3), estimateTokens(1000, 0)); // clamp low
  assert.strictEqual(estimateTokens(1000, 0, { kAscii: 2 }), 500);       // override
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/audit/__tests__/token-estimate.test.js`
Expected: FAIL — `Cannot find module '../_lib/token-estimate'`.

- [ ] **Step 3: Write minimal implementation**

```js
// tools/audit/_lib/token-estimate.js
'use strict';
/**
 * token-estimate.js — эвристическая оценка токенов из объёма tool-I/O.
 *
 * ADR-016 / ADR-020: raw transcript и reasoning-токены главного агента хукам
 * НЕДОСТУПНЫ. Это ЧАСТИЧНАЯ атрибуция объёма РЕЗУЛЬТАТОВ инструментов (что Read/
 * Bash/Grep вернули в контекст), не точный биллинг и не полные токены сессии.
 *
 * Модель: tokens ≈ bytes / K(r), r = доля не-ASCII символов. Кириллица токен-дороже
 * (меньше байт на токен) → меньший делитель → больше токенов. Калибровка через env
 * CCIP_TOK_K_ASCII / CCIP_TOK_K_CYR или per-call opts.
 */
const K_ASCII = Number(process.env.CCIP_TOK_K_ASCII || 4);
const K_CYR   = Number(process.env.CCIP_TOK_K_CYR   || 3);

/** Доля символов с codepoint > 127 (грубый сигнал кириллицы/мультибайта). */
function nonAsciiRatio(text) {
  if (!text) return 0;
  let nonAscii = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) > 127) nonAscii++;
  return text.length ? Number((nonAscii / text.length).toFixed(3)) : 0;
}

/** bytes + non-ASCII ratio → оценка токенов (целое, ≥0). */
function estimateTokens(bytes, ratio, opts = {}) {
  const b  = Math.max(0, Number(bytes) || 0);
  const r  = Math.max(0, Math.min(1, Number(ratio) || 0));
  const kA = opts.kAscii != null ? Number(opts.kAscii) : K_ASCII;
  const kC = opts.kCyr   != null ? Number(opts.kCyr)   : K_CYR;
  const k  = kA - (kA - kC) * r; // r=0 → kA, r=1 → kC
  return Math.round(b / k);
}

module.exports = { nonAsciiRatio, estimateTokens };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/audit/__tests__/token-estimate.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/audit/_lib/token-estimate.js tools/audit/__tests__/token-estimate.test.js
git commit -m "feat(token): heuristic bytes->tokens estimator with Cyrillic correction (#5)"
```

---

## Task 5.2: Подключить эстиматор в tool-telemetry + схема событий

**Files:**
- Modify: `docs/schemas/event.schema.json`
- Modify: `.claude/runtime/tool-telemetry.js` (`buildEvent`, ~lines 29-40)
- Test: `tools/audit/__tests__/tool-telemetry.test.js`

- [ ] **Step 1: Write the failing test** (append to `tool-telemetry.test.js`)

```js
test('buildEvent includes non_ascii_ratio and est_tokens', () => {
  const ev = buildEvent({ tool_name: 'Read', tool_input: { file_path: 'a.md' },
    tool_response: { content: 'абвгд' } }, 'sess-1');
  assert.ok('non_ascii_ratio' in ev, 'event missing non_ascii_ratio');
  assert.ok('est_tokens' in ev, 'event missing est_tokens');
  assert.ok(ev.non_ascii_ratio > 0, 'Cyrillic content must yield non-zero ratio');
  assert.ok(Number.isInteger(ev.est_tokens) && ev.est_tokens >= 0);
});

test('event schema validates an event carrying est_tokens + non_ascii_ratio', () => {
  const Ajv2020 = require('ajv/dist/2020');
  const addFormats = require('ajv-formats');
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const schema = JSON.parse(fs.readFileSync(
    path.join(root, 'docs/schemas/event.schema.json'), 'utf-8'));
  const validate = ajv.compile(schema);
  const ev = buildEvent({ tool_name: 'Read', tool_input: { file_path: 'a.md' },
    tool_response: { content: 'абвгд' } }, 'sess-1');
  assert.equal(validate(ev), true, JSON.stringify(validate.errors));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/audit/__tests__/tool-telemetry.test.js`
Expected: FAIL — `event missing non_ascii_ratio` (and schema rejects extra prop once added by impl before schema update).

- [ ] **Step 3a: Add fields to `event.schema.json`** (insert after the `full_read` property, before `outcome`)

```json
    "full_read": { "type": "boolean" },
    "non_ascii_ratio": { "type": "number", "minimum": 0, "maximum": 1 },
    "est_tokens":      { "type": "integer", "minimum": 0 },
    "outcome":   { "type": "string", "enum": ["ok", "error"] }
```

- [ ] **Step 3b: Wire estimator into `tool-telemetry.js`**

Add the require directly after `'use strict';` (top-level, pure module — no side effects):

```js
const { nonAsciiRatio, estimateTokens } = require('../../tools/audit/_lib/token-estimate');
```

Replace `buildEvent` body (currently lines ~29-40) with:

```js
function buildEvent(p, session) {
  const text = JSON.stringify((p && p.tool_response) || '');
  const bytes = Buffer.byteLength(text, 'utf-8');
  const ratio = nonAsciiRatio(text);
  return {
    ts:        new Date().toISOString(),
    session:   session || '',
    tool:      (p && p.tool_name) || '',
    target:    extractTarget(p),
    bytes,                                  // proxy for volume, not tokens
    non_ascii_ratio: ratio,                 // event-time Cyrillic signal (#5)
    est_tokens: estimateTokens(bytes, ratio), // heuristic tool-I/O tokens (ADR-020)
    full_read: isFullRead(p),
    outcome:   p && p.tool_response && p.tool_response.is_error ? 'error' : 'ok',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/audit/__tests__/tool-telemetry.test.js`
Expected: PASS (all prior tests + 2 new).

- [ ] **Step 5: Commit**

```bash
git add docs/schemas/event.schema.json .claude/runtime/tool-telemetry.js tools/audit/__tests__/tool-telemetry.test.js
git commit -m "feat(token): emit non_ascii_ratio + est_tokens per tool event (#5)"
```

---

## Task 5.3: Поверхность session-level est_tokens в aggregate-telemetry

**Files:**
- Modify: `.claude/runtime/aggregate-telemetry.js` (~lines 37-44)
- Test: `tools/audit/__tests__/aggregate-telemetry.test.js`

- [ ] **Step 1: Write the failing test** (append to `aggregate-telemetry.test.js`)

```js
test('aggregate sums est_tokens for THIS session into the §5 line', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccip-agg-tok-'));
  const feedback = path.join(tmp, 'feedback-loop.md');
  const events = path.join(tmp, 'events.jsonl');
  const sf = mkState([obs('ccip-architect', false)]);
  // two THIS-session events (est_tokens 100 + 250) + one other-session (ignored)
  fs.writeFileSync(events, [
    ev({ tool: 'Read', est_tokens: 100 }),
    ev({ tool: 'Bash', target: 'ls', est_tokens: 250 }),
    ev({ session: 'other-session', tool: 'Read', est_tokens: 9999 }),
  ].join('\n') + '\n', 'utf-8');
  try {
    runHook(sf, events, feedback);
    const md = fs.readFileSync(feedback, 'utf-8');
    assert.match(md, /est_tokens=350\b/, 'only this session est_tokens summed (100+250)');
  } finally {
    fs.rmSync(sf, { force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/audit/__tests__/aggregate-telemetry.test.js`
Expected: FAIL — no `est_tokens=` substring in the §5 line.

- [ ] **Step 3: Modify `aggregate-telemetry.js`**

After `const fullReads = events.filter(...)` (~line 38) add:

```js
  const estTokens = events.reduce((s, e) => s + (Number(e.est_tokens) || 0), 0);
```

Update the metrics line (~lines 43-44) to:

```js
  const line = `> 📊 ${sessionId.slice(0, 10)}: tool_calls=${toolCalls} full_reads=${fullReads}`
    + ` est_tokens=${estTokens} agents=${agents} SSC=${ssc} inline=${inline}`;
```

(Leave `idemKey` unchanged — `toolCalls` already distinguishes reruns; idempotency tests stay green.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tools/audit/__tests__/aggregate-telemetry.test.js`
Expected: PASS (4 prior + 1 new).

Then full canonical runner + audit-suite:

Run: `node tools/audit/run-tests.js && node tools/audit/audit-suite.js`
Expected: canonical ≥362 PASS, audit-suite ≥22 PASS.

- [ ] **Step 5: Commit**

```bash
git add .claude/runtime/aggregate-telemetry.js tools/audit/__tests__/aggregate-telemetry.test.js
git commit -m "feat(token): surface per-session est_tokens in feedback §5 metrics (#5)"
```

---

## Task 5.4: ADR-020 + честный промоут метки

**Files:**
- Create: `docs/decisions/ADR-020-main-agent-token-estimate.md`
- Modify: `docs/decisions/index.md` (реестр ADR)
- Modify: `docs/audits/2026-06-12-capability-assessment.md`
- Modify: `docs/plans/2026-06-12-capability-xii-roadmap.md` (журнал/Wave 1 exit)

- [ ] **Step 1: Create ADR-020**

Скопировать frontmatter-формат из существующего ADR (`limit:30` чтение ADR-019), статус `Принято`, `impl_anchors` → `tools/audit/_lib/token-estimate.js`, `.claude/runtime/tool-telemetry.js`. Тело фиксирует:
- **Решение:** эвристическая оценка токенов tool-I/O (`bytes / K(non_ascii_ratio)`), вычисляется на event-time, аккумулируется per-session в §5.
- **Контекст:** §XII.5 допускает «даже грубый, per-tool»; ADR-016 оставляет raw transcript недоступным.
- **Граница (честно):** оценивается ТОЛЬКО объём результатов инструментов; reasoning/output-токены главного агента по-прежнему невидимы → метка **[ЧАСТ.]**, не [ПОДТВ.]. Калибровка K — env-tunable, не верифицирована против реального токенайзера Claude (путь к уточнению — Волна 4 / отдельный механизм).
- **Связь:** дополняет ADR-016 (не отменяет; ADR-016 не редактируется — immutability).

- [ ] **Step 2: Register in `docs/decisions/index.md`**

Добавить строку ADR-020 в реестр (формат — как у соседних строк; `limit:50` чтение index).

- [ ] **Step 3: Promote capability-assessment rows (только с доказательством)**

Точечные правки (НЕ перевыпуск документа):
- §I таблица, строка `main-agent token-blindness, ADR-016 [ПОДТВ. как слепое пятно]` → отметить частичное закрытие: per-tool tool-I/O оценка есть [ЧАСТ.], reasoning-слепота остаётся.
- §VII «Not Ready: … main-agent token-attribution» → перенести в «Partially Ready» как `tool-I/O token estimate (heuristic, ADR-020)`.
- §XI(c) token-blindness — уточнить, что искажение снижено для tool-I/O, сохраняется для reasoning.
- §XII.5 — пометить реализованным (ADR-020).
- Журнал документа — новая строка с базисом (ADR-020, тесты).

- [ ] **Step 4: Verify docs audit green**

Run: `node tools/audit/audit-suite.js`
Expected: PASS — в т.ч. `adr-anchors`, `adr-immutability` (ADR-016 не тронут), `dead-refs`, `section-anchors`, `changelog-presence`.

- [ ] **Step 5: Commit**

```bash
git add docs/decisions/ADR-020-main-agent-token-estimate.md docs/decisions/index.md docs/audits/2026-06-12-capability-assessment.md docs/plans/2026-06-12-capability-xii-roadmap.md
git commit -m "docs(token): ADR-020 + honest [ЧАСТ.] promotion of token-attribution (#5)"
```

---

## #5 Exit-критерий (gate перед #1)

- [ ] `node tools/audit/run-tests.js` — ≥362 PASS (новые token-estimate тесты включены).
- [ ] `node tools/audit/audit-suite.js` — ≥22 PASS.
- [ ] `events.jsonl` новой сессии содержит `est_tokens` + `non_ascii_ratio` на каждое событие; §5-строка в `feedback-loop.md` содержит `est_tokens=`.
- [ ] ADR-020 принят; capability-assessment строки промоутнуты с доказательством; ADR-016 не редактирован.

---

## #1 / #4 / #3 — scope + развилки к разрешению ПЕРЕД детализацией

> Те же правила, что и для #5: каждый пункт детализируется в bite-sized шаги только ПОСЛЕ разрешения его design-развилки (design-question-first). Ниже — границы и открытые вопросы, не готовые шаги (no-placeholder-code).

### #1 Auto-remediation семантического дрейфа
**Scope:** добавить `--fix` к детерминированным классам поверх существующих detect-only аудиторов (`tools/audit/dead-refs`, `section-anchors`, `phantom-section-refs`, `path-canonical`). `audit-suite.js --fix` уже существует (`audit-suite:fix`) — проверить, что именно он сейчас чинит.
**Развилки:**
- Какой класс авто-фиксим первым — anchor-restore или dead-ref? (anchor безопаснее: детерминированная цель; dead-ref может требовать выбора цели.)
- Авто-fix в pre-commit (блокирует) или только в CI/manual (advisory)? Влияет на риск ложной правки.
- Где граница «детерминированный» (чиним) vs «требует решения» (только флаг)?

### #4 Fail-closed flag для state-lock
**Scope:** под env-флагом (напр. `CCIP_STATE_LOCK_FAILCLOSED=1`) при таймауте `withStateLock` НЕ выполнять fn без лока, а бросать/сигналить отказ (high-assurance). Дефолт остаётся fail-open (наблюдаемый).
**Развилки:**
- Семантика fail-closed: throw (роняет hook → fail-open хука?) vs пропуск записи + durable alert? Надо сохранить «governance не ломает сессию».
- Нужен ли ADR (новое поведение лока) — вероятно да (ADR-021).
- Кто из writer'ов вправе включать fail-closed (все хуки или избранные критические)?

### #3 Persisted DAG-журнал между сессиями
**Scope:** журнал шагов `execute-dag.js` переживает рестарт сессии; resume читает журнал.
**Развилки:**
- Формат журнала: отдельный append-only NDJSON vs расширение session-state? (NDJSON ближе к events.jsonl-паттерну.)
- Идентификация прогона между сессиями (run_id) и политика TTL/очистки.
- Граница: resume только незавершённых vs полная история; взаимодействие с circuit-breaker.

---

## Журнал

| Дата | Изменение | Базис |
|---|---|---|
| 2026-06-12 | Первая версия. #5 детализирован полностью (источник A: bytes→tokens + non_ascii). #1/#4/#3 — scope + развилки. | roadmap §3; сверка кода tool-telemetry/aggregate-telemetry/event.schema на HEAD b9dcb27 |
