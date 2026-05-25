# Session-Optimizer Framework Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть critical/medium находки аудита `ccip-session-optimizer` — устранить рассинхрон policy↔runtime, command-injection и слабую evidence-chain, поднять observability/maintainability верификатора.

**Architecture:** Двухслойная система: policy-промпт (`.claude/agents/ccip-session-optimizer.md`) + deterministic verifier-runtime (`.claude/runtime/verify-evidence-log.js`, PostToolUse). План (а) приводит формулировки промпта к фактической runtime-семантике, (б) хардит хук (argv-git, path-confinement, timeouts, health-beacon), (в) усиливает evidence-chain (anchor-bound entailment + min-entropy), (г) добавляет honest enforcement (PostToolUse feedback-loop + PreToolUse single-flight gate), (д) разгружает токены и Wave-седимент.

**Tech Stack:** Node 20 (CommonJS), `node:test` + `node:assert` (раннер `tools/audit/run-tests.js`), smoke-харнесс `tools/audit/verify-evidence-log.smoke.js`, `js-yaml` (уже в deps), git CLI. Markdown-промпт. Claude Code hooks (`.claude/settings.json`).

**Audit reference:** см. находки C-1..C-5, M-1..M-10 в отчёте аудита от 2026-05-25 (этот разговор). Маппинг ID→Task — в Self-Review.

---

## Sequencing & Risk

```
Phase 0  Task 1            prompt-only, zero behavior change           LOW
Phase 1  Task 2–6          testability + runtime safety (hook hard)    MED  (Task3=C-3 security)
Phase 2  Task 7–8          evidence-chain integrity                    HIGH (Task8 ripples to fixtures+prompt)
Phase 3  Task 9–11         manifest robustness + trust model           MED
Phase 4  Task 12–13        honest enforcement (⚠ behavioral change)    HIGH (decision-gated)
Phase 5  Task 14–15        maintainability + token economy             LOW
Phase 6  Task 16           full acceptance                             —
```

- **Task 8** меняет смысл колонки `anchor` (документация → enforced) и затрагивает промпт + существующие fixtures. Самая аккуратная ревизия.
- **Task 12** меняет инвариант «хук никогда не блокирует родителя». ⚠ Перед стартом подтвердить выбор: feedback-loop (рекомендуется) vs advisory-only. Шаги Task 12 помечены этим решением.
- Каждый Task самодостаточен и заканчивается коммитом; ветку создать до Phase 0 (см. ниже).

- [ ] **Pre-flight: создать рабочую ветку**

```bash
git checkout -b chore/session-optimizer-hardening-2026-05-25
git rev-parse --abbrev-ref HEAD   # → chore/session-optimizer-hardening-2026-05-25
```

---

## File Structure

**Modify:**
```
.claude/agents/ccip-session-optimizer.md     — prompt: honest semantics, anchor-enforced, manifest v2, slim
.claude/runtime/verify-evidence-log.js        — module-ify + все runtime-фиксы
.claude/settings.json                         — PreToolUse gate registration (Task 13)
tools/audit/verify-evidence-log.smoke.js      — +cases для health-beacon и feedback-loop
```

**Create:**
```
.claude/runtime/optimizer-gate.js             — PreToolUse single-flight gate (Task 13)
.claude/runtime/verify-evidence-log.CHANGELOG.md  — Wave 1–7 история + FIREWALL-коды (Task 14)
.claude/agents/ccip-session-optimizer.extraction-map.md  — skill-markers side-car (Task 15)
tools/audit/_lib/run-evidence-hook.js         — shared spawn-helper для тестов (Task 2)
tools/audit/__tests__/verify-evidence-internals.test.js   — exports + anchorWindow (Task 2,8)
tools/audit/__tests__/verify-evidence-git-source.test.js  — C-3 (Task 3)
tools/audit/__tests__/verify-evidence-path-confine.test.js — M-1 (Task 4)
tools/audit/__tests__/verify-evidence-timeouts.test.js    — M-6 static guard (Task 5)
tools/audit/__tests__/verify-evidence-health.test.js      — C-5 (Task 6)
tools/audit/__tests__/verify-evidence-entropy.test.js     — M-5 (Task 7)
tools/audit/__tests__/verify-evidence-anchor.test.js      — C-2 (Task 8)
tools/audit/__tests__/verify-evidence-manifest.test.js    — M-4/M-3/M-10 (Task 9,10)
tools/audit/__tests__/verify-evidence-malformed.test.js   — M-9 (Task 11)
tools/audit/__tests__/optimizer-gate.test.js              — C-4 (Task 13)
tools/audit/__fixtures__/optimizer-output-*.md            — новые синтетические выводы (по задачам)
```

**Test commands (used throughout):**
```bash
node tools/audit/run-tests.js                  # node:test suite (или: pnpm test:audit)
node tools/audit/verify-evidence-log.smoke.js  # end-to-end smoke
pnpm audit-suite                               # полный аудит-набор
```

---

## Phase 0 — Truth reconciliation

### Task 1: Привести формулировки промпта к фактической PostToolUse-семантике (C-1 framing, M-2, M-7)

**Files:**
- Modify: `.claude/agents/ccip-session-optimizer.md`

Хук — `PostToolUse`, `exit 0 always`, не блокирует ответ (см. `verify-evidence-log.js:18`). Промпт же 2× заявляет «Хук reject'ит ответ» — это рассинхрон. Здесь делаем честную interim-формулировку (Task 12 затем добавит реальный feedback-loop). Плюс чиним «байт-в-байт» (фактически `String.includes` по UTF-8 контенту) и двусмысленность canonical-заголовка.

- [ ] **Step 1.1: Заменить reject-формулировку у лексем-firewall (L150)**

old:
```
- Самозаверение в bootstrap: лексемы `verified`, `проверено`, `self-test`, `self-check`, `confirmed`, `validated`, `cross-checked`, `ensured`, `guaranteed`, `✔`, `✅` — запрещены. Хук reject'ит ответ при match.
```
new:
```
- Самозаверение в bootstrap: лексемы `verified`, `проверено`, `self-test`, `self-check`, `confirmed`, `validated`, `cross-checked`, `ensured`, `guaranteed`, `✔`, `✅` — запрещены. Хук фиксирует FIREWALL_SELF_ATTEST как violation (см. §Persistence); ответ не самозаверяй.
```

- [ ] **Step 1.2: Заменить reject-формулировку у кардинального контракта (L240)**

old:
```
**Кардинальный контракт:** `count(claims in bootstrap) == count(rows in Артефакт 3)`. Хук reject'ит ответ при нарушении.
```
new:
```
**Кардинальный контракт:** `count(claims in bootstrap) == count(rows in Артефакт 3)`. Несовпадение → хук фиксирует L1_CARDINALITY_MISMATCH (violation, видим следующей сессии).
```

- [ ] **Step 1.3: Уточнить «байт-в-байт» в frontmatter description (L3) и §Запреты (L141)**

В L3 заменить `проверяет substring байт-в-байт` → `проверяет substring (UTF-8 content match, длина цитаты ≤ 80B)`.
В L141 заменить:
```
- Процитировать строку, которой нет байт-в-байт в bytes(source_file). Хук Read'ит источник и substring-check'ит.
```
на:
```
- Процитировать строку, которой нет в UTF-8 контенте source_file (substring-check; длина ≤ 80B UTF-8). Хук Read'ит источник и `content.includes(quote)`-check'ит.
```

- [ ] **Step 1.4: Снять двусмысленность canonical-заголовка bootstrap (M-7)**

В L161 после «canonical emit остаётся без префикса» добавить одно предложение:
```
Canonical форма для ЭМИТА — всегда `## Next-Session Bootstrap` без префикса; `### Артефакт N —` форма — только hook-side defense-in-depth, агент её не использует.
```

- [ ] **Step 1.5: Проверка — промпт всё ещё валиден для frontmatter-аудита**

```bash
node tools/audit/run-tests.js 2>&1 | grep -iE "frontmatter|agent-name" 
```
Expected: соответствующие тесты PASS (description ≤ лимита, поля на месте).

- [ ] **Step 1.6: Commit**

```bash
git add .claude/agents/ccip-session-optimizer.md
git commit -m "docs(optimizer): reconcile prompt with PostToolUse semantics (C-1 framing, M-2, M-7)"
```

---

## Phase 1 — Testability + runtime safety

### Task 2: Сделать хук require-able (export internals + main-guard) + shared test-helper

**Files:**
- Modify: `.claude/runtime/verify-evidence-log.js:310-317` (stdin wiring → main + guard)
- Create: `tools/audit/_lib/run-evidence-hook.js`
- Create: `tools/audit/__tests__/verify-evidence-internals.test.js`

Хук сейчас — скрипт без экспортов → внутренние функции нельзя юнит-тестировать. Делаем его и модулем, и скриптом. Это включает чистые юнит-тесты для последующих задач.

- [ ] **Step 2.1: Написать падающий тест на экспорты**

Create `tools/audit/__tests__/verify-evidence-internals.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

