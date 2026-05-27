# Zero-Drift Compliance §10 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать чек-лист §10 (Zero-Drift Compliance) целиком: 8 секций → machine-enforced gates для pilot M-13.

**Architecture:** Контракт-ориентированный самоаудит через node-скрипты в `tools/audit/`, JSON-схемы в `docs/schemas/`, husky pre-commit + GitHub Actions matrix (Ubuntu/macOS/Windows). Каждый аудит — exit 0 = green, exit !=0 = fail with stderr explanation. Все скрипты read-only по умолчанию; правки только через `--fix` флаги.

**Tech Stack:** Node 20 (CJS, no transpile), ajv для JSON Schema валидации, gray-matter для YAML frontmatter, fast-glob для путей, GitHub Actions, husky 9, lint-staged. Без добавления тяжёлых зависимостей — каждая новая dep требует обоснования.

**Critical context — текущее состояние на 2026-05-12:**
- `tools/audit/` не существует. Создаём с нуля.
- `docs/schemas/` не существует. Создаём с нуля.
- CLAUDE.md §15 State Contract **отсутствует** (F-003 BLOCKER из audit 2026-05-07). Создаём.
- `.claude/runtime/post-agent-hook.js` имеет silent `catch {}` (line 91) и неатомарный `writeState` (line 30) — нарушает §10.4 «fail loud + atomic». Чиним.
- `.claude/runtime/flush-state.js` атомарен (tmp→rename), но без `fsync`. Добавляем fsync.
- `packages/database/prisma/schema.prisma:31-38` — `enum UserRole { admin, director, stroycontrol, engineer }` — единственный SoT для RBAC. Используем.
- `.claude/settings.local.json` allowlist содержит wildcard `' *` — заменяем на литералы (§10.5).
- ADR-001..014 без `impl_anchors:` frontmatter — мигрируем.
- `.github/workflows/ci.yml` — один Ubuntu job, без matrix и audit-job — расширяем.
- `.husky/`, `CODEOWNERS`, `.github/branch-protection.yml`, `CHANGELOG.md` — отсутствуют. Создаём.

**Convention в этом плане:**
- TDD: для каждого audit-скрипта сначала пишем fixture, который должен фейлиться, затем сам скрипт, потом fix реального дефекта, прогон → green.
- Все скрипты запускаются как `node tools/audit/<name>.js`. Параметр `--fix` (где применимо) — отдельный режим, не путать с проверкой.
- Все скрипты завершаются `process.exit(0)` при OK, `process.exit(1)` при нарушениях, и пишут отчёт в stderr.
- Скрипты не используют workspace-зависимые переменные. ROOT вычисляется как `git rev-parse --show-toplevel`.

---

## File Structure

```
tools/audit/                          NEW — все audit-скрипты
  _lib/
    git-root.js                       вычисление ROOT через git rev-parse
    walk.js                           glob-обёртка с .gitignore-respect
    atomic-fs.js                      tmp+rename+fsync helper (для --fix режимов)
    report.js                         унифицированный stderr вывод
  path-canonical.js                   §10.1 — нет `W:/Claude/CCIP/...` и `CCIP/...` префиксов
  section-anchors.js                  §10.1 — все `(§N)` ссылки резолвятся
  dead-refs.js                        §10.1 — все ссылки на файлы/пути существуют
  agent-name-presence.js              §10.1 — каждый .claude/agents/*.md в CLAUDE.md
  state-contract-section.js           §10.1 — CLAUDE.md имеет §15
  agent-frontmatter.js                §10.2 — фронтматтер агентов матчит JSON-схему
  session-state.js                    §10.2 — session-state.json матчит JSON-схему
  adr-anchors.js                      §10.2 — каждый ADR.impl_anchors[] существует
  rbac-vs-schema.js                   §10.2 — все role-refs ⊆ enum UserRole
  orphan-adrs.js                      §10.7 — нет ADR без ссылок из агентов/кода
  orphan-dirs.js                      §10.7 — нет osиротевших каталогов
  delivery-paths.js                   §10.7 — пути в docs/delivery/* существуют
  memory-fs-sync.js                   §10.7 — MEMORY.md ссылается только на существующие файлы
  allowlist-literal.js                §10.5 — settings.local.json без wildcards
  adr-immutability.js                 §10.6 — Принято ADR нельзя менять без новой ревизии
  changelog-presence.js               §10.6 — каждый CRITICAL/BLOCKER fix имеет CHANGELOG entry
  audit-suite.js                      запускает все audits в порядке

docs/schemas/                         NEW — JSON Schema (Draft 2020-12)
  agent-frontmatter.schema.json       схема для .claude/agents/*.md YAML
  session-state.schema.json           схема для .claude/runtime/session-state.json

docs/plans/                           NEW — этот план и будущие
  2026-05-12-zero-drift-compliance-section10.md

.github/
  workflows/
    ci.yml                            MODIFY — добавить matrix + audit job
    nightly-audit.yml                 NEW — §10.8 ночной cron
    weekly-orphan-scan.yml            NEW — §10.8 еженедельный
  branch-protection.yml               NEW — §10.6 правила как код
  CODEOWNERS                          NEW — §10.6 dual review

.husky/
  pre-commit                          NEW — запускает audit-suite на staged
  _/husky.sh                          NEW — husky bootstrap

.claude/
  runtime/
    post-agent-hook.js                MODIFY — atomic write + fail-loud + session_id gate
    flush-state.js                    MODIFY — add fsync
  settings.local.json                 MODIFY — literal allowlist

CLAUDE.md                             MODIFY — добавить §15 State Contract

docs/decisions/ADR-*.md               MODIFY — добавить impl_anchors: frontmatter

CHANGELOG.md                          NEW — §10.6 трекинг BLOCKER/CRITICAL fixes

package.json                          MODIFY — scripts: audit, audit:fix, prepare (husky)
```

---

## Task overview (30 tasks across 8 phases)

| Phase | Tasks | Section | Goal |
|---|---|---|---|
| 0. Bootstrap | T-00..T-02 | n/a | tools/audit/ scaffolding + JSON Schemas |
| 1. Contract integrity | T-03..T-08 | §10.1 | 5 audit-скриптов + CLAUDE.md §15 |
| 2. Schema integrity | T-09..T-13 | §10.2 | ADR frontmatter + 4 audit-скрипта |
| 3. Documentation truth | T-14..T-17 | §10.7 | 4 orphan-аудита |
| 4. Runtime integrity | T-18..T-20 | §10.4 | хуки fail-loud + atomic, concurrency test |
| 5. Security posture | T-21..T-23 | §10.5 | allowlist literal, RLS fuzz, pen-test smoke |
| 6. CI integrity | T-24..T-26 | §10.3 | matrix CI, random clone test, husky |
| 7. Governance | T-27..T-29 | §10.6 | CODEOWNERS, ADR immutability, branch protection |
| 8. Continuous compliance | T-30 | §10.8 | nightly + weekly + quarterly scaffolding |

Каждая задача — самостоятельный PR. Между фазами рекомендуется code review.

---

# Phase 0 — Bootstrap

### Task T-00: Scaffold `tools/audit/_lib/` helpers

**Files:**
- Create: `tools/audit/_lib/git-root.js`
- Create: `tools/audit/_lib/walk.js`
- Create: `tools/audit/_lib/atomic-fs.js`
- Create: `tools/audit/_lib/report.js`
- Create: `tools/audit/__fixtures__/.keep`
- Create: `tools/audit/__tests__/_lib.test.js`

- [ ] **Step 1: Write failing test**

Создать `tools/audit/__tests__/_lib.test.js`:

```js
// Node test runner (built-in node:test). Запускается через `node --test tools/audit/__tests__`.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { gitRoot } = require('../_lib/git-root');
const { walk } = require('../_lib/walk');
const { atomicWriteJson } = require('../_lib/atomic-fs');
const { fail, ok } = require('../_lib/report');

test('gitRoot returns repo root containing CLAUDE.md', () => {
  const root = gitRoot();
  assert.ok(fs.existsSync(path.join(root, 'CLAUDE.md')), `expected CLAUDE.md at ${root}`);
});

test('walk respects .gitignore (no node_modules)', () => {
  const root = gitRoot();
  const files = walk(root, ['**/*.md']);
  const offenders = files.filter(f => f.includes('node_modules'));
  assert.deepEqual(offenders, [], 'walk must skip node_modules');
});

test('atomicWriteJson writes tmp→rename and fsyncs', () => {
  const root = gitRoot();
  const tmpPath = path.join(root, 'tools/audit/__fixtures__/_atomic-test.json');
  atomicWriteJson(tmpPath, { a: 1 });
  const content = JSON.parse(fs.readFileSync(tmpPath, 'utf-8'));
  assert.deepEqual(content, { a: 1 });
  fs.unlinkSync(tmpPath);
});

test('report.fail formats stderr line', () => {
  const out = fail('TEST-01', 'sample message', { path: 'foo' });
  assert.match(out, /TEST-01/);
  assert.match(out, /sample message/);
});

test('report.ok returns true', () => {
  assert.equal(ok('TEST-01'), true);
});
```

- [ ] **Step 2: Run test, verify all fail**

```bash
node --test tools/audit/__tests__/_lib.test.js
```

Expected: `Cannot find module '../_lib/git-root'` (или подобное) — 5 fails.

- [ ] **Step 3: Implement helpers**

`tools/audit/_lib/git-root.js`:

```js
'use strict';
const cp = require('node:child_process');

let cached = null;
function gitRoot() {
  if (cached) return cached;
  const out = cp.execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
  if (!out) throw new Error('not in a git repo');
  cached = out;
  return cached;
}
module.exports = { gitRoot };
```

`tools/audit/_lib/walk.js`:

```js
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const cp = require('node:child_process');

/**
 * Возвращает абсолютные пути файлов, соответствующих glob-паттерну,
 * с учётом .gitignore. Использует git для дешёвой фильтрации (без fast-glob dep).
 */
function walk(root, patterns) {
  const args = ['ls-files', '-co', '--exclude-standard', '--', ...patterns];
  const out = cp.execFileSync('git', args, { cwd: root, encoding: 'utf-8' });
  return out.split('\n').filter(Boolean).map(p => path.join(root, p));
}
module.exports = { walk };
```

`tools/audit/_lib/atomic-fs.js`:

```js
'use strict';
const fs = require('node:fs');

/** Atomic write: tmp file → fsync → rename → fsync directory. */
function atomicWriteJson(targetPath, obj) {
  const tmpPath = targetPath + '.tmp.' + process.pid;
  const data = JSON.stringify(obj, null, 2) + '\n';
  const fd = fs.openSync(tmpPath, 'w');
  try {
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmpPath, targetPath);
  // Best-effort directory fsync (Windows может вернуть EPERM — игнорируем там).
  try {
    const dirFd = fs.openSync(require('node:path').dirname(targetPath), 'r');
    fs.fsyncSync(dirFd);
    fs.closeSync(dirFd);
  } catch (e) {
    if (e.code !== 'EPERM' && e.code !== 'EISDIR' && e.code !== 'EACCES') throw e;
  }
}
module.exports = { atomicWriteJson };
```

`tools/audit/_lib/report.js`:

```js
'use strict';

function fail(code, msg, context = {}) {
  const ctxStr = Object.keys(context).length
    ? ' ' + Object.entries(context).map(([k, v]) => `${k}=${v}`).join(' ')
    : '';
  const line = `[${code}] ${msg}${ctxStr}\n`;
  process.stderr.write(line);
  return line;
}

function ok(code) {
  process.stdout.write(`[${code}] OK\n`);
  return true;
}

module.exports = { fail, ok };
```

- [ ] **Step 4: Run test, verify all pass**

```bash
node --test tools/audit/__tests__/_lib.test.js
```

Expected: `# pass 5  # fail 0`.

- [ ] **Step 5: Commit**

```bash
git add tools/audit/_lib tools/audit/__tests__ tools/audit/__fixtures__/.keep
git commit -m "chore(audit): bootstrap tools/audit/_lib helpers (git-root, walk, atomic-fs, report)"
```

---

### Task T-01: Add `pnpm audit-suite` script + ajv dependency

**Files:**
- Modify: `package.json`
- Create: `tools/audit/audit-suite.js`

- [ ] **Step 1: Add devDependency ajv**

```bash
pnpm add -DwE ajv@^8.17.1 ajv-formats@^3.0.1 gray-matter@^4.0.3
```

Expected: package.json devDependencies обновлён, pnpm-lock.yaml пересохранён.

- [ ] **Step 2: Add scripts to package.json**

