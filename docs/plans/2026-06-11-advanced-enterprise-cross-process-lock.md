# Advanced Enterprise (82→~88) — Cross-Process State Lock + Honest Contract Promotion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть HA-2 (single-process `writeLock`) и E-2 residual race межпроцессным локом вокруг всех мутаций `session-state.json`, затем честно повысить ровно один зрелый signal-инвариант (`INV-STATE-CONTRACT`) до `enforced`, предварительно сведя его FPR к нулю через exemption-registry релейных агентов.

**Architecture:** Сейчас `session-state.json` мутируют 8 hook-скриптов, каждый со своим приватным `tmp+fsync+rename` и HA-3 «re-read before write». Атомарен каждый write по отдельности, но read-modify-write **не атомарен между процессами** → lost-update (E-2 residual). Вводим один общий `state-lock.js` (blocking cross-process lock по модели проверенного `_lib/serial-guard.js`) + `state-io.js` (`readStateRaw`/`writeStateAtomic`/`updateStateLocked`), на который переводим все 8 writer'ов. Лок fail-open наблюдаемо (`state_lock_failed_open` → governance-reactor), в духе E-6. Затем шаг 2: exemption-registry выводит relay-агентов (`ccip-session-optimizer` и пр.) из-под `INV-STATE-CONTRACT` (FPR→0), после чего инвариант повышается `signal→enforced`.

**Tech Stack:** Node.js (CommonJS, no deps), `node:test` + `node:assert`, канонический раннер `tools/audit/run-tests.js` (`concurrency:false`, M-1), audit-suite `tools/audit/audit-suite.js`.

**Scope guard:** `aggregate-telemetry.js` только читает state (не writer). `audit-turn-hook.js`/`audit-trigger-hook.js` пишут TSTATE (turn-state, другой файл) — вне скоупа. Не трогать `RobloxPlayerInstaller.exe`, `Microsoft.Services.Store.winmd` в корне.

---

## File Structure

**Создаём:**
- `.claude/runtime/state-lock.js` — blocking cross-process lock (`withStateLock`), PID+TTL stale-reclaim, наблюдаемый fail-open. Одна ответственность: взаимное исключение.
- `.claude/runtime/state-io.js` — `readStateRaw` (+`.bak` recovery, паритет с post-agent-hook), `writeStateAtomic` (`tmp+fsync+rename`+`.bak`), `updateStateLocked(stateFile, mutator)`. Одна ответственность: атомарный read-modify-write под локом.
- `.claude/runtime/contract-exempt.js` — реестр агентов, освобождённых от `INV-STATE-CONTRACT` (`isContractExempt(agent)`). Одна ответственность: политика исключений контракта.
- `tools/audit/__tests__/state-lock.test.js` — unit-тесты лока (free/held/stale/TTL/timeout).
- `tools/audit/__tests__/state-io-concurrency.test.js` — N-way lost-update регрессия (все мутации выживают).
- `tools/audit/__tests__/contract-exempt.test.js` — exemption-политика.
- `docs/decisions/ADR-019-cross-process-state-lock.md` — решение: cross-process lock + честная градация контракта.