const mod = require(path.join(gitRoot(), '.claude/runtime/verify-evidence-log.js'));

test('hook exports internals for unit testing', () => {
  for (const fn of ['extractManifestBlock', 'parseManifest', 'parseEvidenceRows', 'verifyRowSource', 'bootstrapFirewall']) {
    assert.strictEqual(typeof mod[fn], 'function', `${fn} must be exported`);
  }
});
```

- [ ] **Step 2.2: Запустить — убедиться, что падает**

```bash
node tools/audit/run-tests.js 2>&1 | grep -iE "exports internals|fail"
```
Expected: FAIL (`require` выполняет stdin-wiring или экспортов нет).

- [ ] **Step 2.3: Реализовать main-guard + exports**

В `verify-evidence-log.js` заменить блок (строки ~310–317):
```js
let raw = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  try { run(raw); }
  catch (e) { process.stderr.write(`[verify-evidence-log] FAIL: ${e.message}\n${e.stack || ''}\n`); }
  process.exit(0);
});
```
на:
```js
function main() {
  let raw = '';
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', chunk => { raw += chunk; });
  process.stdin.on('end', () => {
    try { run(raw); }
    catch (e) {
      process.stderr.write(`[verify-evidence-log] FAIL: ${e.message}\n${e.stack || ''}\n`);
    }
    process.exit(0);
  });
}

if (require.main === module) main();

module.exports = {
  extractManifestBlock, parseManifest, parseValue, parseEvidenceRows,
  verifyRowSource, bootstrapFirewall, run,
};
```

- [ ] **Step 2.4: Создать shared spawn-helper**

Create `tools/audit/_lib/run-evidence-hook.js`:
```js
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { gitRoot } = require('./git-root');

const ROOT = gitRoot();
const HOOK = path.join(ROOT, '.claude/runtime/verify-evidence-log.js');

function setupTmp() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccip-opt-'));
  const sessions = path.join(root, 'sessions');
  fs.mkdirSync(sessions);
  return { root, sessions, index: path.join(root, 'index.md'), errors: path.join(root, 'errors.md'), lock: path.join(root, 'optimizer.lock') };
}
function teardown(tmp) { try { fs.rmSync(tmp.root, { recursive: true, force: true }); } catch {} }

function runHook(agentOutput, tmp, extraEnv = {}) {
  const payload = { tool_name: 'Agent', tool_input: { subagent_type: 'ccip-session-optimizer' }, tool_response: { content: agentOutput } };
  return cp.spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload), encoding: 'utf8',
    env: { ...process.env, OPT_SESSIONS_DIR: tmp.sessions, OPT_INDEX_FILE: tmp.index, OPT_ERRORS_LOG: tmp.errors, OPT_LOCK_FILE: tmp.lock, ...extraEnv },
  });
}
function latestSession(tmp) {
  const files = fs.readdirSync(tmp.sessions).filter(f => f.endsWith('.md')).sort();
  return files.length ? fs.readFileSync(path.join(tmp.sessions, files[files.length - 1]), 'utf-8') : null;
}
module.exports = { ROOT, HOOK, setupTmp, teardown, runHook, latestSession };
```

- [ ] **Step 2.5: Запустить — убедиться, что зелено**

```bash
node tools/audit/run-tests.js 2>&1 | tail -5
```
Expected: все тесты PASS, включая `exports internals`.

- [ ] **Step 2.6: Smoke не сломан**

```bash
node tools/audit/verify-evidence-log.smoke.js 2>&1 | tail -3
```
Expected: `=== summary: PASS ===`.

- [ ] **Step 2.7: Commit**

```bash
git add .claude/runtime/verify-evidence-log.js tools/audit/_lib/run-evidence-hook.js tools/audit/__tests__/verify-evidence-internals.test.js
git commit -m "refactor(optimizer-hook): module-ify + export internals + shared test helper"
```

---

### Task 3: Устранить command-injection в git-источниках — execFileSync (C-3)

**Files:**
- Modify: `.claude/runtime/verify-evidence-log.js` (импорт + `verifyRowSource` git-ветка ~L237-249)
- Create: `tools/audit/__tests__/verify-evidence-git-source.test.js`
- Create: `tools/audit/__fixtures__/optimizer-output-c3-inject.md`

`git show \`${sha}:${gitPath}\`` (L244) исполняется через shell; `gitPath` из вывода агента → инъекция. Меняем на `execFileSync` (argv-форма, без shell).

- [ ] **Step 3.1: Написать падающий fixture + тест**

Create `tools/audit/__fixtures__/optimizer-output-c3-inject.md`:
````markdown
## Session Optimization Report — 2026-05-25
нарушений не обнаружено

## Next-Session Bootstrap
1. **Context:** phase audit-hardening
<!-- bootstrap-integrity timestamp:2026-05-25 generated-by:ccip-session-optimizer -->

### Evidence Log

| # | claim_in_bootstrap | source_file | anchor | exact_substring (≤ 80B UTF-8, `|` → `\|`) |
|---|---|---|---|---|
| 1 | phase audit-hardening | git:1234567:x & echo PWNED > pwned-sentinel.txt | n/a | phase audit-hardening |

```yaml manifest=invariants-v1
invariants:
  bootstrap_claims: 1
  evidence_rows: 1
  unverified_rows: 0
  coverage: full
```
````

Create `tools/audit/__tests__/verify-evidence-git-source.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, setupTmp, teardown, runHook, latestSession } = require('../_lib/run-evidence-hook');

function fixture(name) { return fs.readFileSync(path.join(__dirname, '..', '__fixtures__', name), 'utf-8'); }

test('C-3: git source path is passed literally, no shell execution', () => {
  const tmp = setupTmp();
  const sentinel = path.join(ROOT, 'pwned-sentinel.txt');
  try { fs.rmSync(sentinel, { force: true }); } catch {}
  try {
    runHook(fixture('optimizer-output-c3-inject.md'), tmp);
    const session = latestSession(tmp);
    assert.ok(!fs.existsSync(sentinel), 'shell metacharacters must NOT spawn a subshell');
    assert.match(session, /L2_EVIDENCE_ROW_1: git_show_fail/, 'git treats the whole metachar string as a literal path → fail');
  } finally {
    try { fs.rmSync(sentinel, { force: true }); } catch {}
    teardown(tmp);
  }
});
```

- [ ] **Step 3.2: Запустить — убедиться, что падает (текущий execSync → shell)**

```bash
node tools/audit/run-tests.js 2>&1 | grep -iE "C-3|fail"
```
Expected: FAIL (под shell `&`/`;` могут выполниться, либо reason ≠ git_show_fail).

- [ ] **Step 3.3: Реализовать execFileSync**

В начале файла к импортам (`const { execSync } = require('child_process');`) добавить `execFileSync`:
```js
const { execSync, execFileSync } = require('child_process');
```
В `verifyRowSource`, git-ветка — заменить:
```js
    let content;
    try {
      content = execSync(`git show ${sha}:${gitPath}`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    } catch (e) {
      return { ok: false, reason: `git_show_fail(${sha}:${gitPath})` };
    }
```
на:
```js
    // Reject paths that could be mis-parsed as git options or contain NUL.
    if (gitPath.startsWith('-') || gitPath.includes(' ')) {
      return { ok: false, reason: 'git_path_invalid' };
    }
    let content;
    try {
      content = execFileSync('git', ['show', `${sha}:${gitPath}`],
        { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).toString();
    } catch (e) {
      return { ok: false, reason: `git_show_fail(${sha}:${gitPath})` };
    }
```

- [ ] **Step 3.4: Запустить — зелено**

```bash
node tools/audit/run-tests.js 2>&1 | grep -iE "C-3"
node tools/audit/verify-evidence-log.smoke.js 2>&1 | tail -3
```
Expected: C-3 PASS; smoke `summary: PASS`.

- [ ] **Step 3.5: Commit**

```bash
git add .claude/runtime/verify-evidence-log.js tools/audit/__tests__/verify-evidence-git-source.test.js tools/audit/__fixtures__/optimizer-output-c3-inject.md
git commit -m "fix(optimizer-hook): eliminate git command-injection via execFileSync (C-3)"
```

---

### Task 4: Path-confinement для repo:/state-memory: источников (M-1)

**Files:**
- Modify: `.claude/runtime/verify-evidence-log.js` (consts + `verifyRowSource` fs-ветка ~L251-253)
- Create: `tools/audit/__tests__/verify-evidence-path-confine.test.js`
- Create: `tools/audit/__fixtures__/optimizer-output-m1-traversal.md`

`path.resolve(ROOT, rest)` без проверки границ → `repo:../../etc/...` читает вне репо. Confine: `repo:`/`git:` — строго под ROOT; `state-memory:` — под ROOT или под allowed memory-root (memory-каталог вне репо легитимен).

- [ ] **Step 4.1: Fixture + падающий тест**