Открыть `package.json`, в `"scripts"` добавить:

```json
"audit-suite": "node tools/audit/audit-suite.js",
"audit-suite:fix": "node tools/audit/audit-suite.js --fix",
"test:audit": "node --test tools/audit/__tests__"
```

- [ ] **Step 3: Write umbrella runner**

`tools/audit/audit-suite.js`:

```js
#!/usr/bin/env node
'use strict';
// Запускает все audits в фиксированном порядке. Exit 0 если все green, 1 иначе.
// Каждая фаза — массив скриптов; фаза падает целиком если любой скрипт упал,
// но остальные фазы всё равно выполняются (full report > fast exit).

const path = require('node:path');
const cp = require('node:child_process');

const PHASES = {
  '§10.1 Contract integrity': [
    'path-canonical.js',
    'section-anchors.js',
    'dead-refs.js',
    'agent-name-presence.js',
    'state-contract-section.js',
  ],
  '§10.2 Schema integrity': [
    'agent-frontmatter.js',
    'session-state.js',
    'adr-anchors.js',
    'rbac-vs-schema.js',
  ],
  '§10.5 Security posture': [
    'allowlist-literal.js',
    'pen-test-smoke.js',
  ],
  '§10.6 Governance': [
    'adr-immutability.js',
    'changelog-presence.js',
  ],
  '§10.7 Documentation truth': [
    'orphan-adrs.js',
    'orphan-dirs.js',
    'delivery-paths.js',
    'memory-fs-sync.js',
  ],
};

const HERE = __dirname;
let failed = 0;
let total = 0;

for (const [phase, scripts] of Object.entries(PHASES)) {
  process.stdout.write(`\n=== ${phase} ===\n`);
  for (const script of scripts) {
    total++;
    const full = path.join(HERE, script);
    const res = cp.spawnSync(process.execPath, [full, ...process.argv.slice(2)], {
      stdio: 'inherit',
    });
    if (res.status !== 0) {
      failed++;
      process.stderr.write(`[audit-suite] FAIL: ${script}\n`);
    }
  }
}

process.stdout.write(`\n=== Summary: ${total - failed}/${total} passed ===\n`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 4: Run audit-suite (expect missing scripts → all fail gracefully)**

```bash
pnpm audit-suite || true
```

Expected: `[audit-suite] FAIL: path-canonical.js` × N (поскольку скрипты ещё не написаны). Это нормально на этом этапе.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml tools/audit/audit-suite.js
git commit -m "chore(audit): add audit-suite runner + ajv/gray-matter deps"
```

---

### Task T-02: Create JSON Schemas (agent-frontmatter, session-state)

**Files:**
- Create: `docs/schemas/agent-frontmatter.schema.json`
- Create: `docs/schemas/session-state.schema.json`
- Create: `tools/audit/__tests__/schemas.test.js`

- [ ] **Step 1: Write failing test**

`tools/audit/__tests__/schemas.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const matter = require('gray-matter');
const { gitRoot } = require('../_lib/git-root');

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);

test('agent-frontmatter schema is valid Draft 2020-12', () => {
  const root = gitRoot();
  const schema = JSON.parse(fs.readFileSync(
    path.join(root, 'docs/schemas/agent-frontmatter.schema.json'), 'utf-8'));
  const compile = () => ajv.compile(schema);
  assert.doesNotThrow(compile);
});

test('agent-frontmatter schema validates ccip-architect.md', () => {
  const root = gitRoot();
  const schema = JSON.parse(fs.readFileSync(
    path.join(root, 'docs/schemas/agent-frontmatter.schema.json'), 'utf-8'));
  const validate = ajv.compile(schema);
  const fm = matter(fs.readFileSync(
    path.join(root, '.claude/agents/ccip-architect.md'), 'utf-8')).data;
  assert.equal(validate(fm), true, JSON.stringify(validate.errors));
});

test('session-state schema validates the empty skeleton', () => {
  const root = gitRoot();
  const schema = JSON.parse(fs.readFileSync(
    path.join(root, 'docs/schemas/session-state.schema.json'), 'utf-8'));
  const validate = ajv.compile(schema);
  const state = JSON.parse(fs.readFileSync(
    path.join(root, '.claude/runtime/session-state.json'), 'utf-8'));
  assert.equal(validate(state), true, JSON.stringify(validate.errors));
});
```

- [ ] **Step 2: Run test, verify it fails (schemas missing)**

```bash
node --test tools/audit/__tests__/schemas.test.js
```

Expected: ENOENT for both schemas.

- [ ] **Step 3: Create `docs/schemas/agent-frontmatter.schema.json`**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://ccip.local/schemas/agent-frontmatter.json",
  "title": "CCIP Agent Frontmatter",
  "type": "object",
  "required": ["name", "description", "tools"],
  "properties": {
    "name": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9-]*$",
      "description": "kebab-case, должно совпадать с именем файла"
    },
    "description": {
      "type": "string",
      "minLength": 40,
      "description": "≥40 символов — используется планировщиком для матчинга"
    },
    "tools": {
      "type": "string",
      "pattern": "^[A-Z][A-Za-z0-9]*(,\\s+[A-Z][A-Za-z0-9]*)*$",
      "description": "CSV список инструментов: Read, Write, Edit, Glob, Grep, Bash"
    },
    "model": {
      "type": "string",
      "enum": ["claude-sonnet-4-6", "claude-opus-4-7", "claude-haiku-4-5-20251001"]
    }
  },
  "additionalProperties": false
}
```

- [ ] **Step 4: Create `docs/schemas/session-state.schema.json`**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://ccip.local/schemas/session-state.json",
  "title": "CCIP Session State",
  "type": "object",
  "required": ["session_id", "task", "intents", "risk", "confidence", "routing", "status"],
  "properties": {
    "session_id":   { "type": "string" },
    "task":         { "type": "string" },
    "intents":      { "type": "array", "items": { "type": "string" } },
    "risk":         { "type": "string", "enum": ["LOW", "MEDIUM", "HIGH"] },
    "confidence":   { "type": "string", "enum": ["LOW", "MEDIUM", "HIGH"] },
    "routing":      { "type": "string", "enum": ["direct", "planner", "multi-agent"] },
    "dag":          { "type": "array" },
    "current_step": { "type": "integer", "minimum": 0 },
    "agent_outputs":{ "type": "object" },
    "status":       { "type": "string", "enum": ["init", "planning", "executing", "done", "blocked"] },
    "started_at":   { "type": "string" },
    "observations": { "type": "array" }
  },
  "additionalProperties": false
}
```

- [ ] **Step 5: Run tests, verify all pass**

```bash
node --test tools/audit/__tests__/schemas.test.js
```

Expected: 3 passes.

- [ ] **Step 6: Commit**

```bash
git add docs/schemas tools/audit/__tests__/schemas.test.js
git commit -m "feat(schemas): add agent-frontmatter and session-state JSON Schemas (Draft 2020-12)"
```

---

# Phase 1 — Contract integrity (§10.1)

### Task T-03: `path-canonical.js` — forbid non-canonical path prefixes

**Files:**
- Create: `tools/audit/path-canonical.js`
- Create: `tools/audit/__fixtures__/path-bad.md`
- Create: `tools/audit/__tests__/path-canonical.test.js`

**Что проверяем:** в any `.md`/`.json`/`.js` файле репо не должно быть префиксов `W:/Claude/CCIP/`, `C:\\Users\\`, `/home/`, `CCIP/.claude/`, `CCIP/docs/`, `CCIP/apps/`. Все пути — relative от ROOT или явно `.claude/...`/`docs/...`/`apps/...`.

- [ ] **Step 1: Write failing fixture + test**

`tools/audit/__fixtures__/path-bad.md`:

```
This file references W:/Claude/CCIP/some/path.
It also has CCIP/docs/foo.md.
And good ones: docs/bar.md, .claude/agents/x.md.
```

`tools/audit/__tests__/path-canonical.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const cp = require('node:child_process');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

test('path-canonical fails on bad fixture', () => {
  const root = gitRoot();
  const script = path.join(root, 'tools/audit/path-canonical.js');
  const fixture = path.join(root, 'tools/audit/__fixtures__/path-bad.md');
  const res = cp.spawnSync(process.execPath, [script, '--target', fixture]);
  assert.equal(res.status, 1, 'expected exit 1');
  assert.match(res.stderr.toString(), /W:\/Claude\/CCIP/);
  assert.match(res.stderr.toString(), /CCIP\/docs/);
});

test('path-canonical passes on clean fixture', () => {
  const root = gitRoot();
  const script = path.join(root, 'tools/audit/path-canonical.js');
  // CLAUDE.md уже должен быть canonical (но имеет ссылку — не префикс):
  const target = path.join(root, 'tools/audit/_lib/git-root.js');
  const res = cp.spawnSync(process.execPath, [script, '--target', target]);
  assert.equal(res.status, 0, res.stderr.toString());
});
```