**Модифицируем (8 writer'ов → `updateStateLocked`):**
- `.claude/runtime/post-agent-hook.js` (`writeState` → lock; + применяет exemption на шаге 2)
- `.claude/runtime/flush-state.js` (inline write + `writeStateSafe`)
- `.claude/runtime/execute-dag.js` (in-process `writeLock` → cross-process)
- `.claude/runtime/pre-agent-gate.js` (`alertAppend`, `recordInflight`)
- `.claude/runtime/gate-fail-open.js` (`recordGateFailOpen`)
- `.claude/runtime/governance-reactor.js` (mark-surfaced; + новый DIRECTIVE для lock-fail-open)
- `.claude/runtime/failure-detectors.js` (append alerts)
- `.claude/runtime/audit-session-reset.js` (SSTATE write)
- `tools/audit/__tests__/hook-concurrency.test.js` (усилить: считать выжившие observations)
- `.claude/runtime/governance-manifest.json` (статус `INV-STATE-CONTRACT`: `observed`→`enforced`)
- `tools/audit/__tests__/governance-manifest.test.js` (ожидаемый статус)
- `CLAUDE.md` §18 (строка про writeLock single-process)
- `.claude/runtime/state-protocol.md` (упоминание лока в lifecycle)

---

## Task 1: state-lock.js — blocking cross-process lock

**Files:**
- Create: `.claude/runtime/state-lock.js`
- Test: `tools/audit/__tests__/state-lock.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tools/audit/__tests__/state-lock.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { gitRoot } = require('../_lib/git-root');

const { withStateLock } = require(path.join(gitRoot(), '.claude/runtime/state-lock.js'));
const tmpState = (s) => path.join(os.tmpdir(), `ccip-state-lock-test-${process.pid}-${s}`);

test('runs fn and releases lock (no .lock residue)', () => {
  const f = tmpState('free');
  const lock = f + '.lock';
  try { fs.unlinkSync(lock); } catch {}
  const r = withStateLock(f, () => 42);
  assert.strictEqual(r, 42);
  assert.ok(!fs.existsSync(lock), 'lock removed after fn');
});

test('reclaims a stale lock from a dead pid', () => {
  const f = tmpState('stale');
  const lock = f + '.lock';
  const dead = cp.spawnSync(process.execPath, ['-e', '0']); // already exited
  fs.writeFileSync(lock, JSON.stringify({ pid: dead.pid, at: Date.now() }));
  const r = withStateLock(f, () => 'ok');
  assert.strictEqual(r, 'ok');
  assert.ok(!fs.existsSync(lock));
});

test('reclaims a lock older than TTL even if pid alive', () => {
  const f = tmpState('ttl');
  const lock = f + '.lock';
  const old = Date.now() - 10 * 60 * 1000; // 10 min ago, well past default TTL
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, at: old }));
  const r = withStateLock(f, () => 'reclaimed');
  assert.strictEqual(r, 'reclaimed');
  try { fs.unlinkSync(lock); } catch {}
});

test('releases lock even if fn throws', () => {
  const f = tmpState('throw');
  const lock = f + '.lock';
  try { fs.unlinkSync(lock); } catch {}
  assert.throws(() => withStateLock(f, () => { throw new Error('boom'); }), /boom/);
  assert.ok(!fs.existsSync(lock), 'lock released on throw');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/audit/__tests__/state-lock.test.js`
Expected: FAIL — `Cannot find module '.../state-lock.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// .claude/runtime/state-lock.js
'use strict';
/**
 * state-lock.js — blocking cross-process advisory lock вокруг мутаций session-state.json.
 *
 * Модель взята из проверенного tools/audit/_lib/serial-guard.js (атомарный fs.openSync 'wx'
 * + PID-stale-reclaim), но вместо throw-on-held делает BLOCKING acquire с backoff — потому
 * что hook-writer'ы должны дождаться своей очереди, а не падать. Закрывает HA-2 / E-2:
 * read-modify-write становится атомарным МЕЖДУ процессами, не только внутри одного.
 *
 * Stale-safety двойная: (1) PID мёртв → лок переиспользуется; (2) лок старше TTL → тоже
 * (защита от зависшего живого процесса). При таймауте acquire — наблюдаемый fail-open:
 * fn выполняется БЕЗ лока (write не теряется), а вызывающий помечает state_lock_failed_open.
 */
const fs = require('fs');

const LOCK_TTL_MS     = parseInt(process.env.CCIP_STATE_LOCK_TTL_MS     || '5000', 10);
const ACQUIRE_TIMEOUT = parseInt(process.env.CCIP_STATE_LOCK_TIMEOUT_MS || '4000', 10);
const RETRY_MS        = 25;

function pidAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code === 'EPERM'; }
}

/** Synchronous sleep without deps (hooks are short-lived sync scripts). */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Захватывает лок на `${stateFile}.lock`, выполняет fn(), освобождает лок.
 * @param {string} stateFile  путь к state-файлу (лок = stateFile + '.lock')
 * @param {Function} fn  синхронная критическая секция; её результат возвращается
 * @param {object} [opts]  { onFailOpen?: (reason)=>void } вызывается, если лок не взят
 * @returns результат fn()
 */
function withStateLock(stateFile, fn, opts = {}) {
  const lockFile = stateFile + '.lock';
  const deadline = Date.now() + ACQUIRE_TIMEOUT;
  let acquired = false;

  while (!acquired) {
    try {
      const fd = fs.openSync(lockFile, 'wx');           // атомарный эксклюзивный create
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }));
      fs.closeSync(fd);
      acquired = true;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let holder = {};
      try { holder = JSON.parse(fs.readFileSync(lockFile, 'utf-8')); } catch {}
      const stale = !pidAlive(holder.pid) || (Date.now() - (holder.at || 0) > LOCK_TTL_MS);
      if (stale) { try { fs.unlinkSync(lockFile); } catch {} continue; }
      if (Date.now() > deadline) {
        // Наблюдаемый fail-open: НЕ дедлочим writer'а — выполняем без лока, сигналим.
        if (typeof opts.onFailOpen === 'function') {
          try { opts.onFailOpen(`acquire timeout (holder pid ${holder.pid})`); } catch {}
        }
        return fn();
      }
      sleepSync(RETRY_MS);
    }
  }

  try { return fn(); }
  finally { try { fs.unlinkSync(lockFile); } catch {} }
}

module.exports = { withStateLock };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/audit/__tests__/state-lock.test.js`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add .claude/runtime/state-lock.js tools/audit/__tests__/state-lock.test.js
git commit -m "feat(state): blocking cross-process state lock (HA-2 foundation)"
```

---

## Task 2: state-io.js — atomic read-modify-write under lock

**Files:**
- Create: `.claude/runtime/state-io.js`
- Test: расширяется в Task 3 (concurrency); здесь — unit на recovery-паритет.
- Reference: `.claude/runtime/post-agent-hook.js:28-83` (текущая `readState`/`writeState` логика с `.bak` — копируем её семантику дословно).

- [ ] **Step 1: Write the failing test**

```js
// tools/audit/__tests__/state-io-concurrency.test.js  (часть 1 — recovery parity)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { gitRoot } = require('../_lib/git-root');

const { readStateRaw, writeStateAtomic, updateStateLocked } =
  require(path.join(gitRoot(), '.claude/runtime/state-io.js'));

const tmpState = (s) => path.join(os.tmpdir(), `ccip-state-io-test-${process.pid}-${s}.json`);

test('writeStateAtomic round-trips and leaves no .tmp', () => {
  const f = tmpState('rt');
  writeStateAtomic({ session_id: 'x', observations: [] }, f);
  assert.deepEqual(readStateRaw(f).session_id, 'x');
  const residue = fs.readdirSync(path.dirname(f)).filter(n => n.startsWith(path.basename(f)) && n.includes('.tmp'));
  assert.deepEqual(residue, []);
  fs.unlinkSync(f); try { fs.unlinkSync(f + '.bak'); } catch {}
});

test('readStateRaw recovers from .bak when main is corrupt (R-1 parity)', () => {
  const f = tmpState('bak');
  fs.writeFileSync(f + '.bak', JSON.stringify({ session_id: 'from-bak', governance_alerts: [] }));
  fs.writeFileSync(f, '{ this is : not json');
  const s = readStateRaw(f);
  assert.strictEqual(s.session_id, 'from-bak');
  assert.ok(s.governance_alerts.some(a => a.kind === 'state_recovered_from_backup'),
    'recovery must leave a visible governance_alert (R-1)');
  fs.unlinkSync(f); fs.unlinkSync(f + '.bak');
});

test('updateStateLocked applies mutator and persists', () => {
  const f = tmpState('upd');
  writeStateAtomic({ session_id: 's', observations: [] }, f);
  updateStateLocked(f, (st) => { st.observations.push({ n: 1 }); });
  assert.strictEqual(readStateRaw(f).observations.length, 1);
  fs.unlinkSync(f); try { fs.unlinkSync(f + '.bak'); } catch {}
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/audit/__tests__/state-io-concurrency.test.js`
Expected: FAIL — `Cannot find module '.../state-io.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// .claude/runtime/state-io.js
'use strict';
/**
 * state-io.js — единый атомарный read-modify-write для session-state.json под cross-process
 * локом (state-lock.js). Семантика readState/.bak-recovery скопирована дословно из
 * post-agent-hook.js (R-1: видимое восстановление) — теперь это единственный путь записи.
 */
const fs = require('fs');
const path = require('path');
const { withStateLock } = require('./state-lock');

const ROOT = path.resolve(__dirname, '../..');
const DEFAULT_STATE = process.env.CCIP_STATE_FILE
  || path.join(ROOT, '.claude/runtime/session-state.json');

/** Read state, recovering visibly from .bak on corruption (R-1 parity with post-agent-hook). */
function readStateRaw(stateFile = DEFAULT_STATE) {
  const BAK = stateFile + '.bak';
  if (fs.existsSync(stateFile)) {
    try { return JSON.parse(fs.readFileSync(stateFile, 'utf-8')); }
    catch {
      if (fs.existsSync(BAK)) {
        try {
          const recovered = JSON.parse(fs.readFileSync(BAK, 'utf-8'));
          process.stderr.write('[state-io] ⚠ recovered state from .bak (main corrupt) — R-1\n');
          if (!Array.isArray(recovered.governance_alerts)) recovered.governance_alerts = [];
          recovered.governance_alerts.push({
            kind: 'state_recovered_from_backup',
            at: new Date().toISOString(),
            session: recovered.session_id || '',
          });
          return recovered;
        } catch {}
      }
      return null;
    }
  }
  if (fs.existsSync(BAK)) {
    try { return JSON.parse(fs.readFileSync(BAK, 'utf-8')); } catch {}
  }
  return null;
}

/** Atomic write: backup → tmp(fsync) → rename → dir fsync. Copied from post-agent-hook. */
function writeStateAtomic(state, stateFile = DEFAULT_STATE) {
  const BAK = stateFile + '.bak';
  if (fs.existsSync(stateFile)) { try { fs.copyFileSync(stateFile, BAK); } catch {} }
  const tmp = stateFile + '.tmp.' + process.pid;
  const data = JSON.stringify(state, null, 2) + '\n';
  const fd = fs.openSync(tmp, 'w');
  try { fs.writeSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try { fs.renameSync(tmp, stateFile); }
  catch (e) { try { fs.unlinkSync(tmp); } catch {} throw e; }
  try {
    const dirFd = fs.openSync(path.dirname(stateFile), 'r');
    fs.fsyncSync(dirFd); fs.closeSync(dirFd);
  } catch (e) {
    if (e.code !== 'EPERM' && e.code !== 'EISDIR' && e.code !== 'EACCES') throw e;
  }
}

/**
 * Атомарный read-modify-write под локом. mutator(state) мутирует объект на месте;
 * если readStateRaw вернул null (нет валидного state), mutator НЕ вызывается, возвращается null.
 * `opts.onFailOpen` пробрасывается в лок (наблюдаемый fail-open при таймауте).
 */
function updateStateLocked(stateFile, mutator, opts = {}) {
  const target = stateFile || DEFAULT_STATE;
  return withStateLock(target, () => {
    const state = readStateRaw(target);
    if (!state) return null;
    const r = mutator(state);
    writeStateAtomic(state, target);
    return r === undefined ? state : r;
  }, opts);
}

module.exports = { readStateRaw, writeStateAtomic, updateStateLocked, DEFAULT_STATE };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/audit/__tests__/state-io-concurrency.test.js`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add .claude/runtime/state-io.js tools/audit/__tests__/state-io-concurrency.test.js
git commit -m "feat(state): atomic read-modify-write under lock (state-io)"
```

---

## Task 3: Lost-update regression test (proves the HA-2 gap)

**Files:**
- Modify: `tools/audit/__tests__/state-io-concurrency.test.js` (добавить N-way тест)

- [ ] **Step 1: Add the failing concurrency test**

Добавить в конец `state-io-concurrency.test.js`:

```js
const cp = require('node:child_process');

test('20 concurrent updateStateLocked appends — ALL survive (no lost update)', async () => {
  const f = tmpState('concurrent');
  writeStateAtomic({ session_id: 's', observations: [] }, f);

  // Каждый процесс делает updateStateLocked, добавляя уникальную observation.
  const script = (i) => `
    const { updateStateLocked } = require(${JSON.stringify(path.join(gitRoot(), '.claude/runtime/state-io.js'))});
    updateStateLocked(${JSON.stringify(f)}, (st) => { st.observations.push({ i: ${i} }); });
  `;
  const procs = [];
  for (let i = 0; i < 20; i++) {
    procs.push(new Promise(resolve => {
      const p = cp.spawn(process.execPath, ['-e', script(i)]);
      p.on('exit', () => resolve());
    }));
  }
  await Promise.all(procs);

  const final = readStateRaw(f);
  assert.strictEqual(final.observations.length, 20,
    `all 20 mutations must survive; got ${final.observations.length} (lost update = HA-2)`);
  const ids = new Set(final.observations.map(o => o.i));
  assert.strictEqual(ids.size, 20, 'no duplicate/lost ids');
  fs.unlinkSync(f); try { fs.unlinkSync(f + '.bak'); } catch {}
});
```

- [ ] **Step 2: Run test — confirm it PASSES (lock already works)**

Run: `node --test tools/audit/__tests__/state-io-concurrency.test.js`
Expected: PASS (4/4) — лок уже сериализует мутации. Этот тест — регрессионный якорь HA-2: он останется зелёным, только пока writer'ы идут через `updateStateLocked`.

> Контрольная проверка реальности гэпа (опционально, не коммитить): временно заменить тело `script` на прямой `readStateRaw`+push+`writeStateAtomic` БЕЗ лока → тест падает (~<20 выживших). Это доказывает, что зелёный держится на локе, а не на случайности (CLAUDE.md §17).

- [ ] **Step 3: Commit**

```bash
git add tools/audit/__tests__/state-io-concurrency.test.js
git commit -m "test(state): N-way lost-update regression anchor for HA-2"
```

---

## Task 4: Migrate post-agent-hook.js → updateStateLocked

**Files:**
- Modify: `.claude/runtime/post-agent-hook.js:56-83` (удалить локальную `writeState`), `:159` (`readState`), `:249` (`writeState(state)`)

- [ ] **Step 1: Replace local readState/writeState with state-io**

Заменить импорт (`:16-22`), добавив:

```js
const { readStateRaw, updateStateLocked } = require('./state-io');
const { recordStateLockFailOpen } = require('./gate-fail-open'); // добавляется в Task 9; до тех пор — no-op shim
```

Удалить локальные `function readState()` (`:28-54`) и `function writeState(state)` (`:56-83`).

- [ ] **Step 2: Route the whole mutation through the lock**

Тело `run(raw)` сейчас: `readState()` → много мутаций `state.*` → `writeState(state)` (`:249`). Обернуть критическую секцию: заменить `const state = readState();` (`:159`) и финальный `writeState(state);` (`:249`) на единый `updateStateLocked`:

```js
  // (после resolveAgent + responseText + estimateTokens, которые НЕ трогают state)
  const result = updateStateLocked(STATE, (state) => {
    if (!state.session_id) {
      process.stderr.write('[post-agent-hook] session_id empty — skip\n');
      return false; // mutator-флаг "ничего не делать" — write всё равно произойдёт, но no-op
    }
    // ... весь существующий блок мутаций :187-247 дословно (inflight reconcile,
    //     agent_outputs, observations.push, contract_debt, dag advance) ...
  }, { onFailOpen: (why) => recordStateLockFailOpen({ gate: 'post-agent-hook', why }) });

  if (result === null) {
    process.stderr.write('[post-agent-hook] state file missing or unparseable\n');
  }
```

> Примечание: `agent`/`text`/`parsed` вычисляются ДО лока (чистые, не читают state). Только мутации — внутри. Это минимизирует время удержания лока.

- [ ] **Step 3: Run the relevant tests**

Run: `node tools/audit/run-tests.js` (канонический, `concurrency:false`)
Expected: PASS — включая `hook-concurrency.test.js` (валидный JSON + нет residue), `schema-*`, `contract-debt-injector`.

- [ ] **Step 4: Commit**

```bash
git add .claude/runtime/post-agent-hook.js
git commit -m "refactor(state): post-agent-hook writes via updateStateLocked (HA-2)"
```

---

## Task 5: Migrate flush-state.js (both write paths)

**Files:**
- Modify: `.claude/runtime/flush-state.js:139-159` (inline write при flush), `:173-197` (`writeStateSafe`)

- [ ] **Step 1: Route the flush write through the lock**

Импорт вверху файла:

```js
const { updateStateLocked, writeStateAtomic } = require('./state-io');
```

Заменить блок `:140-156` (формирование `stateToWrite` + tmp/fsync/rename) так, чтобы очистка `observations` шла под локом и атомарно с остальными правками flush. Поскольку flush уже держит весь `state` в памяти, переписать на:

```js
  // Очищаем observations атомарно под локом (а не поверх возможной параллельной записи).
  updateStateLocked(STATE_FILE, (fresh) => {
    fresh.observations = [];
    if (Array.isArray(state.contract_debt_agents)) fresh.contract_debt_agents = state.contract_debt_agents;
  });
  state.observations = []; // in-memory mirror после успешного commit (D-15 сохранено)
```

> Важно: flush ранее писал ВЕСЬ `state`. Теперь мутируем `fresh` (перечитанный под локом), чтобы не затереть alerts/agent_outputs, добавленные параллельными хуками между чтением flush и записью. Переносим в `fresh` только то, что flush реально меняет (observations, contract_debt_agents). Это и есть закрытие lost-update для самого flush.

- [ ] **Step 2: Route writeStateSafe through state-io**

`writeStateSafe` (`:173-197`) используется в recovery-пути. Заменить тело на делегацию:

```js
function writeStateSafe(state, statePath) {
  writeStateAtomic(state, statePath || STATE_FILE); // единый атомарный путь (Task 2)
}
```

- [ ] **Step 3: Run tests**

Run: `node tools/audit/run-tests.js`
Expected: PASS — включая `flush-state-idempotency`, `flush-state-resilience`, `flush-state-rollup`.

- [ ] **Step 4: Commit**

```bash
git add .claude/runtime/flush-state.js
git commit -m "refactor(state): flush-state writes via updateStateLocked (HA-2)"
```

---

## Task 6: Migrate execute-dag.js (in-process → cross-process lock)

**Files:**
- Modify: `.claude/runtime/execute-dag.js:55-87` (`writeState`/`updateState` writeLock), `:352`

- [ ] **Step 1: Replace the in-process writeLock with the cross-process lock**

`execute-dag.js` уже имеет `updateState(fn)` с in-process `writeLock` Promise-цепочкой (`:79-87`). In-process lock не защищает от хуков в других процессах (§18). Переписать `updateState` так, чтобы оно держало in-process очередь (для параллельных шагов в ОДНОМ процессе) И cross-process лок (для хуков):

```js
const { readStateRaw, writeStateAtomic, updateStateLocked } = require('./state-io');

// In-process очередь сохраняется (сериализует шаги внутри процесса), а сам критический
// read-modify-write идёт под cross-process локом (сериализует относительно хуков).
let writeLock = Promise.resolve();
function updateState(fn) {
  writeLock = writeLock.then(() => {
    updateStateLocked(STATE_FILE, (s) => { fn(s); });
  });
  return writeLock;
}
```

Удалить локальную `function writeState(state)` (`:59-75`) и локальный `readState` (`:57`). Прямой вызов `writeState(state)` на `:352` заменить на `writeStateAtomic(state, STATE_FILE)` если он вне `updateState`-пути (проверить контекст: если это финальный flush после DAG — оставить атомарным; если внутри мутации — завернуть в `updateStateLocked`).

- [ ] **Step 2: Run tests**

Run: `node tools/audit/run-tests.js`
Expected: PASS — включая `execute-dag-writestate`, `execute-dag-applystep`, `execute-dag-resume-limit`, `execute-dag-fallback`, `execute-dag-context-warn`, `execute-dag-skip-perms`.

- [ ] **Step 3: Commit**

```bash
git add .claude/runtime/execute-dag.js
git commit -m "refactor(state): execute-dag uses cross-process lock under in-proc queue (HA-2)"
```

---

## Task 7: Migrate the 4 alert-appenders

**Files:**
- Modify: `.claude/runtime/pre-agent-gate.js:141-175` (`alertAppend`, `recordInflight`)
- Modify: `.claude/runtime/gate-fail-open.js:36-46` (`recordGateFailOpen` state-alert path)
- Modify: `.claude/runtime/governance-reactor.js:84-94` (mark-surfaced)
- Modify: `.claude/runtime/failure-detectors.js:92-114` (append alerts)

> Все четыре делают: re-read fresh → append в `governance_alerts`/`inflight_spawns`/`surfaced` → tmp+rename. Заменяем на `updateStateLocked`, сохраняя fail-open (these gates НИКОГДА не должны бросать).

- [ ] **Step 1: pre-agent-gate.js — alertAppend + recordInflight**

```js
const { updateStateLocked } = require('./state-io');

const alertAppend = (record) => {
  try { updateStateLocked(STATE, (s) => { (s.governance_alerts ||= []).push(record); }); }
  catch (e) { process.stderr.write(`[pre-agent-gate] alert-append failed: ${e.message}\n`); }
};

const recordInflight = (_state, agent) => {
  try {
    updateStateLocked(STATE, (s) => {
      if (!Array.isArray(s.inflight_spawns)) s.inflight_spawns = [];
      s.inflight_spawns.push({ agent: String(agent), at: new Date().toISOString() });
    });
  } catch (e) { process.stderr.write(`[pre-agent-gate] inflight-record failed: ${e.message}\n`); }
};
```

- [ ] **Step 2: gate-fail-open.js — state-alert path**

Сохранить durable append-only лог как есть (`:30-33`, робастный канал). Заменить только best-effort state-write (`:36-46`):

```js
const { updateStateLocked } = require('./state-io');
// ...
  try {
    updateStateLocked(stateFile, (fresh) => {
      const alert = { kind: 'gate_failed_open', at, gate, phase, message: msg, session: fresh.session_id || '' };
      (fresh.governance_alerts ||= []).push(alert);
    });
  } catch { /* never throw — durable log already captured it */ }
```

- [ ] **Step 3: governance-reactor.js — mark-surfaced**

Заменить `:84-94`:

```js
const { updateStateLocked } = require('./state-io');
// ...
      try {
        updateStateLocked(STATE_FILE, (fresh) => {
          if (Array.isArray(fresh.governance_alerts))
            for (const i of surfacedIdx) if (fresh.governance_alerts[i]) fresh.governance_alerts[i].surfaced = true;
        });
      } catch (e) {
        process.stderr.write(`[governance-reactor] mark-surfaced failed: ${e.message}\n`); // still inject
      }
```

- [ ] **Step 4: failure-detectors.js — append alerts**

Заменить `:92-114`:

```js
const { updateStateLocked } = require('./state-io');
// ...
    updateStateLocked(STATE_FILE, (fresh) => {
      fresh.governance_alerts = [...(fresh.governance_alerts || []), ...alerts];
    });
```

- [ ] **Step 5: Run tests**

Run: `node tools/audit/run-tests.js`
Expected: PASS — `failure-detectors`, `failure-detectors-wiring`, `optimizer-gate`, `governance-manifest`, `rgs-wiring`.

- [ ] **Step 6: Commit**

```bash
git add .claude/runtime/pre-agent-gate.js .claude/runtime/gate-fail-open.js .claude/runtime/governance-reactor.js .claude/runtime/failure-detectors.js
git commit -m "refactor(state): 4 alert-appenders write via updateStateLocked (HA-2)"
```

---

## Task 8: Migrate audit-session-reset.js (SSTATE)

**Files:**
- Modify: `.claude/runtime/audit-session-reset.js:90-128` (SSTATE write + prune)

- [ ] **Step 1: Route SSTATE writes through state-io**

`audit-session-reset.js` пишет SSTATE (`= session-state.json`) двумя путями: reset (`:96-105`) и prune (`:121-127`). Импортировать и заменить оба на `updateStateLocked` (для prune) и `writeStateAtomic` (для reset, т.к. он пишет новый объект целиком):

```js
const { updateStateLocked, writeStateAtomic } = require('./state-io');
```

Reset-путь (пишет свежий объект): `writeStateAtomic(newSessionState, SSTATE)`.
Prune-путь (мутирует существующий): `updateStateLocked(SSTATE, (s) => { /* существующая prune-логика над s */ });`

> Сверить точные имена переменных в `:90-128` при правке — структура prune может читать-фильтровать массивы; перенести фильтрацию внутрь mutator.

- [ ] **Step 2: Run tests**

Run: `node tools/audit/run-tests.js`
Expected: PASS — `audit-session-reset`.

- [ ] **Step 3: Commit**

```bash
git add .claude/runtime/audit-session-reset.js
git commit -m "refactor(state): audit-session-reset writes via state-io (HA-2)"
```

---

## Task 9: Observable lock fail-open + strengthen concurrency test + wire reactor

**Files:**
- Modify: `.claude/runtime/gate-fail-open.js` (добавить `recordStateLockFailOpen`)
- Modify: `.claude/runtime/governance-reactor.js:22-35` (DIRECTIVES — новый kind)
- Modify: `tools/audit/__tests__/hook-concurrency.test.js` (считать выжившие observations)

- [ ] **Step 1: Add recordStateLockFailOpen to gate-fail-open.js**

В `gate-fail-open.js` добавить экспорт-обёртку (durable log + state alert), переиспользуя существующую логику:

```js
function recordStateLockFailOpen({ gate, why }) {
  recordGateFailOpen({ gate: `state-lock/${gate}`, phase: 'lock', message: `lock fail-open: ${why}` });
}
module.exports = { recordGateFailOpen, recordStateLockFailOpen };
```

(Это снимает временный shim из Task 4 — заменить там импорт на реальный.)

- [ ] **Step 2: Wire the directive in governance-reactor.js**

Добавить в `DIRECTIVES` (`:22-35`):

```js
  state_lock_failed_open: 'a state-write lock could not be acquired and the write proceeded WITHOUT mutual exclusion — possible lost update under contention; verify recent state mutations persisted',
```

- [ ] **Step 3: Strengthen hook-concurrency.test.js to assert no lost updates**

Заменить тело теста (`:39-43`), добавив проверку количества observations. 20 хуков от РАЗНЫХ агентов нужны, чтобы каждый создал отдельную observation (тот же агент перезаписывает `agent_outputs[name]`, но `observations.push` аддитивен). Текущий тест шлёт всех как `ccip-architect` → observations должно стать 20:

```js
    const final = JSON.parse(finalRaw);
    assert.strictEqual(final.observations.length, 20,
      `all 20 concurrent hooks must append an observation; got ${final.observations.length} (lost update = HA-2)`);

    const tmps = fs.readdirSync(path.dirname(STATE)).filter(f => f.includes('.tmp'));
    assert.deepEqual(tmps, [], 'no .tmp file should remain');
    const locks = fs.readdirSync(path.dirname(STATE)).filter(f => f.endsWith('.lock'));
    assert.deepEqual(locks, [], 'no .lock residue after settle');
```

- [ ] **Step 4: Run the full canonical runner**

Run: `node tools/audit/run-tests.js`
Expected: PASS — `hook-concurrency` теперь доказывает отсутствие lost-update; всё остальное зелёное.

- [ ] **Step 5: Commit**

```bash
git add .claude/runtime/gate-fail-open.js .claude/runtime/governance-reactor.js tools/audit/__tests__/hook-concurrency.test.js .claude/runtime/post-agent-hook.js
git commit -m "feat(state): observable lock fail-open + no-lost-update proof (HA-2/E-2 closed)"
```

---

## Task 10: ADR-019 + §18 + state-protocol docs

**Files:**
- Create: `docs/decisions/ADR-019-cross-process-state-lock.md`
- Modify: `docs/decisions/index.md:42-45` (добавить строку ADR-019)
- Modify: `CLAUDE.md` §18 (строка `writeLock serializes all mutations`)
- Modify: `.claude/runtime/state-protocol.md` (упоминание лока в lifecycle)

> Новый ADR (а не правка ADR-018) — чтобы не ре-бампить «Принято rev 2» (memory: ADR-immutability gotcha). ADR-019 ссылается на ADR-018.

- [ ] **Step 1: Write ADR-019**

```markdown
# ADR-019: Cross-Process State Lock + Honest Contract Promotion

Status: Accepted
Date: 2026-06-11
Reviewer: <human-name>   <!-- заполнить: live-сессия sign-off -->
Related: ADR-018 (machine-enforced runtime governance), ADR-017 (state-update observability)

## Context
session-state.json мутируют 8 hook-скриптов в РАЗНЫХ процессах. Каждый write атомарен
(tmp+fsync+rename), но read-modify-write не атомарен между процессами → lost update
(HA-2 known-risk, E-2 residual race). In-process writeLock в execute-dag не покрывает хуки.

## Decision
1. Все мутации session-state.json идут через updateStateLocked (state-io.js) под blocking
   cross-process локом (state-lock.js, модель из _lib/serial-guard.js). HA-2/E-2 закрыты.
2. Лок fail-open наблюдаемо: при таймауте acquire write проходит без лока + state_lock_failed_open
   alert (governance-reactor surface), в духе E-6.
3. INV-STATE-CONTRACT повышен signal→enforced ПОСЛЕ сведения FPR к нулю через contract-exempt
   реестр (relay-агенты вроде ccip-session-optimizer не эмитят State Update by design).

## Consequences
- §18 «single-process assumed» для writeLock снят: мутации теперь cross-process safe.
- Потолок Reliability/Scalability/State поднят; один signal-инвариант стал enforced честно
  (без фабрикации — §17), остальные 8 остаются signal by design (ADR-018, recert §6).
```

- [ ] **Step 2: Add the index line**

В `docs/decisions/index.md`, секция «Orchestration / Agent Runtime» (после ADR-018, `:45`):

```markdown
- [ADR-019-cross-process-state-lock.md](ADR-019-cross-process-state-lock.md) — межпроцессный лок session-state (HA-2/E-2) + честная градация INV-STATE-CONTRACT
```

- [ ] **Step 3: Update CLAUDE.md §18**

Заменить строку таблицы про `writeLock serializes all mutations` (Почему нет enforcement / «In-process lock — не работает при двух процессах»):

```
| `session-state mutations cross-process serialized` (state-lock.js) | **Machine-enforced** через updateStateLocked + blocking lock; fail-open наблюдаем (state_lock_failed_open) | Code (ADR-019) |
```

> Эта строка переезжает из «декларативных конвенций» в machine-enforced — сверить, что §18 преамбула («Если правило не в таблице — machine-enforced или advisory») остаётся верной.

- [ ] **Step 4: Update state-protocol.md**

Добавить в lifecycle-описание (рядом с UPDATE/FLUSH) одну строку: что все мутации сериализуются cross-process локом через `state-io.updateStateLocked` (ADR-019).

- [ ] **Step 5: Run doc/anchor audits + commit**

Run: `node tools/audit/audit-suite.js`
Expected: PASS (22/22) — включая `adr-anchors`, `dead-refs`, `adr-mention-existence`, `orphan-adrs`.

```bash
git add docs/decisions/ADR-019-cross-process-state-lock.md docs/decisions/index.md CLAUDE.md .claude/runtime/state-protocol.md
git commit -m "docs(adr): ADR-019 cross-process state lock; §18 writeLock now enforced"
```

---

## Task 11: Step 2a — contract-exempt registry (drive FPR→0)

**Files:**
- Create: `.claude/runtime/contract-exempt.js`
- Create: `tools/audit/__tests__/contract-exempt.test.js`
- Modify: `.claude/runtime/post-agent-hook.js:176-237` (применить exemption к missing-block логике)

- [ ] **Step 1: Write the failing test**

```js
// tools/audit/__tests__/contract-exempt.test.js
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');
const { isContractExempt, CONTRACT_EXEMPT } = require(path.join(gitRoot(), '.claude/runtime/contract-exempt.js'));

test('relay agents are exempt from INV-STATE-CONTRACT', () => {
  assert.ok(isContractExempt('ccip-session-optimizer'), 'session-optimizer relays verbatim, emits no State Update by design');
});

test('regular agents are NOT exempt', () => {
  assert.ok(!isContractExempt('ccip-backend-core'));
  assert.ok(!isContractExempt('red-team-auditor'));
});

test('exempt list is explicit and documented (no silent wildcard)', () => {
  assert.ok(Array.isArray(CONTRACT_EXEMPT) && CONTRACT_EXEMPT.length >= 1);
  assert.ok(CONTRACT_EXEMPT.every(e => typeof e === 'string'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/audit/__tests__/contract-exempt.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the registry**

```js
// .claude/runtime/contract-exempt.js
'use strict';
/**
 * contract-exempt.js — агенты, освобождённые от INV-STATE-CONTRACT (## State Update).
 *
 * Обоснование (FPR→0): ccip-session-optimizer по жёсткому правилу CLAUDE.md релеит свой
 * Next-Session Bootstrap ДОСЛОВНО и НЕ эмитит ## State Update — это by design, а не нарушение.
 * До этого реестра он был единственным хроническим missing_state_update в feedback-loop §5,
 * т.е. ~100% false-positive. Освобождение делает INV-STATE-CONTRACT пригодным к enforce (Task 12).
 *
 * Реестр ЯВНЫЙ (без wildcard) — каждое исключение обосновано здесь.
 */
const CONTRACT_EXEMPT = [
  'ccip-session-optimizer', // relay verbatim, no State Update by design (CLAUDE.md relay rule)
];

function isContractExempt(agent) {
  return CONTRACT_EXEMPT.includes(String(agent || ''));
}

module.exports = { isContractExempt, CONTRACT_EXEMPT };
```

- [ ] **Step 4: Apply exemption in post-agent-hook.js**

В `post-agent-hook.js`, где вычисляется `missingBlock` (`:176`) и копится `contract_debt` (`:224-237`), исключить exempt-агентов из учёта нарушения:

```js
const { isContractExempt } = require('./contract-exempt');
// ...
  const exempt = isContractExempt(agent);
  const missingBlock = parsed === null && !exempt;  // exempt → не считается нарушением
  if (parsed === null && exempt) {
    process.stderr.write(`[post-agent-hook] ${agent}: no State Update (contract-exempt, by design)\n`);
  } else if (missingBlock) {
    process.stderr.write(`[post-agent-hook] ⚠ ${agent}: no valid ## State Update block\n`);
  }
```

`observations[].missing_state_update` и `contract_debt`-инкремент уже завязаны на `missingBlock` → exempt-агенты автоматически не накручивают долг.

- [ ] **Step 5: Run tests**

Run: `node tools/audit/run-tests.js`
Expected: PASS — `contract-exempt` (3/3), `contract-debt-injector`, `schema-contract-debt`, `schema-missing-state-update`.

- [ ] **Step 6: Commit**

```bash
git add .claude/runtime/contract-exempt.js tools/audit/__tests__/contract-exempt.test.js .claude/runtime/post-agent-hook.js
git commit -m "feat(governance): contract-exempt registry — relay agents out of INV-STATE-CONTRACT (FPR→0)"
```

---

## Task 12: Step 2b — promote INV-STATE-CONTRACT signal→enforced

**Files:**
- Modify: `.claude/runtime/governance-manifest.json:3-10` (status `observed`→`enforced`, kind уточнить)
- Modify: `tools/audit/__tests__/governance-manifest.test.js` (ожидаемый статус/счётчики)

> Семантика «enforced» для контракта: пропуск ## State Update у НЕ-exempt агента эскалируется в твёрдый `state_contract_degraded` alert уже на ПЕРВОМ пропуске (threshold=1 для enforced-режима), который governance-reactor surface'ит как обязательную коррекцию. Это enforce в рамках PostToolUse (денаить нечего — агент отработал), но теперь без FPR-шума.

- [ ] **Step 1: Read current manifest test expectations**

Run: `node --test tools/audit/__tests__/governance-manifest.test.js`
Expected: PASS (текущее состояние) — зафиксировать, какие инварианты/счётчики ассертятся (13 инвариантов, anchor-integrity 13/13).

- [ ] **Step 2: Update the test to expect INV-STATE-CONTRACT enforced**

В `governance-manifest.test.js` добавить/изменить ассерт:

```js
test('INV-STATE-CONTRACT is enforced (signal promoted after FPR→0 via contract-exempt)', () => {
  const inv = manifest.invariants.find(i => i.id === 'INV-STATE-CONTRACT');
  assert.strictEqual(inv.status, 'enforced');
  assert.match(inv.claim, /exempt|enforced/i, 'claim reflects exemption-gated enforcement');
});
```

Если тест считает количество `enforced` инвариантов — увеличить ожидаемое на 1.

- [ ] **Step 3: Run test — verify it fails**

Run: `node --test tools/audit/__tests__/governance-manifest.test.js`
Expected: FAIL — status всё ещё `observed`.

- [ ] **Step 4: Update the manifest**

В `governance-manifest.json`, объект `INV-STATE-CONTRACT` (`:3-10`):

```json
    {
      "id": "INV-STATE-CONTRACT",
      "claim": "non-exempt agent MUST end with ## State Update; пропуск у non-exempt → state_contract_degraded на первом промахе (enforced). Relay-агенты освобождены (contract-exempt.js)",
      "doc_anchor": "§15",
      "enforcement": "post-agent-hook.js#INV-STATE-CONTRACT",
      "kind": "signal",
      "status": "enforced"
    },
```

> Также в `post-agent-hook.js`: для non-exempt agent при `missingBlock` поднять `state_contract_degraded` сразу (порог 1 в enforced-режиме), а не только на `contract_debt>=3`. Сохранить env-управляемость (`CCIP_CONTRACT_DEBT_THRESHOLD`), но дефолт для enforced = немедленный alert.

- [ ] **Step 5: Run the full canonical runner + audit-suite**

Run: `node tools/audit/run-tests.js && node tools/audit/audit-suite.js`
Expected: PASS — `governance-manifest` (включая anchor-integrity 13/13), audit-suite 22/22.

- [ ] **Step 6: Commit**

```bash
git add .claude/runtime/governance-manifest.json tools/audit/__tests__/governance-manifest.test.js .claude/runtime/post-agent-hook.js
git commit -m "feat(governance): promote INV-STATE-CONTRACT signal→enforced (FPR=0 via exemption)"
```

---

## Task 13: Live re-certification + wrap

**Files:**
- Create: `docs/audits/2026-06-11-recertification-advanced-enterprise.md` (или след. дата)

- [ ] **Step 1: Run the full verification battery**

Run:
```bash
node tools/audit/run-tests.js     # канонический раннер — детерминированно зелёный
node tools/audit/audit-suite.js   # 22/22
node tools/audit/session-state.js # runtime соответствует схеме
node tools/audit/state-contract-section.js # §15 цел
```
Expected: всё PASS.

- [ ] **Step 2: Execution-based re-cert (повтор методологии 2026-06-11)**

Воспроизвести ключевые проверки:
- HA-2: `state-io-concurrency` 20/20 выживших + `hook-concurrency` count=20.
- E-2 residual: тот же тест под локом — нет lost-update.
- Lock fail-open: форсировать таймаут (`CCIP_STATE_LOCK_TIMEOUT_MS=0`) → write проходит + `state_lock_failed_open` в alerts → reactor surface.
- Step 2: exempt-агент (session-optimizer) без State Update → `missing_state_update:false`, contract_debt не растёт; non-exempt без блока → `state_contract_degraded` сразу.
- Manifest: 13 инвариантов, INV-STATE-CONTRACT=enforced, anchors 13/13.

- [ ] **Step 3: Write the re-cert report**

Scorecard-дельты (честные, воспроизводимые): Reliability (race закрыт), Scalability (cross-process), State Mgmt (atomic RMW), Contract Enforcement (один signal стал enforced без FPR), Maintainability (8 writer'ов → один путь). Цель: 82 → ~86-88 (Advanced Enterprise при ≥86).

- [ ] **Step 4: Commit the re-cert**

```bash
git add docs/audits/2026-06-11-recertification-advanced-enterprise.md
git commit -m "docs(audits): re-certification — HA-2/E-2 closed + honest contract promotion"
```

---

## Self-Review

**Spec coverage:**
- Шаг 1 (cross-process lock + консолидация 8 writer'ов): Tasks 1-10 ✅ (state-lock, state-io, 8 миграций, observable fail-open, ADR-доки).
- Шаг 2 (честный промоут): Tasks 11-12 ✅ (exemption registry → FPR→0 → enforced).
- Live re-cert + commit-per-finding: Task 13 + per-task коммиты ✅ (memory: governance-находки = TDD + live re-cert + коммит).

**Placeholder scan:** ADR Reviewer `<human-name>` — намеренный плейсхолдер (заполняется live sign-off, как требует feedback-loop §5 ратификации). `audit-session-reset.js:90-128` и `execute-dag.js:352` помечены «сверить точные имена/контекст при правке» — это указание на верификацию реального кода, не placeholder для логики.

**Type consistency:** `withStateLock(stateFile, fn, opts)`, `updateStateLocked(stateFile, mutator, opts)`, `readStateRaw(stateFile)`, `writeStateAtomic(state, stateFile)`, `isContractExempt(agent)`, `recordStateLockFailOpen({gate, why})` — имена и сигнатуры согласованы между Task 1/2/4/9/11. `state_lock_failed_open` (kind) согласован между state-lock onFailOpen → gate-fail-open → governance-reactor DIRECTIVES.

**Риски/допущения для исполнителя:**
- `Atomics.wait` для sync-sleep требует Node ≥ 12 (есть). Проверить, что хуки запускаются обычным `node` (не deno/bun).
- Лок добавляет per-write латентность (acquire ≤25ms обычно). Для коротких хуков незаметно; execute-dag параллельные шаги сериализуются — это и есть цель.
- `.lock`-файл — новый артефакт в `.claude/runtime/`. Убедиться, что он в `.gitignore` (как `session-state.json.bak`), иначе зашумит git status. Проверить/добавить в Task 1 при необходимости.