Create `tools/audit/__fixtures__/optimizer-output-m1-traversal.md`:
````markdown
## Session Optimization Report — 2026-05-25
нарушений не обнаружено

## Next-Session Bootstrap
1. **Context:** phase audit-hardening
<!-- bootstrap-integrity timestamp:2026-05-25 generated-by:ccip-session-optimizer -->

### Evidence Log

| # | claim_in_bootstrap | source_file | anchor | exact_substring (≤ 80B UTF-8, `|` → `\|`) |
|---|---|---|---|---|
| 1 | phase audit-hardening | repo:../../../../../../../../etc/hosts | n/a | localhost |

```yaml manifest=invariants-v1
invariants:
  bootstrap_claims: 1
  evidence_rows: 1
  unverified_rows: 0
  coverage: full
```
````

Create `tools/audit/__tests__/verify-evidence-path-confine.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { setupTmp, teardown, runHook, latestSession } = require('../_lib/run-evidence-hook');

function fixture(name) { return fs.readFileSync(path.join(__dirname, '..', '__fixtures__', name), 'utf-8'); }

test('M-1: repo: source escaping ROOT is rejected with path_escape', () => {
  const tmp = setupTmp();
  try {
    runHook(fixture('optimizer-output-m1-traversal.md'), tmp);
    const session = latestSession(tmp);
    assert.match(session, /L2_EVIDENCE_ROW_1: path_escape/);
  } finally { teardown(tmp); }
});
```

- [ ] **Step 4.2: Запустить — падает**

```bash
node tools/audit/run-tests.js 2>&1 | grep -iE "M-1|path_escape|fail"
```
Expected: FAIL (нет проверки границ; reason будет source_file_missing/quote_not_in_source, не path_escape).

- [ ] **Step 4.3: Реализовать confinement**

Рядом с `ALLOWED_SOURCE_PREFIXES` (после L53) добавить:
```js
// @skill: config:memory-roots — state-memory may live outside the repo (e.g. ~/.claude/.../memory).
// Repo/git sources are confined to ROOT; state-memory additionally to these roots.
const MEMORY_ROOTS = (process.env.OPT_MEMORY_ROOTS || '')
  .split(path.delimiter).filter(Boolean).map(p => path.resolve(p));

function isUnder(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}
```
В `verifyRowSource`, fs-ветка — заменить:
```js
  // repo: и state-memory: — оба resolve относительно ROOT
  const abs = path.isAbsolute(rest) ? rest : path.resolve(ROOT, rest);
  if (!fs.existsSync(abs)) return { ok: false, reason: 'source_file_missing' };
```
на:
```js
  // repo: и state-memory: — resolve относительно ROOT; затем confinement.
  const abs = path.isAbsolute(rest) ? rest : path.resolve(ROOT, rest);
  const confined = isUnder(abs, ROOT) || (kind === 'state-memory' && MEMORY_ROOTS.some(r => isUnder(abs, r)));
  if (!confined) return { ok: false, reason: 'path_escape' };
  if (!fs.existsSync(abs)) return { ok: false, reason: 'source_file_missing' };
```

- [ ] **Step 4.4: Запустить — зелено + smoke**

```bash
node tools/audit/run-tests.js 2>&1 | grep -iE "M-1"
node tools/audit/verify-evidence-log.smoke.js 2>&1 | tail -3
```
Expected: M-1 PASS; smoke `summary: PASS` (clean-fixture использует `repo:`/`state-memory:` под ROOT — не затронут).

- [ ] **Step 4.5: Commit**

```bash
git add .claude/runtime/verify-evidence-log.js tools/audit/__tests__/verify-evidence-path-confine.test.js tools/audit/__fixtures__/optimizer-output-m1-traversal.md
git commit -m "fix(optimizer-hook): confine repo/state-memory source paths (M-1)"
```

---

### Task 5: Timeout на всех git-вызовах (M-6)

**Files:**
- Modify: `.claude/runtime/verify-evidence-log.js` (`gitShortHash` L66-71, branch L285, cat-file L299; git-show уже сделан в Task 3)
- Create: `tools/audit/__tests__/verify-evidence-timeouts.test.js`

Зависший git (credential prompt / огромный репо) блокирует хук. Добавляем `timeout: 5000`. Тест — статический guard: ни один `exec(File)?Sync` git-вызов не должен быть без `timeout`.

- [ ] **Step 5.1: Падающий static-guard тест**

Create `tools/audit/__tests__/verify-evidence-timeouts.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

const src = fs.readFileSync(path.join(gitRoot(), '.claude/runtime/verify-evidence-log.js'), 'utf-8');

test('M-6: every execSync/execFileSync call passes a timeout option', () => {
  const calls = src.match(/exec(?:File)?Sync\([\s\S]*?\}\s*\)/g) || [];
  assert.ok(calls.length >= 3, 'expected ≥3 git invocations');
  for (const c of calls) {
    assert.match(c, /timeout:\s*\d+/, `git call missing timeout:\n${c}`);
  }
});
```

- [ ] **Step 5.2: Запустить — падает**

```bash
node tools/audit/run-tests.js 2>&1 | grep -iE "M-6|timeout|fail"
```
Expected: FAIL (gitShortHash/branch/cat-file без timeout).

- [ ] **Step 5.3: Добавить timeout**

`gitShortHash` (L67-69):
```js
    return execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 })
```
branch (L285-286):
```js
      actual = execSync('git rev-parse --abbrev-ref HEAD',
        { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).toString().trim();
```
cat-file (L299):
```js
      execSync(`git cat-file -e ${m[1]}`, { cwd: ROOT, stdio: 'ignore', timeout: 5000 });
```

- [ ] **Step 5.4: Запустить — зелено**

```bash
node tools/audit/run-tests.js 2>&1 | grep -iE "M-6"
```
Expected: PASS.

- [ ] **Step 5.5: Commit**

```bash
git add .claude/runtime/verify-evidence-log.js tools/audit/__tests__/verify-evidence-timeouts.test.js
git commit -m "fix(optimizer-hook): add timeouts to all git invocations (M-6)"
```

---

### Task 6: Verifier health-beacon при внутренней ошибке (C-5)

**Files:**
- Modify: `.claude/runtime/verify-evidence-log.js` (`main()` catch + fault-injection в `run()`)
- Create: `tools/audit/__tests__/verify-evidence-health.test.js`

Сейчас любая внутренняя ошибка → `stderr + exit 0` молча → сломанный хук = ноль enforcement невидимо. Пишем VERIFIER_ERROR-маяк в INDEX/ERRORS перед exit 0. Тест-инъекция через `OPT_FORCE_FAULT`.

- [ ] **Step 6.1: Падающий тест**

Create `tools/audit/__tests__/verify-evidence-health.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { setupTmp, teardown, runHook } = require('../_lib/run-evidence-hook');

function fixture(name) { return fs.readFileSync(path.join(__dirname, '..', '__fixtures__', name), 'utf-8'); }

test('C-5: internal fault writes a VERIFIER_ERROR beacon to the index', () => {
  const tmp = setupTmp();
  try {
    const r = runHook(fixture('optimizer-output-clean.md'), tmp, { OPT_FORCE_FAULT: '1' });
    assert.strictEqual(r.status, 0, 'hook must still exit 0 on internal fault');
    const index = fs.readFileSync(tmp.index, 'utf-8');
    assert.match(index, /VERIFIER_ERROR/, 'beacon must be appended to the index file');
  } finally { teardown(tmp); }
});
```

- [ ] **Step 6.2: Запустить — падает**

```bash
node tools/audit/run-tests.js 2>&1 | grep -iE "C-5|VERIFIER_ERROR|fail"
```
Expected: FAIL (нет beacon, OPT_FORCE_FAULT игнорируется).

- [ ] **Step 6.3: Реализовать fault-injection + beacon**

В `run(raw)` сразу после проверки subagent (после строки `if (subagent !== 'ccip-session-optimizer') return;`) добавить:
```js
  if (process.env.OPT_FORCE_FAULT) throw new Error('forced fault (test only)');
```
В `main()` дополнить catch-блок (Task 2 версия):
```js
    catch (e) {
      process.stderr.write(`[verify-evidence-log] FAIL: ${e.message}\n${e.stack || ''}\n`);
      try {
        const stamp = utcStamp();
        atomicAppend(INDEX_FILE, `| ${stamp} | VERIFIER_ERROR | ? | ? | ? | ? | ? | 1 | ${e.message.slice(0, 120)} |`);
        atomicAppend(ERRORS_LOG, `\n### ${stamp} — VERIFIER_ERROR\n\n- ${e.message}\n`);
      } catch {}
    }