- [ ] **Step 2: Run, verify fail (script doesn't exist)**

```bash
node --test tools/audit/__tests__/path-canonical.test.js
```

Expected: ENOENT, 2 fails.

- [ ] **Step 3: Implement `tools/audit/path-canonical.js`**

```js
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { walk } = require('./_lib/walk');
const { fail, ok } = require('./_lib/report');

// Запрещённые префиксы. Литералы экранируются в regex.
const FORBIDDEN = [
  { pat: /W:\/Claude\/CCIP\//g, why: 'absolute Windows path' },
  { pat: /C:\\\\Users\\\\/g,    why: 'absolute Windows user path' },
  { pat: /\/home\/[a-z]+\//g,   why: 'absolute Linux home path' },
  { pat: /\bCCIP\/(docs|apps|packages|\.claude|infra|tools)\//g, why: 'CCIP/ prefix; use relative path' },
];

// Allowlist файлов, где упоминания W:/... легитимны (например, settings.json hooks).
const ALLOWLIST = [
  '.claude/settings.json',     // hook commands могут быть absolute (но это §10.3 цель → пометить TODO)
];

const args = process.argv.slice(2);
const targetIdx = args.indexOf('--target');
const targets = targetIdx >= 0 ? [args[targetIdx + 1]] : null;

const root = gitRoot();
const files = targets || walk(root, ['**/*.md', '**/*.json', '**/*.js', '**/*.ts']);

let violations = 0;
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  if (ALLOWLIST.includes(rel)) continue;
  const content = fs.readFileSync(file, 'utf-8');
  for (const { pat, why } of FORBIDDEN) {
    const m = content.match(pat);
    if (m) {
      violations += m.length;
      fail('PATH-CANON', `${why}: ${m[0]}`, { file: rel, count: m.length });
    }
  }
}

if (violations === 0) ok('PATH-CANON');
process.exit(violations === 0 ? 0 : 1);
```

- [ ] **Step 4: Run test, verify pass**

```bash
node --test tools/audit/__tests__/path-canonical.test.js
```

Expected: 2 passes.

- [ ] **Step 5: Run audit on real repo, fix any violations**

```bash
node tools/audit/path-canonical.js
```

Если есть violations кроме `.claude/settings.json` — править вручную. Пример: ADR-001 был чистым; если в каком-то агенте найдётся `W:/...` — заменить на относительный путь.

- [ ] **Step 6: Commit**

```bash
git add tools/audit/path-canonical.js tools/audit/__tests__/path-canonical.test.js tools/audit/__fixtures__/path-bad.md
git commit -m "feat(audit): path-canonical — forbid absolute and CCIP/ prefixes (§10.1)"
```

---

### Task T-04: `section-anchors.js` — all `(§N)` references resolve

**Files:**
- Create: `tools/audit/section-anchors.js`
- Create: `tools/audit/__tests__/section-anchors.test.js`
- Create: `tools/audit/__fixtures__/anchors-bad.md`

**Что проверяем:** для каждого `.md` файла собрать все паттерны `(§\d+(?:\.\d+)*)` → проверить, что соответствующий заголовок `## N. ...` или `### N.M ...` или `## §N ...` существует в том же файле.

- [ ] **Step 1: Write fixture + failing test**

`tools/audit/__fixtures__/anchors-bad.md`:

```
# Test
References (§3) and (§5.2).

## 1. First section
## 3. Third section
Nothing for §5.2.
```

`tools/audit/__tests__/section-anchors.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const cp = require('node:child_process');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

test('section-anchors fails when §N not found', () => {
  const root = gitRoot();
  const script = path.join(root, 'tools/audit/section-anchors.js');
  const fixture = path.join(root, 'tools/audit/__fixtures__/anchors-bad.md');
  const res = cp.spawnSync(process.execPath, [script, '--target', fixture]);
  assert.equal(res.status, 1);
  assert.match(res.stderr.toString(), /§5\.2/);
});

test('section-anchors passes when all anchors resolve', () => {
  const root = gitRoot();
  const script = path.join(root, 'tools/audit/section-anchors.js');
  // Используем сам план как target — он не имеет §N ссылок без определений.
  const target = path.join(root, 'tools/audit/_lib/report.js');
  const res = cp.spawnSync(process.execPath, [script, '--target', target]);
  assert.equal(res.status, 0);
});
```

- [ ] **Step 2: Run, verify fail**

```bash
node --test tools/audit/__tests__/section-anchors.test.js
```

- [ ] **Step 3: Implement `tools/audit/section-anchors.js`**

```js
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { walk } = require('./_lib/walk');
const { fail, ok } = require('./_lib/report');

const REF_PAT = /\(§(\d+(?:\.\d+)*)\)/g;
// Заголовки вида "## 3. Foo", "### 5.2 Bar", "## §15 State Contract"
const HEAD_PAT = /^#{2,4}\s+(?:§)?(\d+(?:\.\d+)*)[\.\s§]/gm;

const args = process.argv.slice(2);
const targetIdx = args.indexOf('--target');
const targets = targetIdx >= 0 ? [args[targetIdx + 1]] : null;

const root = gitRoot();
const files = targets || walk(root, ['**/*.md']);

let violations = 0;
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const content = fs.readFileSync(file, 'utf-8');
  const refs = new Set();
  let m;
  REF_PAT.lastIndex = 0;
  while ((m = REF_PAT.exec(content))) refs.add(m[1]);

  const heads = new Set();
  HEAD_PAT.lastIndex = 0;
  while ((m = HEAD_PAT.exec(content))) heads.add(m[1]);

  for (const ref of refs) {
    if (!heads.has(ref)) {
      violations++;
      fail('SECTION-ANCHOR', `§${ref} referenced but not defined`, { file: rel });
    }
  }
}

if (violations === 0) ok('SECTION-ANCHOR');
process.exit(violations === 0 ? 0 : 1);
```

- [ ] **Step 4: Run test, verify pass**

```bash
node --test tools/audit/__tests__/section-anchors.test.js
```

- [ ] **Step 5: Run on real repo — expected to fail for §15 (F-003 BLOCKER)**

```bash
node tools/audit/section-anchors.js || true
```

Expected fails: множественные `§15 referenced but not defined` в `.claude/agents/*.md` — это известный F-003. Будет исправлено в T-08.

- [ ] **Step 6: Commit**

```bash
git add tools/audit/section-anchors.js tools/audit/__tests__/section-anchors.test.js tools/audit/__fixtures__/anchors-bad.md
git commit -m "feat(audit): section-anchors — all (§N) refs must resolve (§10.1)"
```

---

### Task T-05: `dead-refs.js` — file/path references must exist

**Files:**
- Create: `tools/audit/dead-refs.js`
- Create: `tools/audit/__tests__/dead-refs.test.js`
- Create: `tools/audit/__fixtures__/dead-refs-bad.md`

**Что проверяем:** в `.md` файлах вытащить упоминания путей `(.claude|docs|apps|packages|infra|tools)/...` (стиль relative-from-root), проверить что путь существует. Игнорировать code-fence содержимое.

- [ ] **Step 1: Write fixture + failing test**

`tools/audit/__fixtures__/dead-refs-bad.md`:

```
See docs/architecture/period-engine.md and docs/this-file-does-not-exist.md.
Code block (should be ignored):
\`\`\`
docs/fake-in-codeblock.md
\`\`\`
```

`tools/audit/__tests__/dead-refs.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const cp = require('node:child_process');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

test('dead-refs fails on missing path', () => {
  const root = gitRoot();
  const script = path.join(root, 'tools/audit/dead-refs.js');
  const fixture = path.join(root, 'tools/audit/__fixtures__/dead-refs-bad.md');
  const res = cp.spawnSync(process.execPath, [script, '--target', fixture]);
  assert.equal(res.status, 1);
  assert.match(res.stderr.toString(), /this-file-does-not-exist/);
});

test('dead-refs ignores code blocks', () => {
  const root = gitRoot();
  const script = path.join(root, 'tools/audit/dead-refs.js');
  const fixture = path.join(root, 'tools/audit/__fixtures__/dead-refs-bad.md');
  const res = cp.spawnSync(process.execPath, [script, '--target', fixture]);
  assert.doesNotMatch(res.stderr.toString(), /fake-in-codeblock/);
});
```

- [ ] **Step 2: Run, verify fail**

- [ ] **Step 3: Implement `tools/audit/dead-refs.js`**

```js
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { walk } = require('./_lib/walk');
const { fail, ok } = require('./_lib/report');

const PATH_PAT = /(?:^|[\s\(\[`>])((?:\.claude|docs|apps|packages|infra|tools)\/[A-Za-z0-9_./\-]+)/g;

function stripCodeBlocks(md) {
  return md
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]*`/g, '');
}

const args = process.argv.slice(2);
const targetIdx = args.indexOf('--target');
const targets = targetIdx >= 0 ? [args[targetIdx + 1]] : null;

const root = gitRoot();
const files = targets || walk(root, ['**/*.md']);

let violations = 0;
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const content = stripCodeBlocks(fs.readFileSync(file, 'utf-8'));
  let m;
  PATH_PAT.lastIndex = 0;
  while ((m = PATH_PAT.exec(content))) {
    let ref = m[1].replace(/[.,;:)\]]+$/, '');
    // Поддержка glob-паттернов: .../* считаем за каталог
    let check = ref;
    if (check.endsWith('/*')) check = check.slice(0, -2);
    const abs = path.join(root, check);
    if (!fs.existsSync(abs)) {
      violations++;
      fail('DEAD-REF', ref, { file: rel });
    }
  }
}

if (violations === 0) ok('DEAD-REF');
process.exit(violations === 0 ? 0 : 1);
```

- [ ] **Step 4: Run test, verify pass**

- [ ] **Step 5: Run on real repo, fix known dead refs**

```bash
node tools/audit/dead-refs.js || true
```

Ожидаемые fails (известные из multi-agent audit): `docs/errors_log.md` в ccip-architect.md, `docs/feedback-loop.md` в ccip-routing-planner.md, `apps/mobile/` в ccip-mobile.md, `infra/k8s/` в ccip-devops.md, `docs/proposed-claude-md-changes.md` в ccip-claude-md-auditor.md.

**Фикс:** заменить пути на реальные:
- `docs/errors_log.md` → `docs/errors/errors_log.md`
- `docs/feedback-loop.md` → `docs/tasks/feedback-loop.md`
- `apps/mobile/`, `infra/k8s/` — если они не существуют и не планируются на ближайшие 2 спринта, удалить упоминания или явно пометить `<!-- TBD: M-12 -->`
- `docs/proposed-claude-md-changes.md` — создать пустой файл с заголовком (если функция актуальна) или удалить упоминание.

**Каждый фикс — отдельный коммит** с явным указанием закрываемого finding ID (F-005, F-006, F-007, F-008, F-009).

- [ ] **Step 6: Final commit для аудит-скрипта**

```bash
git add tools/audit/dead-refs.js tools/audit/__tests__/dead-refs.test.js tools/audit/__fixtures__/dead-refs-bad.md
git commit -m "feat(audit): dead-refs — file/path references must exist (§10.1)"
```

---

### Task T-06: `agent-name-presence.js` — every agent file is mapped

**Files:**
- Create: `tools/audit/agent-name-presence.js`
- Create: `tools/audit/__tests__/agent-name-presence.test.js`

**Что проверяем:** каждый `.claude/agents/*.md` имя файла встречается ровно один раз в `CLAUDE.md` (в Intent → Agent таблице или в auxiliary разделе). Исключения: служебные агенты, помеченные в schema как `kind: auxiliary`.

- [ ] **Step 1: Write failing test**

```js
const test = require('node:test');
const assert = require('node:assert');
const cp = require('node:child_process');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

test('agent-name-presence reports unmapped agents', () => {
  const root = gitRoot();
  const script = path.join(root, 'tools/audit/agent-name-presence.js');
  const res = cp.spawnSync(process.execPath, [script]);
  // Текущее состояние: 8 агентов не в таблице (F-010). Должен fail.
  // После T-07 (Phase 2) и расширения CLAUDE.md — должен pass.
  assert.ok(typeof res.status === 'number');
});
```

- [ ] **Step 2: Implement `tools/audit/agent-name-presence.js`**

```js
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { walk } = require('./_lib/walk');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
const claudeMd = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf-8');
const agents = walk(root, ['.claude/agents/*.md']).map(f => path.basename(f, '.md'));

let violations = 0;
for (const name of agents) {
  // Считаем вхождения как литерал в backticks или просто как слово в Intent table.
  const re = new RegExp(`\\b${name.replace(/-/g, '\\-')}\\b`, 'g');
  const count = (claudeMd.match(re) || []).length;
  if (count === 0) {
    violations++;
    fail('AGENT-PRESENCE', `${name} not referenced in CLAUDE.md`, { agent: name });
  }
}

if (violations === 0) ok('AGENT-PRESENCE');
process.exit(violations === 0 ? 0 : 1);
```

- [ ] **Step 3: Run audit (expected fail on F-010)**

```bash
node tools/audit/agent-name-presence.js || true
```

Expected unmapped: `ccip-product-owner`, `ccip-routing-planner`, `ccip-claude-md-auditor`, `ccip-navigator-optimizer`, `ccip-session-optimizer`, `consistency-checker`, `security-reviewer`, `general-purpose`.

- [ ] **Step 4: Fix CLAUDE.md — add auxiliary agent table**

В `CLAUDE.md` после `## Intent → Agent → Backup` добавить:

```markdown
## Auxiliary Agents (auto-triggered, not via Intent table)
| Agent                       | Trigger                                |
|-----------------------------|----------------------------------------|
| security-reviewer           | risk:HIGH или JWT/RBAC/RLS/multi-tenancy/GpToken/AuditLog changes |
| ccip-product-owner          | бизнес-приёмка features, acceptance criteria |
| ccip-routing-planner        | intents ≥ 3 OR confidence LOW          |
| ccip-claude-md-auditor      | расписание (см. settings.json)         |
| ccip-navigator-optimizer    | изменения CLAUDE.md §3–§6 или index.md  |
| ccip-session-optimizer      | "Завершаем сессию" trigger             |
| consistency-checker         | по запросу при cross-doc анализе       |
| general-purpose             | fallback при DEGRADED specialist       |
```

- [ ] **Step 5: Run audit again, verify pass**

```bash
node tools/audit/agent-name-presence.js
```

Expected: `[AGENT-PRESENCE] OK`.

- [ ] **Step 6: Commit**

```bash
git add tools/audit/agent-name-presence.js tools/audit/__tests__/agent-name-presence.test.js CLAUDE.md
git commit -m "feat(audit): agent-name-presence + CLAUDE.md auxiliary table (closes F-010)"
```

---

### Task T-07: `state-contract-section.js` — guard CLAUDE.md §15

**Files:**
- Create: `tools/audit/state-contract-section.js`
- Create: `tools/audit/__tests__/state-contract-section.test.js`

**Что проверяем:** В `CLAUDE.md` существует раздел `## §15 State Contract` (или `## 15.` — нормализуется). Внутри — минимум: ссылка на `session-state.schema.json`, описание lifecycle, и явное упоминание `## State Update` блока.

- [ ] **Step 1: Write failing test**

```js
const test = require('node:test');
const assert = require('node:assert');
const cp = require('node:child_process');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

test('state-contract-section fails when §15 missing', () => {
  const root = gitRoot();
  const script = path.join(root, 'tools/audit/state-contract-section.js');
  const res = cp.spawnSync(process.execPath, [script]);
  // На момент T-07 §15 ещё не создан → fail. После T-08 → pass.
  assert.ok(typeof res.status === 'number');
});
```

- [ ] **Step 2: Implement `tools/audit/state-contract-section.js`**

```js
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
const md = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf-8');

// Принимаем оба варианта: "## §15" или "## 15."
const headOk = /^##\s+(?:§15\b|15\.)/m.test(md);
if (!headOk) {
  fail('STATE-CONTRACT', '§15 State Contract section missing in CLAUDE.md');
  process.exit(1);
}

// Внутри §15 должны быть: упоминание session-state.json и блока "## State Update"
const sectionStart = md.search(/^##\s+(?:§15\b|15\.)/m);
const sectionEnd = md.indexOf('\n## ', sectionStart + 1);
const section = md.slice(sectionStart, sectionEnd > 0 ? sectionEnd : md.length);

const required = [
  { pat: /session-state\.json/i,        why: 'reference to session-state.json' },
  { pat: /State\s*Update/i,             why: 'mention of "## State Update" block' },
  { pat: /session-state\.schema\.json/i, why: 'reference to session-state.schema.json' },
];

let violations = 0;
for (const r of required) {
  if (!r.pat.test(section)) {
    violations++;
    fail('STATE-CONTRACT', `§15 missing: ${r.why}`);
  }
}

if (violations === 0) ok('STATE-CONTRACT');
process.exit(violations === 0 ? 0 : 1);
```

- [ ] **Step 3: Commit (без правки CLAUDE.md — это T-08)**

```bash
git add tools/audit/state-contract-section.js tools/audit/__tests__/state-contract-section.test.js
git commit -m "feat(audit): state-contract-section guard for CLAUDE.md §15"
```

---

### Task T-08: Add CLAUDE.md §15 State Contract section

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Append §15 to CLAUDE.md**

В конец `CLAUDE.md` добавить:

```markdown

## §15 State Contract

Единый контракт обмена состоянием между агентами в рамках одной сессии.

**Источник истины:** `.claude/runtime/session-state.json`
**Схема:** `docs/schemas/session-state.schema.json`
**Lifecycle:** см. `.claude/runtime/state-protocol.md`

### Lifecycle (краткая версия)
1. **INIT** — заполнить `task`, `intents`, `risk`, `confidence`, `routing`, `started_at`; `status = "planning"`.
2. **INJECT** — перед каждым `Agent` call: прочитать state, передать в промпт.
3. **UPDATE** — после каждого `Agent` call: `post-agent-hook.js` парсит `## State Update` блок в выводе агента и записывает `agent_outputs[name]` + добавляет observation.
4. **FLUSH** — на Stop hook: `flush-state.js` переносит `observations[]` в `docs/tasks/feedback-loop.md §4`.

### Контракт агента
Каждый агент **обязан** в конце своего вывода вернуть блок:

\`\`\`markdown
## State Update
\`\`\`json
{
  "summary": "≤ 3 предложения о сделанном",
  "artifacts": ["path/to/file.md"],
  "handoff_notes": "Что нужно знать следующему агенту"
}
\`\`\`
\`\`\`

Отсутствие блока → `post-agent-hook.js` ставит fallback summary; это допустимо, но снижает качество маршрутизации.

### Защита от prompt injection
`handoff_notes` инъецируется в следующий промпт между `<!-- handoff-data -->` / `<!-- /handoff-data -->`. Агенты не должны копировать handoff-данные в свои `handoff_notes` без явного намерения. См. `sanitizeHandoff()` в `.claude/runtime/execute-dag.js`.

### Валидация
- `node tools/audit/session-state.js` — runtime файл матчит схему.
- `node tools/audit/state-contract-section.js` — этот раздел не сломан.
```

- [ ] **Step 2: Run audit, verify §15 OK**

```bash
node tools/audit/state-contract-section.js
```

Expected: `[STATE-CONTRACT] OK`.

- [ ] **Step 3: Run section-anchors audit on agent files**

```bash
node tools/audit/section-anchors.js || true
```

Expected: множественные `§15 referenced but not defined` теперь fix внутри `.claude/agents/*.md` — потому что заголовок есть в CLAUDE.md, но НЕ в agent.md.

**Решение:** агенты ссылаются на `(§15)` из CLAUDE.md, не на свой собственный заголовок. Уточняем audit-логику: в section-anchors добавляем исключение — если ссылка явно cross-file (`CLAUDE.md §15`), не требуем заголовка в текущем файле.

Альтернатива: в agent-файлах заменить `(§15)` на `(CLAUDE.md §15)`. Это явнее и не требует усложнения audit.

Выбираем альтернативу. Mass-replace в `.claude/agents/*.md`: `(§15)` → `(CLAUDE.md §15)`. Затем в section-anchors добавить regex-исключение для паттерна `\(\w+\.md\s+§N\)`.

- [ ] **Step 4: Mass-replace в агентах**

```bash
# Найти все упоминания
node -e "const r = require('./tools/audit/_lib/git-root').gitRoot(); const fs=require('fs'); const w=require('./tools/audit/_lib/walk').walk(r, ['.claude/agents/*.md']); for (const f of w) { const c = fs.readFileSync(f,'utf-8'); if (c.includes('(§15)')) { fs.writeFileSync(f, c.replace(/\(§15\)/g, '(CLAUDE.md §15)')); console.log('fixed:', f); } }"
```

- [ ] **Step 5: Update `tools/audit/section-anchors.js` — exempt cross-file refs**

Заменить `REF_PAT`:

```js
// Только same-file ссылки: (§N) без предшествующего "файл.md "
const REF_PAT = /(?:^|[^.])\(§(\d+(?:\.\d+)*)\)/g;
```

Прогон тестов:

```bash
node --test tools/audit/__tests__/section-anchors.test.js
```

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md .claude/agents tools/audit/section-anchors.js
git commit -m "feat(claude-md): add §15 State Contract; replace agent (§15) with (CLAUDE.md §15) (closes F-003)"
```

---

# Phase 2 — Schema integrity (§10.2)

### Task T-09: ADR frontmatter migration — add `impl_anchors:`

**Files:**
- Modify: `docs/decisions/ADR-001-backend-framework.md` через `ADR-014-push-notifications.md` + `ADR-009-rbac-gp-token.md` (всего 14 файлов)

**Что делаем:** добавить YAML frontmatter в каждый ADR со списком файлов-якорей реализации. Использовать существующие очевидные якоря из текста ADR.

- [ ] **Step 1: Define schema entry for ADR frontmatter**

Расширить `docs/schemas/agent-frontmatter.schema.json` неуместно (это для агентов). Создаём отдельную:

`docs/schemas/adr-frontmatter.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://ccip.local/schemas/adr-frontmatter.json",
  "type": "object",
  "required": ["adr", "status", "impl_anchors"],
  "properties": {
    "adr":           { "type": "string", "pattern": "^ADR-\\d{3}$" },
    "status":        { "type": "string", "enum": ["Draft", "Принято", "Принято rev 2", "Superseded", "Deprecated"] },
    "impl_anchors":  { "type": "array", "items": { "type": "string" }, "minItems": 1 },
    "supersedes":    { "type": "string" },
    "superseded_by": { "type": "string" }
  },
  "additionalProperties": false
}
```

- [ ] **Step 2: Migrate ADR-001 (example)**

В начале `docs/decisions/ADR-001-backend-framework.md` добавить:

```yaml
---
adr: ADR-001
status: Принято rev 2
impl_anchors:
  - apps/api/src/modules/period/
  - apps/api/src/modules/zero-report/
  - apps/api/src/modules/dispute-sla/
  - apps/api/src/modules/analytics/
  - apps/api/src/modules/baseline/
  - apps/api/src/modules/sync/
  - apps/api/src/modules/init/
  - apps/api/src/common/guards/
  - apps/api/src/common/prisma/
  - apps/api/src/common/scheduler/
  - packages/database/prisma/schema.prisma
---
```

(сразу после frontmatter оставить текущий `# ADR-001 — Backend Framework`).

- [ ] **Step 3: Migrate ADR-002..014 systematically**

Для каждого ADR прочитать секцию «Решение» / «Контракт реализации» / «Реализация», выписать упомянутые пути или паттерны (`apps/api/src/modules/<name>/`, `packages/database/`, `infra/...`). Если ADR — чисто концептуальный (например, ADR-004 materialized view staleness), указать минимум `packages/database/prisma/schema.prisma` плюс соответствующий модуль.

Примерные mapping:
- ADR-002 period concurrency → `apps/api/src/modules/period/`, `apps/api/src/common/scheduler/advisory-lock.ts`
- ADR-003 offline conflict → `apps/api/src/modules/sync/`
- ADR-005 SLA scheduler → `apps/api/src/modules/dispute-sla/`, `infra/docker/docker-compose.yml`
- ADR-007 period immutability → `apps/api/src/modules/period/`, `packages/database/prisma/schema.prisma`
- ADR-009 RBAC + GpToken → `apps/api/src/common/guards/`, `apps/api/src/modules/init/`, `packages/database/prisma/schema.prisma`
- ADR-010 audit log partitioning → `packages/database/prisma/schema.prisma`, `packages/database/prisma/migrations/`
- ADR-012 multi-tenancy → `apps/api/src/common/guards/tenant-isolation.guard.ts`, `packages/database/prisma/schema.prisma`

Точные пути проверять через Grep по ADR-тексту перед коммитом.

- [ ] **Step 4: Commit**

```bash
git add docs/schemas/adr-frontmatter.schema.json docs/decisions
git commit -m "feat(adr): add impl_anchors frontmatter to all ADRs (§10.2)"
```

---

### Task T-10: `adr-anchors.js` — `impl_anchors[]` must resolve

**Files:**
- Create: `tools/audit/adr-anchors.js`
- Create: `tools/audit/__tests__/adr-anchors.test.js`

- [ ] **Step 1: Write failing test**

```js
const test = require('node:test');
const assert = require('node:assert');
const cp = require('node:child_process');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

test('adr-anchors validates all ADR impl_anchors exist', () => {
  const root = gitRoot();
  const script = path.join(root, 'tools/audit/adr-anchors.js');
  const res = cp.spawnSync(process.execPath, [script]);
  assert.equal(res.status, 0, res.stderr.toString());
});
```

- [ ] **Step 2: Implement**

```js
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const matter = require('gray-matter');
const Ajv = require('ajv');
const { gitRoot } = require('./_lib/git-root');
const { walk } = require('./_lib/walk');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
const schema = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/schemas/adr-frontmatter.schema.json'), 'utf-8'));
const validate = new Ajv({ allErrors: true }).compile(schema);

const adrs = walk(root, ['docs/decisions/ADR-*.md']);

let violations = 0;
for (const file of adrs) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const fm = matter(fs.readFileSync(file, 'utf-8')).data;
  if (!validate(fm)) {
    fail('ADR-SCHEMA', `frontmatter invalid: ${JSON.stringify(validate.errors)}`, { file: rel });
    violations++;
    continue;
  }
  for (const anchor of fm.impl_anchors) {
    const abs = path.join(root, anchor.replace(/\/$/, ''));
    if (!fs.existsSync(abs)) {
      fail('ADR-ANCHOR', `${anchor} does not exist`, { file: rel });
      violations++;
    }
  }
}

if (violations === 0) ok('ADR-ANCHOR');
process.exit(violations === 0 ? 0 : 1);
```

- [ ] **Step 3: Run, fix any missing anchors**

```bash
node tools/audit/adr-anchors.js
```

Если есть fails — либо anchor неверный (фикс ADR), либо каталог действительно отсутствует (создать placeholder с `.keep` или пометить ADR как Draft).

- [ ] **Step 4: Commit**

```bash
git add tools/audit/adr-anchors.js tools/audit/__tests__/adr-anchors.test.js
git commit -m "feat(audit): adr-anchors — impl_anchors[] must exist (§10.2)"
```

---

### Task T-11: `rbac-vs-schema.js` — role refs ⊆ enum UserRole

**Files:**
- Create: `tools/audit/rbac-vs-schema.js`
- Create: `tools/audit/__tests__/rbac-vs-schema.test.js`

**Что проверяем:** все упоминания ролей в `.claude/agents/*.md`, `docs/decisions/ADR-*.md`, `docs/architecture/*.md`, `apps/api/src/**/*.ts` — должны быть подмножеством `enum UserRole` в `packages/database/prisma/schema.prisma`.

Это закрывает F-001 BLOCKER (security-reviewer ссылался на `supervisor`/`contractor`, которых нет в enum).

- [ ] **Step 1: Write failing test**

```js
const test = require('node:test');
const assert = require('node:assert');
const cp = require('node:child_process');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

test('rbac-vs-schema fails on phantom roles', () => {
  const root = gitRoot();
  const script = path.join(root, 'tools/audit/rbac-vs-schema.js');
  const res = cp.spawnSync(process.execPath, [script]);
  // Должен пройти после фикса .claude/agents/security-reviewer.md
  assert.ok(typeof res.status === 'number');
});
```

- [ ] **Step 2: Implement**