```

- [ ] **Step 6.4: Запустить — зелено + smoke (без fault — без beacon)**

```bash
node tools/audit/run-tests.js 2>&1 | grep -iE "C-5"
node tools/audit/verify-evidence-log.smoke.js 2>&1 | tail -3
```
Expected: C-5 PASS; smoke `summary: PASS`.

- [ ] **Step 6.5: Commit**

```bash
git add .claude/runtime/verify-evidence-log.js tools/audit/__tests__/verify-evidence-health.test.js
git commit -m "feat(optimizer-hook): VERIFIER_ERROR health beacon on internal fault (C-5)"
```

---

## Phase 2 — Evidence-chain integrity

### Task 7: Минимальная энтропия цитаты + low-signal stop-list (M-5)

**Files:**
- Modify: `.claude/runtime/verify-evidence-log.js` (consts + `verifyRowSource` после quote-length check ~L227-231)
- Modify: `.claude/agents/ccip-session-optimizer.md` (Evidence Log rules — добавить min-длину)
- Create: `tools/audit/__tests__/verify-evidence-entropy.test.js`
- Create: `tools/audit/__fixtures__/optimizer-output-m5-lowsignal.md`

`≤80B` есть, нижней границы нет → «done» (4B) валидирует любой claim. Добавляем `OPT_MIN_QUOTE_BYTES` (default 12) + stop-list low-signal слов.

- [ ] **Step 7.1: Fixture + падающий тест**

Create `tools/audit/__fixtures__/optimizer-output-m5-lowsignal.md`:
````markdown
## Session Optimization Report — 2026-05-25
нарушений не обнаружено

## Next-Session Bootstrap
1. **Context:** T-99 done
<!-- bootstrap-integrity timestamp:2026-05-25 generated-by:ccip-session-optimizer -->

### Evidence Log

| # | claim_in_bootstrap | source_file | anchor | exact_substring (≤ 80B UTF-8, `|` → `\|`) |
|---|---|---|---|---|
| 1 | T-99 done | repo:CLAUDE.md | n/a | done |

```yaml manifest=invariants-v1
invariants:
  bootstrap_claims: 1
  evidence_rows: 1
  unverified_rows: 0
  coverage: full
```
````

Create `tools/audit/__tests__/verify-evidence-entropy.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { setupTmp, teardown, runHook, latestSession } = require('../_lib/run-evidence-hook');

function fixture(name) { return fs.readFileSync(path.join(__dirname, '..', '__fixtures__', name), 'utf-8'); }

test('M-5: short low-signal quote is rejected', () => {
  const tmp = setupTmp();
  try {
    runHook(fixture('optimizer-output-m5-lowsignal.md'), tmp);
    const session = latestSession(tmp);
    assert.match(session, /L2_EVIDENCE_ROW_1: (quote_too_short|quote_low_signal)/);
  } finally { teardown(tmp); }
});
```

- [ ] **Step 7.2: Запустить — падает**

```bash
node tools/audit/run-tests.js 2>&1 | grep -iE "M-5|quote_too_short|fail"
```
Expected: FAIL (если «done» есть в CLAUDE.md — проходит как verified).

- [ ] **Step 7.3: Реализовать min-entropy**

Рядом с budget-константами добавить:
```js
// @skill: config:min-quote-bytes — нижняя граница специфичности цитаты
const MIN_QUOTE_BYTES = parseInt(process.env.OPT_MIN_QUOTE_BYTES || '12', 10);
const LOW_SIGNAL_QUOTES = new Set(['done', 'pending', 'blocked', 'deferred', 'none', 'n/a', 'todo', 'wip', 'ok', 'yes', 'no']);
```
В `verifyRowSource` сразу после `if (quoteBytes > 80) ...`:
```js
  if (quoteBytes < MIN_QUOTE_BYTES) return { ok: false, reason: `quote_too_short(${quoteBytes}B)` };
  if (LOW_SIGNAL_QUOTES.has(row.quote.trim().toLowerCase())) return { ok: false, reason: 'quote_low_signal' };
```

- [ ] **Step 7.4: Обновить промпт (Evidence Log rules, после L262)**

Добавить пункт:
```
- `exact_substring` ДОЛЖЕН быть ≥ 12 байт UTF-8 И не состоять из одного low-signal слова (`done`/`pending`/`none`/...). Слишком короткая/общая цитата → row отклоняется (quote_too_short / quote_low_signal). Цитируй ID + контекст, не голый статус.
```

- [ ] **Step 7.5: Проверить, что существующие fixtures не сломаны (их цитаты ≥12B)**

```bash
node tools/audit/verify-evidence-log.smoke.js 2>&1 | tail -5
```
Expected: `summary: PASS`. Если какой-то clean/pipe/wave-fixture теперь падает из-за короткой цитаты — удлинить цитату в этом fixture (test-data, опирался на слабую evidence) и повторить.

- [ ] **Step 7.6: Запустить — зелено**

```bash
node tools/audit/run-tests.js 2>&1 | grep -iE "M-5"
```
Expected: PASS.

- [ ] **Step 7.7: Commit**

```bash
git add .claude/runtime/verify-evidence-log.js .claude/agents/ccip-session-optimizer.md tools/audit/__tests__/verify-evidence-entropy.test.js tools/audit/__fixtures__/optimizer-output-m5-lowsignal.md
git commit -m "feat(optimizer-hook): minimum quote entropy + low-signal stop-list (M-5)"
```

---

### Task 8: Anchor-bound entailment — цитата в окне anchor, не в файле целиком (C-2)

**Files:**
- Modify: `.claude/runtime/verify-evidence-log.js` (new `anchorWindow` + интеграция в `verifyRowSource`; export)
- Modify: `.claude/agents/ccip-session-optimizer.md` (§Запреты + Evidence Log: anchor enforced)
- Modify: существующие fixtures с нереальными anchor'ами → реальные heading'и
- Modify: `tools/audit/__tests__/verify-evidence-internals.test.js` (юнит на anchorWindow)
- Create: `tools/audit/__tests__/verify-evidence-anchor.test.js`
- Create: `tools/audit/__fixtures__/optimizer-output-c2-anchor-{ok,bad}.md`

Сейчас verifier доказывает «строка есть где-то в файле», не «claim подтверждён в указанном месте». `anchor` был «документация, не enforcement». Делаем anchor enforced: цитата обязана лежать в окне между anchor-heading и следующим heading того же/высшего уровня (или в ±200 символах вокруг literal-локатора).

- [ ] **Step 8.1: Юнит-тест на anchorWindow (в internals)**

В `tools/audit/__tests__/verify-evidence-internals.test.js` добавить:
```js
test('anchorWindow: heading window bounds the slice to the section', () => {
  const content = [
    '# Top', 'intro line',
    '## Section A', 'alpha body', 'NEEDLE-A',
    '## Section B', 'beta body', 'NEEDLE-B',
  ].join('\n');
  const winA = mod.anchorWindow(content, '## Section A');
  assert.ok(winA.includes('NEEDLE-A'), 'window A contains its own needle');
  assert.ok(!winA.includes('NEEDLE-B'), 'window A must NOT leak into Section B');
});

test('anchorWindow: literal locator falls back to ±window', () => {
  const content = 'x'.repeat(500) + ' LOCATOR ' + 'y'.repeat(500);
  const win = mod.anchorWindow(content, 'LOCATOR');
  assert.ok(win.includes('LOCATOR'));
  assert.ok(win.length < content.length, 'literal window is narrower than whole file');
});

test('anchorWindow: unknown anchor returns null', () => {
  assert.strictEqual(mod.anchorWindow('## Real\nbody', 'no-such-anchor-xyz'), null);
});
```

- [ ] **Step 8.2: Запустить — падает (anchorWindow не существует)**

```bash
node tools/audit/run-tests.js 2>&1 | grep -iE "anchorWindow|fail"
```
Expected: FAIL.

- [ ] **Step 8.3: Реализовать anchorWindow + интеграцию**

В `verify-evidence-log.js` (рядом с extractors) добавить:
```js
/**
 * Slice the source content to the window addressed by `anchor`.
 * If anchor matches a markdown heading → window = heading .. next heading of same-or-higher level.
 * Else if anchor is a literal locator present in content → window = ±200 chars around it.
 * Else → null (anchor not found).
 */