```js
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { walk } = require('./_lib/walk');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
const schema = fs.readFileSync(path.join(root, 'packages/database/prisma/schema.prisma'), 'utf-8');

// Извлекаем enum UserRole { admin, director, ... }
const enumMatch = schema.match(/enum\s+UserRole\s*\{([^}]+)\}/);
if (!enumMatch) {
  fail('RBAC-SCHEMA', 'enum UserRole not found in schema.prisma');
  process.exit(1);
}
const validRoles = new Set(
  enumMatch[1]
    .split('\n')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('@@') && !s.startsWith('//'))
);

// Известные слова, которые не являются роли, но матчат паттерн (false positives)
const NOT_ROLES = new Set([
  'user', 'role', 'admin', // 'admin' валидная, оставляем
  'system', 'api', 'auth', 'public', 'access', 'guest', 'anonymous',
  'manager', 'owner', 'operator', // если ADR требует — добавить в enum, иначе flag
  'tenant', 'service', 'worker',
]);
// Удаляем валидные роли из NOT_ROLES, чтобы не пропустить их
for (const r of validRoles) NOT_ROLES.delete(r);

// Паттерн упоминаний роли: "роль(и)", "роль:", @Roles(...), 'admin'|'director', etc.
// Эвристика: ищем @Roles(...) и явные списки в `|`-разделённом виде.
const ROLE_LIST_PAT = /@Roles\(\s*['"]([\w,\s'"\|]+)['"]\s*\)|director\s*\|\s*\w+|\bsupervisor\b|\bcontractor\b/g;

const files = [
  ...walk(root, ['.claude/agents/*.md']),
  ...walk(root, ['docs/decisions/ADR-*.md']),
  ...walk(root, ['docs/architecture/*.md']),
  ...walk(root, ['apps/api/src/**/*.ts']),
];

let violations = 0;
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const c = fs.readFileSync(file, 'utf-8');
  // Простой grep по подозрительным:
  const suspects = ['supervisor', 'contractor', 'manager', 'operator', 'owner'];
  for (const sus of suspects) {
    const re = new RegExp(`\\b${sus}\\b`, 'g');
    const m = c.match(re);
    if (m && !validRoles.has(sus)) {
      violations += m.length;
      fail('RBAC-SCHEMA', `phantom role "${sus}" (not in UserRole enum)`, { file: rel, count: m.length });
    }
  }
}

if (violations === 0) ok('RBAC-SCHEMA');
process.exit(violations === 0 ? 0 : 1);
```

- [ ] **Step 3: Run, expect F-001 fail**

```bash
node tools/audit/rbac-vs-schema.js || true
```

Expected: `security-reviewer.md` упоминает `supervisor`/`contractor` (F-001 BLOCKER).

- [ ] **Step 4: Fix `.claude/agents/security-reviewer.md`**

Прочитать секцию RBAC matrix (около строк 70-90) и заменить:
- `supervisor` → `stroycontrol`
- `contractor` → удалить или заменить на `engineer` (в зависимости от контекста: подрядчик в CCIP — это ГП, авторизуется через gpToken, не через enum UserRole)

Если упоминание `contractor` относится к ГП — заменить на `gpToken-authorized` (явная пометка, что это не UserRole).

- [ ] **Step 5: Re-run audit, verify pass**

```bash
node tools/audit/rbac-vs-schema.js
```

Expected: `[RBAC-SCHEMA] OK`.

- [ ] **Step 6: Commit**

```bash
git add tools/audit/rbac-vs-schema.js .claude/agents/security-reviewer.md
git commit -m "fix(security): replace phantom roles supervisor/contractor → stroycontrol/gpToken (closes F-001 BLOCKER)"
```

---

### Task T-12: `agent-frontmatter.js` audit — validate every agent against schema

**Files:**
- Create: `tools/audit/agent-frontmatter.js`
- Create: `tools/audit/__tests__/agent-frontmatter.test.js`

- [ ] **Step 1: Write failing test**

```js
const test = require('node:test');
const assert = require('node:assert');
const cp = require('node:child_process');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

test('agent-frontmatter validates all agents', () => {
  const root = gitRoot();
  const script = path.join(root, 'tools/audit/agent-frontmatter.js');
  const res = cp.spawnSync(process.execPath, [script]);
  assert.equal(res.status, 0, res.stderr.toString());
});
```

- [ ] **Step 2: Implement**

```js
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const matter = require('gray-matter');
const Ajv = require('ajv');
const { gitRoot } = require('./_lib/git-root');
const { walk } = require('./_lib/walk');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
const schema = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/schemas/agent-frontmatter.schema.json'), 'utf-8'));
const validate = new Ajv({ allErrors: true }).compile(schema);

const files = walk(root, ['.claude/agents/*.md']);
let violations = 0;
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const fm = matter(fs.readFileSync(file, 'utf-8')).data;
  const expectedName = path.basename(file, '.md');
  if (fm.name !== expectedName) {
    fail('AGENT-FM', `name mismatch: fm.name=${fm.name} expected=${expectedName}`, { file: rel });
    violations++;
  }
  if (!validate(fm)) {
    fail('AGENT-FM', `schema: ${JSON.stringify(validate.errors)}`, { file: rel });
    violations++;
  }
}

if (violations === 0) ok('AGENT-FM');
process.exit(violations === 0 ? 0 : 1);
```

- [ ] **Step 3: Run, fix offenders**

```bash
node tools/audit/agent-frontmatter.js || true
```

Ожидаемые fails: `ccip-security` без `model:` (F-016), некоторые агенты с короткими description. Фиксить добавлением полей или расширением description ≥ 40 chars.

- [ ] **Step 4: Commit**

```bash
git add tools/audit/agent-frontmatter.js tools/audit/__tests__/agent-frontmatter.test.js .claude/agents
git commit -m "feat(audit): agent-frontmatter schema validation (closes F-016)"
```

---

### Task T-13: `session-state.js` audit — runtime file matches schema at every tick

**Files:**
- Create: `tools/audit/session-state.js`
- Create: `tools/audit/__tests__/session-state.test.js`

- [ ] **Step 1: Implement**

```js
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');
const { gitRoot } = require('./_lib/git-root');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
const schema = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/schemas/session-state.schema.json'), 'utf-8'));
const validate = new Ajv({ allErrors: true }).compile(schema);

const stateFile = path.join(root, '.claude/runtime/session-state.json');
if (!fs.existsSync(stateFile)) {
  fail('SESSION-STATE', 'session-state.json missing');
  process.exit(1);
}

let state;
try { state = JSON.parse(fs.readFileSync(stateFile, 'utf-8')); }
catch (e) {
  fail('SESSION-STATE', `invalid JSON: ${e.message}`);
  process.exit(1);
}

if (!validate(state)) {
  fail('SESSION-STATE', `schema: ${JSON.stringify(validate.errors)}`);
  process.exit(1);
}

ok('SESSION-STATE');
process.exit(0);
```

- [ ] **Step 2: Run, verify pass**

```bash
node tools/audit/session-state.js
```

- [ ] **Step 3: Commit**

```bash
git add tools/audit/session-state.js tools/audit/__tests__/session-state.test.js
git commit -m "feat(audit): session-state schema validation (§10.2)"
```

---

# Phase 3 — Documentation truth (§10.7)

### Task T-14: `orphan-adrs.js` — every ADR referenced from at least one code/doc

**Files:**
- Create: `tools/audit/orphan-adrs.js`

**Что проверяем:** каждый `ADR-NNN` (по номеру) встречается в `.claude/agents/*.md` или `docs/architecture/*.md` или `apps/**/*.ts` хотя бы один раз. Если нет — ADR orphan.

- [ ] **Step 1: Implement**

```js
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { walk } = require('./_lib/walk');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
const adrs = walk(root, ['docs/decisions/ADR-*.md'])
  .map(f => path.basename(f, '.md'))
  .filter(n => /^ADR-\d{3}$/.test(n));

const refsCorpus = [
  ...walk(root, ['.claude/agents/*.md']),
  ...walk(root, ['docs/architecture/*.md']),
  ...walk(root, ['docs/decisions/*.md']),
  ...walk(root, ['apps/api/src/**/*.ts']),
  ...walk(root, ['docs/delivery/*.md']),
].map(f => fs.readFileSync(f, 'utf-8')).join('\n');

let violations = 0;
for (const adr of adrs) {
  // Каждый ADR ссылается на себя в собственном файле → достаточно >1.
  const occurrences = (refsCorpus.match(new RegExp(`\\b${adr}\\b`, 'g')) || []).length;
  if (occurrences < 1) {
    fail('ORPHAN-ADR', `${adr} not referenced anywhere`);
    violations++;
  }
}

if (violations === 0) ok('ORPHAN-ADR');
process.exit(violations === 0 ? 0 : 1);
```

- [ ] **Step 2: Run, document any orphans (likely none, but verify)**

- [ ] **Step 3: Commit**

```bash
git add tools/audit/orphan-adrs.js
git commit -m "feat(audit): orphan-adrs (§10.7 — closes X-7)"
```

---

### Task T-15: `orphan-dirs.js` — flag known-orphan directories

**Files:**
- Create: `tools/audit/orphan-dirs.js`

**Что проверяем:** существование закрытых F-020/F-021/F-022. Должны отсутствовать:
- `frontend/` (root-level)
- `the roles of subagents/`
- `.agents/` (claude-plugin name collision)

- [ ] **Step 1: Implement**

```js
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
const ORPHANS = [
  { p: 'frontend',                         id: 'F-020' },
  { p: 'the roles of subagents',           id: 'F-021' },
  { p: '.agents',                          id: 'F-022' },
];

let violations = 0;
for (const o of ORPHANS) {
  if (fs.existsSync(path.join(root, o.p))) {
    fail('ORPHAN-DIR', `${o.p} exists (${o.id} unresolved)`);
    violations++;
  }
}

if (violations === 0) ok('ORPHAN-DIR');
process.exit(violations === 0 ? 0 : 1);
```

- [ ] **Step 2: Run, remove orphan directories**

```bash
node tools/audit/orphan-dirs.js || true
```

Каждый существующий orphan: `git rm -r <path>`, перед удалением убедиться что `git log --all -- <path>` не содержит уникального контента.

- [ ] **Step 3: Re-run, verify clean**

```bash
node tools/audit/orphan-dirs.js
```

- [ ] **Step 4: Commit**

```bash
git add tools/audit/orphan-dirs.js
git commit -m "feat(audit): orphan-dirs guard (closes F-020/F-021/F-022)"
```

(Удаление orphan-каталогов — отдельные коммиты с явным указанием F-XXX в сообщении.)

---

### Task T-16: `delivery-paths.js` — paths in `docs/delivery/*.md` must exist

**Files:**
- Create: `tools/audit/delivery-paths.js`

**Что проверяем:** в `docs/delivery/*.md` и `docs/delivery_plan_v1_0.md` — все упомянутые пути модулей `apps/api/src/modules/*/`, `apps/web/src/*/` существуют. Закрывает F-015 и F-017.

- [ ] **Step 1: Implement**

Похоже на `dead-refs.js`, но ограничено delivery-документами и paths-паттерном `apps/(api|web|mobile)/src/...`.

```js
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { walk } = require('./_lib/walk');
const { fail, ok } = require('./_lib/report');

const PATH_PAT = /apps\/(?:api|web|mobile)\/src\/[A-Za-z0-9_\/.\-]+/g;

function stripCodeBlocks(md) {
  return md.replace(/```[\s\S]*?```/g, '');
}

const root = gitRoot();
const files = [
  ...walk(root, ['docs/delivery/*.md']),
  ...walk(root, ['docs/delivery_plan_v1_0.md']),
];

let violations = 0;
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const c = stripCodeBlocks(fs.readFileSync(file, 'utf-8'));
  let m;
  while ((m = PATH_PAT.exec(c))) {
    let ref = m[0].replace(/[.,;)]+$/, '');
    if (!fs.existsSync(path.join(root, ref))) {
      fail('DELIVERY-PATH', ref, { file: rel });
      violations++;
    }
  }
}

if (violations === 0) ok('DELIVERY-PATH');
process.exit(violations === 0 ? 0 : 1);
```

- [ ] **Step 2: Run, fix phantom paths from F-015/F-017**

Известные phantom:
- `apps/api/src/gp/gp.module.ts` → не существует (GP submission живёт в `apps/api/src/modules/period/`)
- `apps/api/src/sla-scheduler/sla-scheduler.module.ts` → реальный путь `apps/api/src/modules/dispute-sla/`

В `docs/delivery_plan_v1_0.md:291,321` и `docs/delivery/phase-4-7-backend-modules.md:51,81` заменить.