function anchorWindow(content, anchor) {
  if (!anchor) return null;
  const wanted = anchor.replace(/^#+\s*/, '').trim();
  const lines = content.split(/\r?\n/);
  let headingIdx = -1, level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.*)$/);
    if (m && (m[2].trim() === wanted || lines[i].trim() === anchor.trim())) {
      headingIdx = i; level = m[1].length; break;
    }
  }
  if (headingIdx !== -1) {
    let end = lines.length;
    for (let i = headingIdx + 1; i < lines.length; i++) {
      const hm = lines[i].match(/^(#{1,6})\s/);
      if (hm && hm[1].length <= level) { end = i; break; }
    }
    return lines.slice(headingIdx, end).join('\n');
  }
  const idx = content.indexOf(anchor);
  if (idx === -1) return null;
  return content.slice(Math.max(0, idx - 200), idx + anchor.length + 200);
}
```
Добавить `anchorWindow` в `module.exports`.

В `verifyRowSource` ввести общую проверку окна. Создать локальный helper в конце функции и применить к обоим контентам (git и fs). Заменить два `return content.includes(row.quote) ? ...` на вызов:
```js
function checkInWindow(content, row) {
  if (!row.anchor || row.anchor.trim() === '' || /^n\/?a$/i.test(row.anchor.trim())) {
    return { ok: false, reason: 'anchor_required' };
  }
  const win = anchorWindow(content, row.anchor);
  if (win === null) return { ok: false, reason: 'anchor_not_found' };
  return win.includes(row.quote) ? { ok: true } : { ok: false, reason: 'quote_not_in_anchor_window' };
}
```
В git-ветке: `return checkInWindow(content, row);`
В fs-ветке: `return checkInWindow(content, row);`

> ⚠ `anchor` теперь обязателен и не может быть `n/a`. Это и есть смысл задачи (entailment вместо provenance).

- [ ] **Step 8.4: Обновить промпт — anchor enforced**

В §Запреты заменить строку про line-number-anchor контекст или добавить новый пункт:
```
- Evidence row с пустым / `n/a` / нерезолвящимся `anchor` ЗАПРЕЩЁН (C-2). `anchor` — heading-строка источника ИЛИ literal-локатор, реально присутствующий в файле; `exact_substring` обязан лежать в окне этого anchor'а, а не где угодно в файле. Reason: anchor_required / anchor_not_found / quote_not_in_anchor_window.
```
В Evidence Log Правила (L263) заменить:
```
- `anchor` — heading-строка или короткий локатор. Документация, не enforcement.
```
на:
```
- `anchor` — heading-строка источника или literal-локатор. **Enforced (C-2):** хук строит окно от anchor до следующего heading того же/высшего уровня (или ±200B вокруг literal-локатора) и проверяет `exact_substring` ВНУТРИ окна. Anchor обязателен; `n/a` запрещён.
```

- [ ] **Step 8.5: Создать ok/bad fixtures + тест**

Create `tools/audit/__fixtures__/optimizer-output-c2-anchor-ok.md` (цитата под своим heading'ом, `source_file: repo:CLAUDE.md`, anchor = реальный heading из CLAUDE.md, например `## Fast Path`, цитата = подстрока из этого раздела ≥12B).
Create `tools/audit/__fixtures__/optimizer-output-c2-anchor-bad.md` (тот же anchor `## Fast Path`, но `exact_substring` — реальная строка из ДРУГОГО раздела CLAUDE.md, напр. из `## Risk Rules`; substring в файле есть, но НЕ в окне anchor → должно падать `quote_not_in_anchor_window`).

> Перед написанием fixture — `grep` по CLAUDE.md, подобрать (heading, in-section-quote ≥12B) и (out-of-section-quote ≥12B). Команда подбора:
```bash
node tools/audit/run-tests.js >/dev/null 2>&1; grep -nE "^## |^### " CLAUDE.md | head -40
```

Create `tools/audit/__tests__/verify-evidence-anchor.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { setupTmp, teardown, runHook, latestSession } = require('../_lib/run-evidence-hook');

function fixture(name) { return fs.readFileSync(path.join(__dirname, '..', '__fixtures__', name), 'utf-8'); }

test('C-2: quote inside the anchor window verifies', () => {
  const tmp = setupTmp();
  try {
    runHook(fixture('optimizer-output-c2-anchor-ok.md'), tmp);
    assert.match(latestSession(tmp), /evidence_rows_verified: 1\/1/);
  } finally { teardown(tmp); }
});

test('C-2: quote present in file but outside the anchor window is rejected', () => {
  const tmp = setupTmp();
  try {
    runHook(fixture('optimizer-output-c2-anchor-bad.md'), tmp);
    assert.match(latestSession(tmp), /L2_EVIDENCE_ROW_1: quote_not_in_anchor_window/);
  } finally { teardown(tmp); }
});
```

- [ ] **Step 8.6: Обновить существующие fixtures под enforced-anchor**

Прогнать smoke; для каждого fixture, где anchor был `n/a`/нереальным локатором (`Phase 7 line` и т.п.), заменить anchor на реальный heading источника и/или подобрать цитату из соответствующей секции:
```bash
node tools/audit/verify-evidence-log.smoke.js 2>&1 | tail -20
```
Чинить по одному, пока не `summary: PASS`. (Это ожидаемый ripple C-2.)

- [ ] **Step 8.7: Запустить всё — зелено**

```bash
node tools/audit/run-tests.js 2>&1 | grep -iE "C-2|anchorWindow"
node tools/audit/verify-evidence-log.smoke.js 2>&1 | tail -3
```
Expected: anchor-тесты + anchorWindow юниты PASS; smoke `summary: PASS`.

- [ ] **Step 8.8: Commit**

```bash
git add .claude/runtime/verify-evidence-log.js .claude/agents/ccip-session-optimizer.md tools/audit/__tests__/verify-evidence-anchor.test.js tools/audit/__tests__/verify-evidence-internals.test.js tools/audit/__fixtures__/
git commit -m "feat(optimizer-hook): anchor-bound entailment verification (C-2)"
```

---

## Phase 3 — Manifest robustness + trust model

### Task 9: Замена hand-rolled YAML-парсера на js-yaml (M-4)

**Files:**
- Modify: `.claude/runtime/verify-evidence-log.js` (`parseManifest`/`parseValue` ~L136-169)
- Create: `tools/audit/__tests__/verify-evidence-manifest.test.js`

`parseManifest` поддерживает только flat key:value; richer YAML (inline list с запятой в пути, вложенность) молча теряется. `js-yaml` уже в deps.

- [ ] **Step 9.1: Падающий юнит-тест**

Create `tools/audit/__tests__/verify-evidence-manifest.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');
const mod = require(path.join(gitRoot(), '.claude/runtime/verify-evidence-log.js'));

test('M-4: parseManifest handles nested invariants block via js-yaml', () => {
  const yaml = [
    'invariants:',
    '  bootstrap_claims: 2',
    '  evidence_rows: 2',
    '  coverage: full',
    "  plan_files: ['docs/plans/a,b.md']",   // запятая в пути ломала старый split
  ].join('\n');
  const inv = mod.parseManifest(yaml);
  assert.strictEqual(inv.bootstrap_claims, 2);
  assert.strictEqual(inv.evidence_rows, 2);
  assert.deepStrictEqual(inv.plan_files, ['docs/plans/a,b.md']);
});
```

- [ ] **Step 9.2: Запустить — падает**

```bash
node tools/audit/run-tests.js 2>&1 | grep -iE "M-4|fail"
```
Expected: FAIL (старый парсер вернёт wrapper-flatten / разобьёт путь по запятой).

- [ ] **Step 9.3: Реализовать через js-yaml**

В импортах добавить `const yaml = require('js-yaml');`. Заменить `parseManifest` и `parseValue` целиком на:
```js
function parseManifest(yamlText) {
  if (!yamlText) return null;
  let doc;
  try { doc = yaml.load(yamlText); }
  catch { return null; }
  if (!doc || typeof doc !== 'object') return null;
  // v1: flat or wrapped under `invariants:`; v2 trust-split handled in Task 10.
  if (doc.invariants && typeof doc.invariants === 'object') return doc.invariants;
  return doc;
}
```
(`parseValue` больше не нужен; удалить и убрать из `module.exports`.)

- [ ] **Step 9.4: Запустить — зелено + smoke**

```bash
node tools/audit/run-tests.js 2>&1 | grep -iE "M-4"
node tools/audit/verify-evidence-log.smoke.js 2>&1 | tail -3
```
Expected: M-4 PASS; smoke `summary: PASS` (плоские манифесты парсятся идентично).

- [ ] **Step 9.5: Commit**

```bash
git add .claude/runtime/verify-evidence-log.js tools/audit/__tests__/verify-evidence-manifest.test.js
git commit -m "refactor(optimizer-hook): parse manifest with js-yaml (M-4)"
```

---

### Task 10: Manifest v2 — trust-split verified vs self_declared (M-3, M-10)

**Files:**
- Modify: `.claude/runtime/verify-evidence-log.js` (`extractManifestBlock` sentinel + `run()` чтение полей)
- Modify: `.claude/agents/ccip-session-optimizer.md` (§I — эмит v2)
- Modify: `tools/audit/__tests__/verify-evidence-manifest.test.js` (+v2 case)

`preflight_tokens/calls/coverage` — honor-system, но поданы как «hook проверяет». Вводим v2: `verified:{...}` (машинно-проверяемо) vs `self_declared:{...}` (декларация). Хук читает cardinality из verified, бюджеты из self_declared, и помечает self_declared как непроверенные в session-артефакте. Обратная совместимость с v1.

- [ ] **Step 10.1: Добавить v2-кейс в manifest-тест**

В `verify-evidence-manifest.test.js` добавить:
```js
test('M-3: parseManifest flattens v2 trust-split into a single invariants view', () => {
  const yaml = [
    'verified:',
    '  bootstrap_claims: 1',
    '  evidence_rows: 1',
    'self_declared:',
    '  preflight_tokens: 2900',
    '  coverage: full',
  ].join('\n');
  const inv = mod.parseManifest(yaml);
  assert.strictEqual(inv.bootstrap_claims, 1);
  assert.strictEqual(inv.evidence_rows, 1);
  assert.strictEqual(inv.preflight_tokens, 2900);
  assert.strictEqual(inv._self_declared_keys.includes('preflight_tokens'), true);
});
```

- [ ] **Step 10.2: Запустить — падает**

```bash
node tools/audit/run-tests.js 2>&1 | grep -iE "M-3|fail"
```
Expected: FAIL.

- [ ] **Step 10.3: Расширить sentinel + parseManifest для v2**

`extractManifestBlock` — принять оба sentinel'а:
```js
function extractManifestBlock(text) {
  const re = /```yaml\s+manifest=invariants-v[12]\s*\n([\s\S]*?)\n```/;
  const m = text.match(re);
  return m ? m[1].trim() : null;
}
```
В `parseManifest` (Task 9 версия) перед `return doc;` добавить обработку v2:
```js
  if (doc.verified && typeof doc.verified === 'object') {
    const flat = { ...doc.verified, ...(doc.self_declared || {}) };
    flat._self_declared_keys = Object.keys(doc.self_declared || {});
    return flat;
  }
```

- [ ] **Step 10.4: Пометить self_declared как непроверенные в session-артефакте**

В `run()`, где формируется `sessionBody`, добавить строку перед `'## Manifest'`:
```js
    inv && inv._self_declared_keys && inv._self_declared_keys.length
      ? `_self_declared (NOT verified by hook): ${inv._self_declared_keys.join(', ')}_\n`
      : '',
```

- [ ] **Step 10.5: Обновить §I промпта — эмит v2**

Заменить пример манифеста (L276-288) на:
```yaml manifest=invariants-v2
verified:                       # машинно-проверяется хуком
  bootstrap_claims: <N>
  evidence_rows: <N>            # ОБЯЗАНО == bootstrap_claims
  unverified_rows: 0            # ОБЯЗАНО == 0
verified_meta:
  trigger_match: 'exact:"<phrase>"'
  plan_files: ['<path>']
  state_memory_files: ['<path>']
self_declared:                  # honor-system; хук НЕ верифицирует, помечает как self_declared
  quarantined: <K>
  preflight_tokens: <≤3000>
  preflight_calls: <≤6>
  coverage: full                # full | partial
```
И в списке «Hook проверяет» добавить примечание:
```
8. Поля под `self_declared:` (preflight_tokens/calls, coverage, quarantined) НЕ верифицируются — фиксируются как декларация. Не выдавай их за проверенные.
```

> Sentinel остаётся обязателен; v1 по-прежнему принимается (backward-compat).

- [ ] **Step 10.6: Запустить — зелено + smoke**

```bash
node tools/audit/run-tests.js 2>&1 | grep -iE "M-3|M-4"
node tools/audit/verify-evidence-log.smoke.js 2>&1 | tail -3
```
Expected: PASS; smoke `summary: PASS` (v1-fixtures совместимы).

- [ ] **Step 10.7: Commit**

```bash
git add .claude/runtime/verify-evidence-log.js .claude/agents/ccip-session-optimizer.md tools/audit/__tests__/verify-evidence-manifest.test.js
git commit -m "feat(optimizer): manifest v2 trust-split verified vs self_declared (M-3, M-10)"
```

---

### Task 11: Surface malformed/skipped evidence rows (M-9)

**Files:**
- Modify: `.claude/runtime/verify-evidence-log.js` (`parseEvidenceRows` + `run()`)
- Create: `tools/audit/__tests__/verify-evidence-malformed.test.js`
- Create: `tools/audit/__fixtures__/optimizer-output-m9-malformed.md`

`parseEvidenceRows` молча пропускает rows с `<5` ячейками → они исчезают из `rows.length` и всплывают лишь как загадочный `L3_EVIDENCE_COUNT_DRIFT`. Считаем malformed и выдаём явный violation.

- [ ] **Step 11.1: Fixture + падающий тест**

Create `tools/audit/__fixtures__/optimizer-output-m9-malformed.md` — Evidence Log с одной валидной row и одной битой (3 колонки):
````markdown
## Session Optimization Report — 2026-05-25
нарушений не обнаружено

## Next-Session Bootstrap
1. **Context:** phase audit-hardening stage
<!-- bootstrap-integrity timestamp:2026-05-25 generated-by:ccip-session-optimizer -->

### Evidence Log

| # | claim_in_bootstrap | source_file | anchor | exact_substring (≤ 80B UTF-8, `|` → `\|`) |
|---|---|---|---|---|
| 1 | phase audit-hardening | repo:CLAUDE.md | ## Fast Path | <REAL ≥12B QUOTE FROM Fast Path> |
| 2 | broken row | only-three |

```yaml manifest=invariants-v1
invariants:
  bootstrap_claims: 1
  evidence_rows: 1
  unverified_rows: 0
  coverage: full
```
````
> Подставить реальную цитату из секции `## Fast Path` CLAUDE.md (≥12B) в row 1.

Create `tools/audit/__tests__/verify-evidence-malformed.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { setupTmp, teardown, runHook, latestSession } = require('../_lib/run-evidence-hook');

function fixture(name) { return fs.readFileSync(path.join(__dirname, '..', '__fixtures__', name), 'utf-8'); }

test('M-9: malformed (<5 col) evidence rows are surfaced explicitly', () => {
  const tmp = setupTmp();
  try {
    runHook(fixture('optimizer-output-m9-malformed.md'), tmp);
    assert.match(latestSession(tmp), /L3_MALFORMED_EVIDENCE_ROWS: 1/);
  } finally { teardown(tmp); }
});
```

- [ ] **Step 11.2: Запустить — падает**

```bash
node tools/audit/run-tests.js 2>&1 | grep -iE "M-9|MALFORMED|fail"
```
Expected: FAIL.

- [ ] **Step 11.3: Считать malformed в parseEvidenceRows**

Заменить `if (cells.length < 5) continue;` на:
```js
    if (cells.length < 5) { rows.malformed = (rows.malformed || 0) + 1; continue; }
```
(После создания `const rows = [];` добавить `rows.malformed = 0;`.)
В `run()` после `const rows = parseEvidenceRows(evidenceSec);` добавить:
```js
  if (rows.malformed > 0) {
    violations.push(`L3_MALFORMED_EVIDENCE_ROWS: ${rows.malformed}`);
  }
```

- [ ] **Step 11.4: Запустить — зелено + smoke**

```bash
node tools/audit/run-tests.js 2>&1 | grep -iE "M-9"
node tools/audit/verify-evidence-log.smoke.js 2>&1 | tail -3
```
Expected: M-9 PASS; smoke `summary: PASS` (placeholder-row по-прежнему skip'ается отдельной веткой, не считается malformed).

- [ ] **Step 11.5: Commit**

```bash
git add .claude/runtime/verify-evidence-log.js tools/audit/__tests__/verify-evidence-malformed.test.js tools/audit/__fixtures__/optimizer-output-m9-malformed.md
git commit -m "feat(optimizer-hook): surface malformed evidence rows (M-9)"
```

---

## Phase 4 — Honest enforcement (⚠ behavioral change)

> **DECISION GATE.** Task 12 меняет инвариант «хук никогда не блокирует родителя» (`verify-evidence-log.js:18`). Перед стартом подтвердить:
> **(A) feedback-loop (рекомендуется)** — на violations хук эмитит `decision: block` + reason → родитель видит нарушения и может перевыпустить optimizer.
> **(B) advisory-only** — оставить как есть (только лог); пропустить Task 12, оставить Task 13.
> Реализуем (A). Внутренние ошибки (Task 6) НЕ блокируют — только content-violations.

### Task 12: PostToolUse violation feedback-loop (C-1 hard-fix)

**Files:**
- Modify: `.claude/runtime/verify-evidence-log.js` (`run()` — emit decision на violations)
- Modify: `.claude/agents/ccip-session-optimizer.md` (честная формулировка о feedback-loop)
- Modify: `tools/audit/verify-evidence-log.smoke.js` (+case: stdout decision)

- [ ] **Step 12.1: Расширить smoke — проверить decision-вывод на mixed fixture**

В `verify-evidence-log.smoke.js`, в конце case 1 (`mixed fixture`), после существующих `expectIncludes`, добавить:
```js
    expectIncludes('case1: stdout carries block decision', r.stdout, '"decision"');
    expectIncludes('case1: block reason lists violations', r.stdout, 'failed verification');
```
И в case 2 (`clean fixture`) добавить:
```js
    expectNotIncludes('clean: no block decision emitted', r.stdout, '"decision"');
```

- [ ] **Step 12.2: Запустить smoke — убедиться, что новые проверки падают**

```bash
node tools/audit/verify-evidence-log.smoke.js 2>&1 | grep -iE "decision|FAIL"
```
Expected: FAIL по новым assertions (хук ничего не пишет в stdout).

- [ ] **Step 12.3: Реализовать decision-эмит**

В `run()`, в финальном `if (violations.length) { ... }` блоке, перед `process.stderr.write(...)` добавить:
```js
    const reason =
      `ccip-session-optimizer output failed verification (${violations.length}):\n` +
      violations.map(v => `- ${v}`).join('\n') +
      `\nRe-run the optimizer; cite only anchor-bound, byte-exact evidence (see §Запреты).`;
    process.stdout.write(JSON.stringify({ decision: 'block', reason }));
```
> Внутренние ошибки (Task 6 catch) decision НЕ эмитят — родитель не падает на сбое верификатора.

- [ ] **Step 12.4: Обновить промпт — честная enforcement-семантика**

В §Persistence / §Правила работы добавить (или заменить interim-формулировку из Task 1):
```
При нарушениях хук возвращает родителю `decision: block` со списком violations — тебя могут вызвать повторно с этим reason. Это НЕ self-attestation: проверку делает хук, не ты. Внутренний сбой верификатора родителя не блокирует (VERIFIER_ERROR-маяк).
```

- [ ] **Step 12.5: Запустить smoke + node:test — зелено**

```bash
node tools/audit/verify-evidence-log.smoke.js 2>&1 | tail -3
node tools/audit/run-tests.js 2>&1 | tail -3
```
Expected: smoke `summary: PASS`; node:test всё зелено.

- [ ] **Step 12.6: Commit**

```bash
git add .claude/runtime/verify-evidence-log.js .claude/agents/ccip-session-optimizer.md tools/audit/verify-evidence-log.smoke.js
git commit -m "feat(optimizer-hook): PostToolUse violation feedback-loop (C-1)"
```

---

### Task 13: PreToolUse single-flight gate (C-4)

**Files:**
- Create: `.claude/runtime/optimizer-gate.js`
- Modify: `.claude/settings.json` (PreToolUse block)
- Modify: `.claude/agents/ccip-session-optimizer.md` (§R — lock теперь enforced gate'ом)
- Create: `tools/audit/__tests__/optimizer-gate.test.js`

Re-entrancy сейчас honor-system: §R инструктирует агента, но проверки до запуска нет (TOCTOU). PreToolUse-gate реально проверяет lock и `deny`-ит повторный вход в окне TTL.

- [ ] **Step 13.1: Падающий тест на gate**

Create `tools/audit/__tests__/optimizer-gate.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { gitRoot } = require('../_lib/git-root');

const GATE = path.join(gitRoot(), '.claude/runtime/optimizer-gate.js');

function runGate(lockFile, turnId) {
  const payload = { tool_name: 'Agent', tool_input: { subagent_type: 'ccip-session-optimizer' }, turn_id: turnId };
  return cp.spawnSync(process.execPath, [GATE], {
    input: JSON.stringify(payload), encoding: 'utf8',
    env: { ...process.env, OPT_LOCK_FILE: lockFile },
  });
}

test('C-4: first invocation allowed + writes lock; second (live lock, diff turn) denied', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccip-gate-'));
  const lock = path.join(tmp, 'optimizer.lock');
  try {
    const r1 = runGate(lock, 'turn-1');
    assert.ok(fs.existsSync(lock), 'gate must write the lock on first pass');
    assert.doesNotMatch(r1.stdout || '', /"permissionDecision":"deny"/);

    const r2 = runGate(lock, 'turn-2');
    assert.match(r2.stdout || '', /"permissionDecision":"deny"/, 'second invocation within TTL must be denied');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('C-4: non-optimizer Agent calls pass through untouched', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccip-gate-'));
  const lock = path.join(tmp, 'optimizer.lock');
  try {
    const payload = { tool_name: 'Agent', tool_input: { subagent_type: 'ccip-architect' }, turn_id: 'x' };
    const r = cp.spawnSync(process.execPath, [GATE], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, OPT_LOCK_FILE: lock } });
    assert.ok(!fs.existsSync(lock), 'gate must not lock for non-optimizer agents');
    assert.doesNotMatch(r.stdout || '', /deny/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
```

- [ ] **Step 13.2: Запустить — падает (gate не существует)**

```bash
node tools/audit/run-tests.js 2>&1 | grep -iE "C-4|optimizer-gate|fail"
```
Expected: FAIL (`Cannot find module .../optimizer-gate.js`).

- [ ] **Step 13.3: Реализовать gate**

Create `.claude/runtime/optimizer-gate.js`:
```js
#!/usr/bin/env node
/**
 * PreToolUse gate — single-flight для ccip-session-optimizer.
 * Deny при живом lock'е (ts < TTL, иной turn_id). Иначе пишет lock и allow.
 * Внутренняя ошибка → allow (fail-open: не ломаем легитимный запуск).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const LOCK_FILE = process.env.OPT_LOCK_FILE || path.join(ROOT, '.claude/runtime/optimizer.lock');
const TTL_MS = parseInt(process.env.OPT_LOCK_TTL_MS || '300000', 10); // 5 min

function out(obj) { process.stdout.write(JSON.stringify(obj)); }
function allow() { /* пустой вывод = pass-through */ }
function deny(reason) {
  out({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });
}

let raw = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', c => { raw += c; });
process.stdin.on('end', () => {
  try {
    const p = JSON.parse(raw);
    if (p.tool_name !== 'Agent' || p.tool_input?.subagent_type !== 'ccip-session-optimizer') { allow(); return process.exit(0); }
    const turnId = String(p.turn_id ?? 'unknown');

    if (fs.existsSync(LOCK_FILE)) {
      try {
        const lock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf-8'));
        const age = Date.now() - new Date(lock.ts).getTime();
        if (age < TTL_MS && lock.turn_id !== turnId) {
          deny(`optimizer already ran this session (lock @ ${lock.ts}); skipping re-entry`);
          return process.exit(0);
        }
      } catch {
        deny('optimizer.lock corrupt — manual recovery required (see §R)');
        return process.exit(0);
      }
    }
    fs.writeFileSync(LOCK_FILE, JSON.stringify({ ts: new Date().toISOString(), turn_id: turnId }));
    allow();
  } catch (e) {
    process.stderr.write(`[optimizer-gate] ${e.message}\n`);
    allow(); // fail-open
  }
  process.exit(0);
});
```

- [ ] **Step 13.4: Зарегистрировать gate в settings.json**

В `.claude/settings.json` добавить блок `PreToolUse` (рядом с существующим `PostToolUse`):
```json
    "PreToolUse": [
      {
        "matcher": "Agent",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/runtime/optimizer-gate.js"
          }
        ]
      }
    ],
```

- [ ] **Step 13.5: Обновить §R промпта — lock enforced gate'ом**

В начало §R добавить:
```
Lock теперь enforced PreToolUse-gate'ом (`.claude/runtime/optimizer-gate.js`): повторный вход в окне TTL/иного turn'а отклоняется (deny) ДО твоего запуска. Шаги ниже — твоя сторона контракта; даже при их пропуске gate не даст двойного исполнения.
```

- [ ] **Step 13.6: Запустить — зелено**

```bash
node tools/audit/run-tests.js 2>&1 | grep -iE "C-4"
```
Expected: оба C-4 теста PASS.

- [ ] **Step 13.7: Commit**

```bash
git add .claude/runtime/optimizer-gate.js .claude/settings.json .claude/agents/ccip-session-optimizer.md tools/audit/__tests__/optimizer-gate.test.js
git commit -m "feat(optimizer): PreToolUse single-flight gate enforces re-entrancy (C-4)"
```

---

## Phase 5 — Maintainability + token economy

### Task 14: Вынести Wave-историю + FIREWALL-коды в CHANGELOG, ужать промпт (M-8)

**Files:**
- Create: `.claude/runtime/verify-evidence-log.CHANGELOG.md`
- Modify: `.claude/agents/ccip-session-optimizer.md` (свернуть Wave-парентезы)

Промпт несёт hook-implementation detail (Wave 2–7, FIREWALL_*-коды, legacy `## Bootstrap`-миграции) — это для maintainer'а, не для исполнителя. Переносим историю в CHANGELOG, в промпте оставляем одно-строчные ссылки.

- [ ] **Step 14.1: Создать CHANGELOG**

Create `.claude/runtime/verify-evidence-log.CHANGELOG.md` со сводкой Wave 1–7 (перенести описания из текущих парентезов промпта L160-171 + hook-комментариев) и таблицей FIREWALL-кодов (`FIREWALL_BOOTSTRAP_MISSING/SELF_ATTEST/WORDCOUNT/BRANCH_DRIFT/SHA_NOT_FOUND`, L1/L2/L3-коды) с указанием места enforcement.

- [ ] **Step 14.2: Свернуть Wave-детали в промпте**

В §Запреты заменить многострочные Wave-парентезы (L160-169) на компактные правила без Wave-номеров и кодов, добавив в конец каждого: `(история и коды — verify-evidence-log.CHANGELOG.md)`. Содержательные запреты сохранить; убрать только археологию (`Wave N:`, имена FIREWALL-кодов, legacy `## Bootstrap`-fallback пояснения).

- [ ] **Step 14.3: Проверки — промпт валиден, тесты зелены**

```bash
node tools/audit/run-tests.js 2>&1 | tail -3
node tools/audit/verify-evidence-log.smoke.js 2>&1 | tail -3
```
Expected: всё PASS (поведение хука не менялось; правки только в тексте промпта).

- [ ] **Step 14.4: Commit**

```bash
git add .claude/runtime/verify-evidence-log.CHANGELOG.md .claude/agents/ccip-session-optimizer.md
git commit -m "docs(optimizer): extract Wave history + FIREWALL codes to CHANGELOG (M-8)"
```

---

### Task 15: Externalize skill-extraction markers в side-car (token economy)

**Files:**
- Create: `.claude/agents/ccip-session-optimizer.extraction-map.md`
- Modify: `.claude/agents/ccip-session-optimizer.md` (удалить inline `<!-- portable/config/project -->` маркеры)
- Create: `tools/audit/__tests__/optimizer-prompt-lean.test.js`

~40+ inline-комментариев `<!-- portable/config/project -->` модель читает каждый запуск, хотя L14 велит игнорировать → token-pressure + attention fragmentation. Переносим карту маркеров в side-car, сам промпт чистим.

- [ ] **Step 15.1: Падающий guard-тест**

Create `tools/audit/__tests__/optimizer-prompt-lean.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const PROMPT = path.join(root, '.claude/agents/ccip-session-optimizer.md');
const MAP = path.join(root, '.claude/agents/ccip-session-optimizer.extraction-map.md');

test('token-economy: prompt carries no inline skill-extraction markers', () => {
  const src = fs.readFileSync(PROMPT, 'utf-8');
  const markers = src.match(/<!--\s*(portable|config|project)[\s:]/g) || [];
  assert.strictEqual(markers.length, 0, `found ${markers.length} inline markers; move them to the extraction-map`);
});

test('token-economy: extraction-map side-car exists', () => {
  assert.ok(fs.existsSync(MAP), 'extraction-map.md must capture marker boundaries');
});
```

- [ ] **Step 15.2: Запустить — падает**

```bash
node tools/audit/run-tests.js 2>&1 | grep -iE "token-economy|markers|fail"
```
Expected: FAIL (промпт полон маркеров; side-car нет).

- [ ] **Step 15.3: Создать side-car карту**

Create `.claude/agents/ccip-session-optimizer.extraction-map.md`: таблица `секция промпта → portable | config:<KEY> | project:<WHAT>`, перенеся семантику из удаляемых маркеров (это сохраняет forward-looking метаданные для будущего skill-extract).

- [ ] **Step 15.4: Удалить inline-маркеры из промпта**

Удалить все строки/обёртки `<!-- portable ... -->`, `<!-- config ... -->`, `<!-- project ... -->`, `<!-- /portable -->`, `<!-- /config -->` и SKILL-EXTRACTION-блок (L9-16). Содержательный текст инструкций сохранить дословно — убираются только comment-обёртки. В шапке оставить одну строку-ссылку: `<!-- skill-extraction map: ccip-session-optimizer.extraction-map.md -->`.

- [ ] **Step 15.5: Запустить — зелено + проверить frontmatter-аудит**

```bash
node tools/audit/run-tests.js 2>&1 | grep -iE "token-economy|frontmatter"
node tools/audit/verify-evidence-log.smoke.js 2>&1 | tail -3
```
Expected: lean-тесты PASS; frontmatter-аудит PASS; smoke `summary: PASS`.

- [ ] **Step 15.6: Commit**

```bash
git add .claude/agents/ccip-session-optimizer.md .claude/agents/ccip-session-optimizer.extraction-map.md tools/audit/__tests__/optimizer-prompt-lean.test.js
git commit -m "refactor(optimizer): externalize skill-extraction markers to side-car (token economy)"
```

---

## Phase 6 — Acceptance

### Task 16: Полная приёмка + регистрация в errors-log

**Files:**
- (verify only) весь набор

- [ ] **Step 16.1: Полный node:test + smoke + audit-suite**

```bash
node tools/audit/run-tests.js 2>&1 | tail -5
node tools/audit/verify-evidence-log.smoke.js 2>&1 | tail -3
pnpm audit-suite 2>&1 | tail -10
```
Expected: node:test — все PASS; smoke — `summary: PASS`; audit-suite — без regressions.

- [ ] **Step 16.2: Дымовой прогон реального триггера (manual)**

В отдельной сессии прогнать `Завершаем сессию` и убедиться: (1) gate пишет lock, повторный вызов deny; (2) при искусственном нарушении (битый source_file) хук эмитит `decision: block`; (3) `session-opt-index.md` получает строку; (4) при `OPT_FORCE_FAULT=1` — VERIFIER_ERROR-маяк.

- [ ] **Step 16.3: Финальный commit + сводка**

```bash
git add -A
git status   # ожидается чисто
git log --oneline chore/session-optimizer-hardening-2026-05-25 ^main
git commit -m "chore(optimizer): hardening acceptance — C-1..C-5, M-1..M-10" --allow-empty
```

- [ ] **Step 16.4: PR (по запросу пользователя)**

Создавать PR только после явного согласия пользователя.

---

## Self-Review

**1. Spec coverage (audit ID → Task):**

| Audit finding | Severity | Task |
|---|---|---|
| C-1 contract lie (reject vs non-blocking) | CRITICAL | 1 (framing) + 12 (feedback-loop) |
| C-2 evidence ≠ entailment (substring anywhere) | CRITICAL | 8 |
| C-3 git command injection | CRITICAL | 3 |
| C-4 re-entrancy honor-system | HIGH | 13 |
| C-5 silent verifier failure | HIGH | 6 |
| M-1 path traversal / no confinement | MEDIUM | 4 |
| M-2 «байт-в-байт» терминология | MEDIUM | 1 |
| M-3 honor-system поля как verified | MEDIUM | 10 |
| M-4 brittle hand-rolled YAML | MEDIUM | 9 |
| M-5 no minimum quote specificity | MEDIUM | 7 |
| M-6 execSync без timeout | MEDIUM | 5 |
| M-7 canonical heading ambiguity | MEDIUM | 1 |
| M-8 Wave-седимент / maintainability | MEDIUM | 14 |
| M-9 placeholder/malformed skip masks errors | LOW→MED | 11 |
| M-10 unverified_rows self-declared | LOW | 10 (trust-split) |
| token economy hotspots (§9 отчёта) | — | 14, 15 |
| testability/observability (§ blueprint) | — | 2 (module-ify) |

Все находки покрыты. Gap отсутствует.

**2. Placeholder scan:** Реальные команды/код во всех шагах. Единственные намеренные «подставь значение» — реальные цитаты из CLAUDE.md в Task 8/11 fixtures (нельзя зафиксировать без актуального содержимого файла); снабжены grep-командой подбора и явным критерием (≥12B, из нужной секции). Это data-зависимость, не code-placeholder.

**3. Type/identifier consistency:**
- Reason-коды единообразны и используются и в тестах, и в коде: `git_show_fail`, `git_path_invalid`, `path_escape`, `quote_too_short`, `quote_low_signal`, `anchor_required`, `anchor_not_found`, `quote_not_in_anchor_window`, `L3_MALFORMED_EVIDENCE_ROWS`, `VERIFIER_ERROR`.
- `anchorWindow(content, anchor)` — сигнатура совпадает в Task 8 реализации, юнит-тестах и интеграции.
- `parseManifest` возвращает плоский объект инвариантов и в Task 9 (v1), и в Task 10 (v2 → `_self_declared_keys`); потребители в `run()` читают `.bootstrap_claims/.evidence_rows/.preflight_*` одинаково.
- Shared helper `run-evidence-hook.js` (`setupTmp/teardown/runHook/latestSession`) с идентичной сигнатурой используется в Task 3,4,6,7,8,11.
- Env-ключи: `OPT_FORCE_FAULT` (Task 6), `OPT_MIN_QUOTE_BYTES` (7), `OPT_MEMORY_ROOTS` (4), `OPT_LOCK_FILE`/`OPT_LOCK_TTL_MS` (13) — каждый объявлен там, где читается.
- Manifest sentinel `manifest=invariants-v[12]` принимает обе версии (Task 10), v1-fixtures backward-compatible.

**Sequencing note:** Task 2 (module-ify) — обязательный предшественник юнит-тестов Task 8/9/10. Task 9 (js-yaml) предшествует Task 10 (v2). Task 8 (anchor) — наиболее ripple-heavy: обновляет промпт + существующие fixtures; ревизовать особенно внимательно.