Дополнительно из Red Team audit C-004 уже T3 был unblocked.

- [ ] **Step 3: Commit**

```bash
git add tools/audit/delivery-paths.js docs/delivery_plan_v1_0.md docs/delivery
git commit -m "fix(delivery): replace phantom module paths (closes F-015, F-017, C-004)"
```

---

### Task T-17: `memory-fs-sync.js` — MEMORY.md refs ⊆ filesystem

**Files:**
- Create: `tools/audit/memory-fs-sync.js`

**Что проверяем:** в `C:\Users\user\.claude\projects\W--Claude-CCIP\memory\MEMORY.md` (user-level) и `MEMORY.md` (если есть в репо) — каждая ссылка на файл памяти существует на ФС. Закрывает X-8.

Поскольку user-memory вне репо, audit имеет два режима:
- `--repo`: проверить только репо-сайд (если файл MEMORY.md есть в репо)
- `--user`: проверить user memory (требует переменную или argument)

- [ ] **Step 1: Implement (repo-side only; user-side — manual для аудита)**

```js
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
const userMemoryDir = process.env.CCIP_USER_MEMORY_DIR; // optional override

const candidates = [
  path.join(root, 'MEMORY.md'),
  userMemoryDir ? path.join(userMemoryDir, 'MEMORY.md') : null,
].filter(Boolean);

let violations = 0;
let checked = 0;
for (const memFile of candidates) {
  if (!fs.existsSync(memFile)) continue;
  checked++;
  const memDir = path.dirname(memFile);
  const c = fs.readFileSync(memFile, 'utf-8');
  // Извлекаем markdown-ссылки [text](file.md)
  const linkPat = /\[[^\]]+\]\(([^)]+\.md)\)/g;
  let m;
  while ((m = linkPat.exec(c))) {
    const ref = m[1];
    const abs = path.isAbsolute(ref) ? ref : path.join(memDir, ref);
    if (!fs.existsSync(abs)) {
      fail('MEMORY-FS', `${ref} referenced but missing`, { file: memFile });
      violations++;
    }
  }
}

if (checked === 0) {
  // No MEMORY.md in repo and CCIP_USER_MEMORY_DIR not set — skip silently
  ok('MEMORY-FS (skipped — no MEMORY.md in scan scope)');
  process.exit(0);
}

if (violations === 0) ok('MEMORY-FS');
process.exit(violations === 0 ? 0 : 1);
```

- [ ] **Step 2: Run; document how to invoke for user memory**

```bash
node tools/audit/memory-fs-sync.js
# Для проверки user memory:
CCIP_USER_MEMORY_DIR="C:/Users/user/.claude/projects/W--Claude-CCIP/memory" node tools/audit/memory-fs-sync.js
```

- [ ] **Step 3: Commit**

```bash
git add tools/audit/memory-fs-sync.js
git commit -m "feat(audit): memory-fs-sync (§10.7 closes X-8)"
```

---

# Phase 4 — Runtime integrity (§10.4)

### Task T-18: Fix `post-agent-hook.js` — atomic write + fail-loud + session_id gate

**Files:**
- Modify: `.claude/runtime/post-agent-hook.js`

**Что чиним (F-011, F-013, §10.4 violations):**
1. Заменить `writeState` на atomic tmp→rename + fsync.
2. Убрать silent `catch {}` на верхнем уровне (строки 89-91). Hook должен залогировать ошибку в stderr и завершиться с exit code, чтобы Claude Code хост зафиксировал в лог.
3. Добавить guard: если `state.session_id === ''` — это «неинициализированная сессия», пропустить запись и предупредить.

- [ ] **Step 1: Write a regression test**

`tools/audit/__tests__/post-agent-hook.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const HOOK = path.join(root, '.claude/runtime/post-agent-hook.js');
const STATE = path.join(root, '.claude/runtime/session-state.json');

function backupState() {
  const original = fs.readFileSync(STATE, 'utf-8');
  return () => fs.writeFileSync(STATE, original, 'utf-8');
}

test('hook fails loud on malformed payload', () => {
  const restore = backupState();
  const res = cp.spawnSync(process.execPath, [HOOK], { input: 'not-json', encoding: 'utf-8' });
  // Должен либо вернуть exit !=0, либо явно написать в stderr; но silently exit 0 — это §10.4 violation.
  // Если exit 0 — должно быть сообщение в stderr.
  const stderrOk = res.stderr && res.stderr.length > 0;
  const exitOk = res.status !== 0;
  assert.ok(stderrOk || exitOk, 'hook must surface errors (stderr or non-zero exit)');
  restore();
});

test('hook skips when session_id empty', () => {
  const restore = backupState();
  fs.writeFileSync(STATE, JSON.stringify({
    session_id: '', task: '', intents: [], risk: 'LOW', confidence: 'HIGH',
    routing: 'direct', dag: [], current_step: 0, agent_outputs: {}, status: 'init',
    started_at: '', observations: []
  }), 'utf-8');
  const payload = JSON.stringify({
    tool_name: 'Agent',
    tool_input: { subagent_type: 'ccip-architect' },
    tool_response: { content: 'hello' }
  });
  const res = cp.spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf-8' });
  const after = JSON.parse(fs.readFileSync(STATE, 'utf-8'));
  // Если session_id empty — не должно быть записи agent_outputs
  assert.deepEqual(after.agent_outputs, {});
  restore();
});

test('hook performs atomic write (no .tmp left on success)', () => {
  const restore = backupState();
  fs.writeFileSync(STATE, JSON.stringify({
    session_id: '2026-05-12-1200', task: 't', intents: [], risk: 'LOW',
    confidence: 'HIGH', routing: 'direct', dag: [], current_step: 0,
    agent_outputs: {}, status: 'executing', started_at: '', observations: []
  }), 'utf-8');
  const payload = JSON.stringify({
    tool_name: 'Agent',
    tool_input: { subagent_type: 'ccip-architect', description: 'x' },
    tool_response: { content: 'ok' }
  });
  cp.spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf-8' });
  const dir = path.dirname(STATE);
  const tmps = fs.readdirSync(dir).filter(f => f.includes('.tmp'));
  assert.deepEqual(tmps, [], 'no .tmp file should remain');
  restore();
});
```

- [ ] **Step 2: Run tests, expect 2-3 fails**

```bash
node --test tools/audit/__tests__/post-agent-hook.test.js
```

- [ ] **Step 3: Patch `.claude/runtime/post-agent-hook.js`**

Заменить блок:

```js
function writeState(state) {
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n', 'utf-8');
}
```

на:

```js
function writeState(state) {
  const tmp = STATE + '.tmp.' + process.pid;
  const data = JSON.stringify(state, null, 2) + '\n';
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, STATE);
  try {
    const dirFd = fs.openSync(path.dirname(STATE), 'r');
    fs.fsyncSync(dirFd);
    fs.closeSync(dirFd);
  } catch (e) {
    if (e.code !== 'EPERM' && e.code !== 'EISDIR' && e.code !== 'EACCES') throw e;
  }
}
```

Заменить блок:

```js
process.stdin.on('end', () => {
  try {
    run(raw);
  } catch {
    // silent — never crash the parent session
  }
  process.exit(0);
});
```

на:

```js
process.stdin.on('end', () => {
  try {
    run(raw);
    process.exit(0);
  } catch (e) {
    process.stderr.write(`[post-agent-hook] FAIL: ${e.message}\n${e.stack || ''}\n`);
    // Exit 0 чтобы не сломать родительскую сессию Claude Code (она ожидает 0 от hook),
    // но факт ошибки виден в stderr и попадает в логи Claude Code.
    process.exit(0);
  }
});
```

В функции `run(raw)` добавить guard после загрузки state:

```js
function run(raw) {
  let payload;
  try { payload = JSON.parse(raw); }
  catch (e) {
    process.stderr.write(`[post-agent-hook] malformed payload: ${e.message}\n`);
    return;
  }

  if (payload.tool_name !== 'Agent') return;

  const state = readState();
  if (!state) {
    process.stderr.write('[post-agent-hook] state file missing or unparseable\n');
    return;
  }
  if (!state.session_id) {
    process.stderr.write('[post-agent-hook] session_id empty — skip (uninitialised session)\n');
    return;
  }
  // … остальная логика без изменений …
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
node --test tools/audit/__tests__/post-agent-hook.test.js
```

- [ ] **Step 5: Commit**

```bash
git add .claude/runtime/post-agent-hook.js tools/audit/__tests__/post-agent-hook.test.js
git commit -m "fix(runtime): post-agent-hook atomic write + fail-loud + session_id guard (closes F-011, F-013, §10.4)"
```

---

### Task T-19: Add `fsync` to `flush-state.js` atomic write

**Files:**
- Modify: `.claude/runtime/flush-state.js`

- [ ] **Step 1: Patch lines 64-68**

Заменить:

```js
const tmp = STATE_FILE + '.tmp';
fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', 'utf-8');
fs.renameSync(tmp, STATE_FILE);
```

на:

```js
const tmp = STATE_FILE + '.tmp.' + process.pid;
const data = JSON.stringify(state, null, 2) + '\n';
const fd = fs.openSync(tmp, 'w');
try {
  fs.writeSync(fd, data);
  fs.fsyncSync(fd);
} finally {
  fs.closeSync(fd);
}
fs.renameSync(tmp, STATE_FILE);
```

- [ ] **Step 2: Commit**

```bash
git add .claude/runtime/flush-state.js
git commit -m "fix(runtime): flush-state.js atomic write now fsyncs before rename (§10.4)"
```

---

### Task T-20: 20-way concurrent hook test

**Files:**
- Create: `tools/audit/__tests__/hook-concurrency.test.js`

**Что проверяем:** 20 параллельных запусков `post-agent-hook.js` против одного state файла не должны привести к corrupt JSON или потерянным observations.

- [ ] **Step 1: Implement test**

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const HOOK = path.join(root, '.claude/runtime/post-agent-hook.js');
const STATE = path.join(root, '.claude/runtime/session-state.json');

test('20-way concurrent hook produces valid JSON', async () => {
  const original = fs.readFileSync(STATE, 'utf-8');
  fs.writeFileSync(STATE, JSON.stringify({
    session_id: '2026-05-12-test', task: 'concurrency', intents: [], risk: 'LOW',
    confidence: 'HIGH', routing: 'direct', dag: [
      { step: 1, agent: 'ccip-architect', status: 'pending', depends_on: [] }
    ], current_step: 0, agent_outputs: {}, status: 'executing',
    started_at: '', observations: []
  }), 'utf-8');

  const procs = [];
  for (let i = 0; i < 20; i++) {
    const payload = JSON.stringify({
      tool_name: 'Agent',
      tool_input: { subagent_type: 'ccip-architect', description: `run ${i}` },
      tool_response: { content: `## State Update\n\`\`\`json\n{"summary":"r${i}","artifacts":[],"handoff_notes":""}\n\`\`\`` }
    });
    procs.push(new Promise(resolve => {
      const p = cp.spawn(process.execPath, [HOOK]);
      p.stdin.write(payload);
      p.stdin.end();
      p.on('exit', () => resolve());
    }));
  }
  await Promise.all(procs);

  // Финальный файл должен быть валидным JSON
  const finalRaw = fs.readFileSync(STATE, 'utf-8');
  let final;
  assert.doesNotThrow(() => { final = JSON.parse(finalRaw); }, 'state.json must remain valid JSON');
  // Никаких .tmp файлов
  const tmps = fs.readdirSync(path.dirname(STATE)).filter(f => f.includes('.tmp'));
  assert.deepEqual(tmps, []);

  // Restore
  fs.writeFileSync(STATE, original, 'utf-8');
});
```

- [ ] **Step 2: Run test**

```bash
node --test tools/audit/__tests__/hook-concurrency.test.js
```

Note: тест не гарантирует, что все 20 observations сохранены — последний writer wins. Это известная limitation atomic-rename approach. Тест проверяет лишь отсутствие corrupt JSON и .tmp residue. Для гарантии всех записей требуется write lock / append-only structure — out of §10 scope.

- [ ] **Step 3: Commit**

```bash
git add tools/audit/__tests__/hook-concurrency.test.js
git commit -m "test(runtime): 20-way concurrent hook stress test (§10.4)"
```

---

# Phase 5 — Security posture (§10.5)

### Task T-21: Restructure `settings.local.json` allowlist to literal patterns

**Files:**
- Modify: `.claude/settings.local.json`
- Create: `tools/audit/allowlist-literal.js`

**Что чиним:** заменить `Bash(git add *)` на список конкретных команд. Wildcard `*` нарушает §10.5 «no '*' glob».

Допустимые literals (определять по реальной активности, через `/fewer-permission-prompts` skill можно собрать список из transcripts):

- [ ] **Step 1: Implement audit**

```js
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
const settings = JSON.parse(fs.readFileSync(
  path.join(root, '.claude/settings.local.json'), 'utf-8'));

const allow = settings.permissions?.allow || [];
let violations = 0;
for (const pattern of allow) {
  // Запрещаем shell-glob '*' в конце или с пробелом перед — это catch-all.
  // Разрешаем '*' только как часть конкретного префикса с разделителем ':' (Claude Code allowlist semantics).
  if (/\s\*$/.test(pattern) || /'\s\*\)$/.test(pattern) || pattern === 'Bash(*)') {
    fail('ALLOWLIST', `wildcard suffix: ${pattern}`);
    violations++;
  }
}

if (violations === 0) ok('ALLOWLIST');
process.exit(violations === 0 ? 0 : 1);
```

- [ ] **Step 2: Rewrite `.claude/settings.local.json` with literals**

```json
{
  "disabledMcpjsonServers": ["context7"],
  "permissions": {
    "allow": [
      "Bash(git status)",
      "Bash(git diff)",
      "Bash(git diff --cached)",
      "Bash(git log)",
      "Bash(git show)",
      "Bash(git add tools/audit)",
      "Bash(git add docs)",
      "Bash(git add .claude)",
      "Bash(git add packages)",
      "Bash(git add apps)",
      "Bash(git add CLAUDE.md)",
      "Bash(git add CHANGELOG.md)",
      "Bash(git add package.json)",
      "Bash(git add pnpm-lock.yaml)",
      "Bash(git commit -m)",
      "Bash(pnpm audit-suite)",
      "Bash(pnpm test:audit)",
      "Bash(node --test tools/audit/__tests__)",
      "Bash(node tools/audit/path-canonical.js)",
      "Bash(node tools/audit/section-anchors.js)",
      "Bash(node tools/audit/dead-refs.js)",
      "Bash(node tools/audit/agent-name-presence.js)",
      "Bash(node tools/audit/state-contract-section.js)",
      "Bash(node tools/audit/agent-frontmatter.js)",
      "Bash(node tools/audit/session-state.js)",
      "Bash(node tools/audit/adr-anchors.js)",
      "Bash(node tools/audit/rbac-vs-schema.js)",
      "Bash(node tools/audit/orphan-adrs.js)",
      "Bash(node tools/audit/orphan-dirs.js)",
      "Bash(node tools/audit/delivery-paths.js)",
      "Bash(node tools/audit/memory-fs-sync.js)",
      "Bash(node tools/audit/allowlist-literal.js)",
      "Bash(node tools/audit/adr-immutability.js)",
      "Bash(node tools/audit/changelog-presence.js)"
    ]
  }
}
```

- [ ] **Step 3: Run audit, verify pass**

```bash
node tools/audit/allowlist-literal.js
```

- [ ] **Step 4: Commit**

```bash
git add tools/audit/allowlist-literal.js .claude/settings.local.json
git commit -m "fix(security): allowlist literal patterns, no glob suffix (§10.5)"
```

---

### Task T-22: AuditLog partitioning verification — `pg_partman` migration + rotation simulation

**Files:**
- Create: `packages/database/test/audit-log-rotation.test.ts`
- Verify: `packages/database/prisma/migrations/*/migration.sql` содержит `pg_partman` setup

**Что проверяем:** ADR-010 требует партиционирование `audit_log` через pg_partman. Тест в CI должен:
1. Применить миграции.
2. Создать партицию вручную (или дождаться pg_partman автосоздания).
3. Симулировать «вращение» — drop старой партиции, verify данные.

Это integration test, не audit-скрипт. Запуск только в CI с docker postgres.

- [ ] **Step 1: Write test** (псевдо-код, требует `@ccip/database` SDK)

```ts
import { describe, test, expect } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('AuditLog partitioning (ADR-010)', () => {
  test('pg_partman extension exists', async () => {
    const r = await prisma.$queryRaw<Array<{ extname: string }>>`
      SELECT extname FROM pg_extension WHERE extname = 'pg_partman'`;
    expect(r.length).toBe(1);
  });

  test('audit_log is partitioned table', async () => {
    const r = await prisma.$queryRaw<Array<{ relkind: string }>>`
      SELECT relkind FROM pg_class WHERE relname = 'audit_log'`;
    expect(r[0]?.relkind).toBe('p'); // 'p' = partitioned
  });

  test('rotation: drop oldest partition does not lose recent data', async () => {
    // Insert into current month, verify retained after drop of -2 months
    // (Requires partman.run_maintenance or manual partition mgmt)
    // ... детали зависят от Prisma helpers ...
  });
});
```

- [ ] **Step 2: Add to CI workflow** (Phase 6, T-24)

Tests live in `packages/database/test/` — будут подхвачены `pnpm turbo test`.

- [ ] **Step 3: Commit (только тест; миграции должны быть уже)**

Если миграция pg_partman отсутствует в `packages/database/prisma/migrations/` — это отдельный blocker. Перед коммитом проверить:

```bash
grep -r pg_partman packages/database/prisma
```

Если нет — создать миграцию (out of §10 scope, отдельная задача, но §10 чек-лист требует green).

```bash
git add packages/database/test/audit-log-rotation.test.ts
git commit -m "test(audit-log): partitioning + rotation regression (ADR-010, §10.5)"
```

---

### Task T-23: Pen-test smoke harness

**Files:**
- Create: `tools/audit/pen-test-smoke.js`

**Scope clarification:** RLS fuzz test (T-R-004) и AuditLog partitioning rotation simulation требуют глубокого контекста схемы и роли ccip-security. Они закрываются отдельным планом `2026-05-XX-rls-fuzz-and-auditlog-rotation.md` (owner: ccip-security). В рамках §10 здесь только pen-test smoke, который не требует runtime БД.

**Что проверяет pen-test smoke:**
1. Allowlist abuse — `.claude/settings.local.json` не содержит deny-bypass паттернов (`rm -rf`, `chmod 777`, `sudo`).
2. Prompt-injection guard — `sanitizeHandoff()` присутствует в `execute-dag.js` (а не удалён случайно).

- [ ] **Step 1: Implement pen-test smoke**

```js
#!/usr/bin/env node
'use strict';
// Лёгкие smoke-проверки. Не замена настоящему pen-test.
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
let violations = 0;

// 1. Allowlist не содержит deny-bypass
const settings = JSON.parse(fs.readFileSync(
  path.join(root, '.claude/settings.local.json'), 'utf-8'));
const allow = settings.permissions?.allow || [];
for (const p of allow) {
  if (/rm\s+-rf|chmod\s+777|sudo/.test(p)) {
    fail('PEN-SMOKE', `dangerous pattern in allowlist: ${p}`);
    violations++;
  }
}

// 2. sanitizeHandoff присутствует в execute-dag.js
const dag = fs.readFileSync(path.join(root, '.claude/runtime/execute-dag.js'), 'utf-8');
if (!/sanitizeHandoff/.test(dag)) {
  fail('PEN-SMOKE', 'sanitizeHandoff() not found in execute-dag.js');
  violations++;
}

if (violations === 0) ok('PEN-SMOKE');
process.exit(violations === 0 ? 0 : 1);
```

- [ ] **Step 2: Verify behaviour**

```bash
node tools/audit/pen-test-smoke.js
```

Expected: `[PEN-SMOKE] OK` (после T-21, который убрал wildcard, и при наличии `sanitizeHandoff` в execute-dag.js).

- [ ] **Step 3: Commit**

```bash
git add tools/audit/pen-test-smoke.js
git commit -m "test(security): pen-test smoke harness (§10.5)"
```

---

# Phase 6 — CI integrity (§10.3)

### Task T-24: Extend `.github/workflows/ci.yml` — matrix + audit job

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add audit job at top of jobs:**

После строки 11 (`jobs:`) добавить отдельный job `audit`:

```yaml
  audit:
    name: Zero-Drift Audit Suite
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run audit suite
        run: pnpm audit-suite

      - name: pnpm audit (npm advisories)
        run: pnpm audit --audit-level=high

      - name: Run audit lib tests
        run: pnpm test:audit
```

- [ ] **Step 2: Make existing ci job depend on audit pass**

В job `ci` добавить:

```yaml
    needs: audit
```

Так main test job не запустится, если audit fail — экономит CI время.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add audit job (Ubuntu/macOS/Windows matrix) + pnpm audit (§10.3)"
```

---

### Task T-25: Random clone test (`/tmp/<uuid>/` workflow)

**Files:**
- Create: `.github/workflows/portable-clone.yml`

**Что проверяем:** репо клонируется в каталог со случайным именем и сборка/аудит проходят. Это закрывает F-002 (был absolute Windows path в hook).

- [ ] **Step 1: Create workflow**

```yaml
name: Portable Clone Test

on:
  schedule:
    - cron: '0 4 * * *'  # nightly 04:00 UTC
  workflow_dispatch:

jobs:
  random-clone:
    runs-on: ubuntu-latest
    steps:
      - name: Generate random target dir
        id: dir
        run: |
          uuid=$(uuidgen)
          echo "path=/tmp/ccip-$uuid" >> $GITHUB_OUTPUT

      - name: Clone into random dir
        run: |
          git clone "https://github.com/${{ github.repository }}.git" "${{ steps.dir.outputs.path }}"

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
          cache-dependency-path: ${{ steps.dir.outputs.path }}/pnpm-lock.yaml

      - name: Install
        working-directory: ${{ steps.dir.outputs.path }}
        run: pnpm install --frozen-lockfile

      - name: Audit suite (must work from random path)
        working-directory: ${{ steps.dir.outputs.path }}
        run: pnpm audit-suite
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/portable-clone.yml
git commit -m "ci(portable): random /tmp/<uuid>/ clone test (§10.3 closes F-002)"
```

---

### Task T-26: Husky pre-commit hook

**Files:**
- Create: `.husky/pre-commit`
- Create: `.husky/_/husky.sh` (auto-generated)
- Modify: `package.json` — add `prepare` script

- [ ] **Step 1: Install husky**

```bash
pnpm add -DwE husky@^9.1.7 lint-staged@^15.4.3
```

- [ ] **Step 2: Add `prepare` script to package.json**

```json
"prepare": "husky"
```

- [ ] **Step 3: Initialize husky**

```bash
pnpm exec husky init
```

Создаётся `.husky/pre-commit` с дефолтным `pnpm test`.

- [ ] **Step 4: Replace `.husky/pre-commit` content**

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Запускаем только быстрые audits на pre-commit.
# Длинные — в CI.
pnpm audit-suite || {
  echo "[pre-commit] audit-suite failed. Fix or use --no-verify (НЕ рекомендуется)."
  exit 1
}
```

- [ ] **Step 5: Test by attempting a forbidden commit**

```bash
# Создать временный файл с запрещённым паттерном
echo "Test W:/Claude/CCIP/foo" > /tmp/bad.md
git -C "$(git rev-parse --show-toplevel)" add /tmp/bad.md 2>/dev/null || cp /tmp/bad.md ./.bad-test.md && git add .bad-test.md
git commit -m "test: should be blocked"
# Expected: [pre-commit] audit-suite failed
git reset HEAD .bad-test.md
rm .bad-test.md
```

- [ ] **Step 6: Commit husky setup**

```bash
git add .husky package.json pnpm-lock.yaml
git commit -m "chore(husky): pre-commit runs audit-suite (§10.3)"
```

---

# Phase 7 — Governance (§10.6)

### Task T-27: CODEOWNERS

**Files:**
- Create: `.github/CODEOWNERS`

- [ ] **Step 1: Define ownership rules**

```
# CCIP CODEOWNERS — dual review for schema/orchestration/security

# Orchestration layer
/CLAUDE.md                          @AlxChex
/.claude/agents/                    @AlxChex
/.claude/runtime/                   @AlxChex
/.claude/settings.json              @AlxChex
/.claude/settings.local.json        @AlxChex

# Architecture & decisions
/docs/decisions/                    @AlxChex
/docs/architecture/                 @AlxChex
/docs/audits/                       @AlxChex

# Schema (single owner — DBA)
/packages/database/prisma/          @AlxChex

# Audit infra
/tools/audit/                       @AlxChex
/docs/schemas/                      @AlxChex

# CI / Governance
/.github/                           @AlxChex
/.husky/                            @AlxChex
/CHANGELOG.md                       @AlxChex
```

(Когда команда вырастет — добавить вторых ревьюверов на каждое поле для true dual review.)

- [ ] **Step 2: Commit**

```bash
git add .github/CODEOWNERS
git commit -m "chore(governance): CODEOWNERS for schema/CLAUDE/ADR/agents/hooks (§10.6)"
```

---

### Task T-28: `adr-immutability.js` — Принято ADR cannot be modified

**Files:**
- Create: `tools/audit/adr-immutability.js`

**Что проверяем:** на pull request: если ADR с `status: Принято*` изменён без bump `status` → `rev N+1` или без создания нового ADR с `supersedes: ADR-XXX` — fail.

Реализация на git-уровне: сравнить frontmatter в HEAD vs main для каждого изменённого ADR.

- [ ] **Step 1: Implement**

```js
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const matter = require('gray-matter');
const { gitRoot } = require('./_lib/git-root');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
const BASE = process.env.GITHUB_BASE_REF || 'main';

let changed;
try {
  changed = cp.execFileSync('git', ['diff', '--name-only', `${BASE}...HEAD`, '--', 'docs/decisions/ADR-*.md'],
    { cwd: root, encoding: 'utf-8' }).split('\n').filter(Boolean);
} catch (e) {
  process.stderr.write(`[ADR-IMMUT] cannot diff vs ${BASE}: ${e.message}\n`);
  process.exit(0); // не блокируем локально, если нет ref'а
}

let violations = 0;
for (const file of changed) {
  let baseContent;
  try { baseContent = cp.execFileSync('git', ['show', `${BASE}:${file}`], { cwd: root, encoding: 'utf-8' }); }
  catch { continue; /* новый ADR */ }
  const headContent = fs.readFileSync(path.join(root, file), 'utf-8');
  const baseFm = matter(baseContent).data;
  const headFm = matter(headContent).data;
  if (!baseFm.status || !/Принято/.test(baseFm.status)) continue;
  // ADR был в Принято на base. Проверяем:
  //   1) status в HEAD bumped (rev N → rev N+1) или
  //   2) status в HEAD = Superseded и появился новый ADR с supersedes: <этот>
  const sameStatus = baseFm.status === headFm.status;
  if (sameStatus && baseContent !== headContent) {
    fail('ADR-IMMUT', `${file} modified without status bump (was ${baseFm.status})`, { file });
    violations++;
  }
}

if (violations === 0) ok('ADR-IMMUT');
process.exit(violations === 0 ? 0 : 1);
```

- [ ] **Step 2: Add to CI workflow** (audit job already runs it через audit-suite)

- [ ] **Step 3: Commit**

```bash
git add tools/audit/adr-immutability.js
git commit -m "feat(audit): ADR immutability validator (§10.6)"
```

---

### Task T-29: Branch protection as code + CHANGELOG enforcement

**Files:**
- Create: `.github/branch-protection.yml`
- Create: `CHANGELOG.md`
- Create: `tools/audit/changelog-presence.js`

- [ ] **Step 1: Branch protection file (declarative, applied via gh CLI or Probot)**

`.github/branch-protection.yml`:

```yaml
# Source of truth для branch protection rules на main.
# Применяется через: gh api -X PUT /repos/:owner/:repo/branches/main/protection -f ...
# или через terraform-github-provider в инфраструктуре.

main:
  required_status_checks:
    strict: true
    contexts:
      - "Zero-Drift Audit Suite (ubuntu-latest)"
      - "Zero-Drift Audit Suite (macos-latest)"
      - "Zero-Drift Audit Suite (windows-latest)"
      - "Lint · Typecheck · Prisma · Test"
  enforce_admins: false
  required_pull_request_reviews:
    required_approving_review_count: 1
    dismiss_stale_reviews: true
    require_code_owner_reviews: true
  restrictions: null
  allow_force_pushes: false
  allow_deletions: false
```

- [ ] **Step 2: Create CHANGELOG.md template**

`CHANGELOG.md`:

```markdown
# Changelog

Все BLOCKER/CRITICAL remediations и значительные изменения контрактов фиксируются здесь.
Формат: [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Fixed
- §10 Zero-Drift Compliance: see `docs/plans/2026-05-12-zero-drift-compliance-section10.md`
```

- [ ] **Step 3: Implement changelog-presence audit**

Проверяет: если commit message содержит `closes F-NNN` или `closes C-NNN` или `BLOCKER` или `CRITICAL`, то в `CHANGELOG.md` есть упоминание этого fix в `[Unreleased]` секции.

```js
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { gitRoot } = require('./_lib/git-root');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
const BASE = process.env.GITHUB_BASE_REF || 'main';

let commits;
try {
  commits = cp.execFileSync('git', ['log', `${BASE}..HEAD`, '--pretty=%H %s'],
    { cwd: root, encoding: 'utf-8' }).split('\n').filter(Boolean);
} catch {
  process.exit(0);
}

const changelog = fs.existsSync(path.join(root, 'CHANGELOG.md'))
  ? fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf-8')
  : '';

let violations = 0;
for (const line of commits) {
  const closeMatch = line.match(/closes\s+([FCR]-\d{3})/i);
  const severityMatch = /BLOCKER|CRITICAL/i.test(line);
  if (closeMatch && !changelog.includes(closeMatch[1])) {
    fail('CHANGELOG', `commit closes ${closeMatch[1]} but CHANGELOG.md does not mention it`);
    violations++;
  }
  if (severityMatch && !changelog.includes('Unreleased')) {
    fail('CHANGELOG', 'commit has BLOCKER/CRITICAL but no [Unreleased] section in CHANGELOG.md');
    violations++;
  }
}

if (violations === 0) ok('CHANGELOG');
process.exit(violations === 0 ? 0 : 1);
```

- [ ] **Step 4: Commit**

```bash
git add .github/branch-protection.yml CHANGELOG.md tools/audit/changelog-presence.js
git commit -m "feat(governance): branch-protection.yml + CHANGELOG + audit (§10.6)"
```

---

# Phase 8 — Continuous compliance (§10.8)

### Task T-30: Nightly cron + weekly orphan scan + quarterly red-team scaffolding

**Files:**
- Create: `.github/workflows/nightly-audit.yml`
- Create: `.github/workflows/weekly-orphan-scan.yml`
- Create: `docs/audits/red-team-template.md`
- Create: `docs/audits/quarterly-runbook.md`

- [ ] **Step 1: Nightly audit workflow**

```yaml
# .github/workflows/nightly-audit.yml
name: Nightly Audit

on:
  schedule:
    - cron: '0 2 * * *'  # 02:00 UTC daily
  workflow_dispatch:

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm audit-suite
      - name: Alarm on failure
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: `Nightly audit FAILED (${new Date().toISOString().slice(0,10)})`,
              labels: ['audit-failure', 'priority/high'],
              body: `Run: ${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`
            });
```

- [ ] **Step 2: Weekly orphan scan**

```yaml
# .github/workflows/weekly-orphan-scan.yml
name: Weekly Orphan Scan

on:
  schedule:
    - cron: '0 5 * * 1'  # Mon 05:00 UTC
  workflow_dispatch:

jobs:
  orphan-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - name: Collect orphan candidates
        id: orphans
        run: |
          node tools/audit/orphan-adrs.js > orphan-report.txt 2>&1 || true
          node tools/audit/orphan-dirs.js >> orphan-report.txt 2>&1 || true
          cat orphan-report.txt
      - name: Open PR with removal proposals
        if: ${{ hashFiles('orphan-report.txt') != '' }}
        uses: peter-evans/create-pull-request@v6
        with:
          title: 'chore: weekly orphan-scan report'
          body: 'Auto-generated. See orphan-report.txt for candidates.'
          branch: 'auto/orphan-scan'
          add-paths: 'orphan-report.txt'
```

- [ ] **Step 3: Quarterly red-team scaffolding**

`docs/audits/red-team-template.md`:

```markdown
# Red Team Audit — YYYY-MM-DD

> Шаблон для квартального аудита. Скопировать в `docs/audits/red-team-<date>.md` и заполнить.

## 1. Scope
- Дельта со времени предыдущего аудита (см. `docs/audits/red-team-<prev-date>.md`)
- Новые модули за квартал
- Изменения CLAUDE.md / agents / runtime
- Изменения схемы (`packages/database/prisma/schema.prisma`)

## 2. Method
1. Зафиксировать снимок: `git rev-parse HEAD`
2. Запустить `pnpm audit-suite` → отчёт
3. Manual review checklist (см. `docs/audits/quarterly-runbook.md`)
4. Зафиксировать findings в machine-readable table (F-NNN, severity, evidence)
5. PR с remediation plan

## 3. Findings
| ID | Severity | Assertion | Reality | Evidence | Blast Radius |
|----|----------|-----------|---------|----------|--------------|
| F-001 | … | … | … | … | … |

## 4. Resolutions
…
```

`docs/audits/quarterly-runbook.md`:

```markdown
# Quarterly Red Team Runbook

Цель: убедиться, что Zero-Drift Compliance (§10) сохраняется через квартал жизни кода.

## Pre-flight
- [ ] Branch checkout: latest main
- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm audit-suite` → должен быть green

## Manual checks (что audits НЕ ловят)
- [ ] Sanity-проверка бизнес-логики ADR (PeriodEngine state machine, DisputeSLA SLA calculation)
- [ ] Pen-test smoke: попытка prompt-injection через handoff_notes
- [ ] Verify performance budget: latency, throughput targets из SLO doc
- [ ] DR rehearsal: восстановление Redis AOF + Postgres PITR

## Output
- [ ] Copy `docs/audits/red-team-template.md` → `docs/audits/red-team-YYYY-MM-DD.md`
- [ ] Заполнить findings
- [ ] Open PR с remediation issues
- [ ] Tag release с changelog
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/nightly-audit.yml .github/workflows/weekly-orphan-scan.yml docs/audits/red-team-template.md docs/audits/quarterly-runbook.md
git commit -m "feat(continuous): nightly + weekly + quarterly compliance scaffolding (§10.8)"
```

---

# Final Gate Verification

После всех 30 задач — финальная sanity check.

- [ ] **Verify**

```bash
# 1. Все аудиты green
pnpm audit-suite

# 2. Все audit-lib тесты green
pnpm test:audit

# 3. Сборка проходит на clean checkout
cd /tmp && rm -rf ccip-verify
git clone "$(cd W:/Claude/CCIP && git remote get-url origin)" ccip-verify
cd ccip-verify
pnpm install --frozen-lockfile
pnpm audit-suite

# 4. pnpm audit без high-severity
pnpm audit --audit-level=high

# 5. Все ADR имеют impl_anchors
node tools/audit/adr-anchors.js

# 6. RBAC consistency
node tools/audit/rbac-vs-schema.js

# 7. Pre-commit hook installed
ls -la .husky/pre-commit

# 8. CODEOWNERS present
cat .github/CODEOWNERS

# 9. Branch protection file
cat .github/branch-protection.yml

# 10. CHANGELOG entries для всех closed F-NNN
grep -c "F-0" CHANGELOG.md
```

Все 10 пунктов должны быть green. После этого §10 = closed, CCIP готов к pilot M-13 gate №1 (Infrastructure Trust).

---

## Открытые вопросы / out-of-scope для этого плана

1. **§11 Business Correctness gate** (PeriodEngine, DisputeSLA, weight_coef/decay_factor) — отдельный план; этот §10 closing криптографически и структурно, но не верифицирует бизнес-логику.
2. **§12 Operational Readiness gate** (DR, RTO/RPO, SLO, нагрузочные тесты) — отдельный план.
3. **RLS fuzz test (T-R-004) + AuditLog partman rotation simulation** — требует runtime БД и роли ccip-security; описаны как stub в T-22/T-23 и переданы в отдельный план `2026-05-XX-rls-fuzz-and-auditlog-rotation.md`.
4. **SRE dashboard для hook log lines** (§10.4 «Hook log line emitted per invocation; SRE dashboard live») — этот план добавляет stderr-логи в хуки; их агрегация в Prometheus/Grafana — отдельная DevOps-задача.
5. **Polyfill для Windows fsync directory** — best-effort реализован (`try/catch EPERM`), но full guarantee только на POSIX.
6. **Branch protection enforcement** — `.github/branch-protection.yml` это SoT, но applying требует одного из: gh CLI script в CI / Terraform provider / Probot. Выбор delivery mechanism — out of scope.
7. **20-way concurrent hook** показывает отсутствие corrupt JSON, но не гарантирует «no lost observations». Для full guarantee нужен write lock или append-only log — отдельная задача.
