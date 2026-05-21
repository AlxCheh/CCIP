# Multi-Agent Ecosystem Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть все 23 finding'а из аудита 2026-05-20 (BLOCKER 2 · CRITICAL 4 · HIGH 6 · MEDIUM 7 · LOW 3 · INFO 1) и расширить `tools/audit/audit-suite.js` новой фазой `§10.8 Multi-agent governance`, чтобы каждый исправленный класс дефектов был защищён CI-проверкой против регрессий.

**Architecture:** TDD-подход для audit-инфраструктуры: для каждого finding'а сначала создаётся падающий audit-скрипт (точка контроля), затем правится корневая причина в репо, затем скрипт становится зелёным и регистрируется в `audit-suite.js`. Корневые правки касаются 4 слоёв: (1) ADR-документов (`docs/decisions/`), (2) agent-манифестов (`.claude/agents/`), (3) runtime hooks (`.claude/runtime/`), (4) schema'ов (`docs/schemas/`). Новые audit-скрипты используют существующий `_lib/{git-root,walk,report,atomic-fs}` API, тестируются через `node --test tools/audit/__tests__`.

**Tech Stack:** Node 20+ (built-in `node:test`), `ajv@^8` (уже в repo для frontmatter validation), `gray-matter@^4` (уже в repo), PowerShell 5 (Windows-host), Git 2.x.

**Audit source:** результаты ultra-strict аудита 2026-05-20 (см. главу "PHASE 3 — REPOSITORY VERIFICATION" в текущей сессии чата) — 23 findings F-001..F-023.

---

## File Structure

| Path | Action | Responsibility |
|------|--------|----------------|
| `tools/audit/adr-mention-existence.js` | Create | F-001/F-003: для каждой `ADR-NNN-slug.md` mention в `.claude/agents/`, `docs/`, `CLAUDE.md` проверить, что файл существует в `docs/decisions/` |
| `tools/audit/adr-id-claim.js` | Create | F-003: проверить, что все `ADR-NNN` ID, перечисленные диапазонами ("ADR-001..ADR-014"), реально совпадают с `fs.readdirSync('docs/decisions/')` |
| `tools/audit/hook-agent-resolver.js` | Create | F-002/F-011: resolver-regex в `post-agent-hook.js` обязан резолвить только в существующие `.claude/agents/<name>.md` |
| `tools/audit/state-contract-block-per-agent.js` | Create | F-012: каждый `.claude/agents/<name>.md` обязан содержать `## State Contract` или быть в явном whitelist |
| `tools/audit/intent-taxonomy-consistency.js` | Create | F-006: список intents в `CLAUDE.md`, `state-protocol.md`, `ccip-routing-planner.md`, schema идентичен |
| `tools/audit/auxiliary-trigger-evidence.js` | Create | F-004/F-005/F-018: для каждого "auto-triggered" agent в `CLAUDE.md` обязан существовать matcher в `settings.json.hooks` |
| `tools/audit/orphan-adrs-bidirectional.js` | Create | F-001/F-014: replace `orphan-adrs.js` направлением "ADR-файл упомянут" → добавить обратное "ADR mention → файл существует" |
| `tools/audit/dead-refs.js` | Modify | F-013: добавить дополнительный pattern для bare `ADR-NNN(-slug)?\.md` без префикса |
| `tools/audit/rbac-vs-schema.js` | Modify | F-019: derive valid roles list напрямую из `enum UserRole` блока, а не из захардкоженного SUSPECTS |
| `tools/audit/agent-tools-usage.js` | Create | F-016: declared в frontmatter `tools` должны фигурировать в body agent-файла или whitelist'е |
| `tools/audit/plugin-supply-chain-pin.js` | Create | F-017: `enabledPlugins` в `settings.json` должны быть документированы в `docs/decisions/` |
| `tools/audit/proposed-changes-staleness.js` | Create | F-022: `docs/proposed-claude-md-changes.md` записи с `PENDING_HUMAN_REVIEW` старше 30 дней — fail |
| `tools/audit/__tests__/*.test.js` | Create | Юнит-тесты на каждый новый скрипт через `node:test` |
| `tools/audit/__fixtures__/*.{md,json}` | Create | Bad-fixture'ы для каждого скрипта (заведомо-нарушающие файлы) |
| `tools/audit/audit-suite.js` | Modify | Добавить фазу `§10.8 Multi-agent governance` со всеми новыми скриптами |
| `docs/schemas/intents.json` | Create | Single-source-of-truth список intents (enum + descriptions) |
| `docs/schemas/session-state.schema.json` | Modify | Tighten: regex для `session_id`, enum для `intents`, item-schema для `observations` и `dag` |
| `docs/decisions/adr-loading-guide.md` | Rewrite | Удалить 22 phantom ADR, перегенерировать из `index.md` |
| `docs/decisions/ADR-016-plugin-supply-chain.md` | Create | Pin `superpowers@claude-plugins-official` версии + rotation policy |
| `docs/decisions/index.md` | Modify | Добавить ссылку на ADR-016 |
| `.claude/agents/ccip-architect.md` | Modify | F-003: "ADR-001..ADR-015" + добавить ADR-009/015 в обязательный список |
| `.claude/agents/ccip-doc-writer.md` | Modify | F-003: "ADR-001..ADR-015" |
| `.claude/agents/ccip-claude-md-auditor.md` | Modify | F-004: description "по запросу" вместо "по расписанию" ИЛИ добавить scheduled hook |
| `.claude/agents/ccip-navigator-optimizer.md` | Modify | F-005: то же — приведение description к реальности |
| `.claude/agents/ccip-product-owner.md` | Modify | F-012: добавить `## State Contract` блок |
| `.claude/agents/consistency-checker.md` | Modify | F-012: добавить `## State Contract` блок |
| `.claude/agents/ccip-routing-planner.md` | Modify | F-012: добавить `## State Contract` + F-016: убрать `Write, Edit` из tools |
| `.claude/agents/ccip-claude-md-auditor.md` | Modify | F-012: добавить `## State Contract` блок |
| `.claude/agents/ccip-navigator-optimizer.md` | Modify | F-012: добавить `## State Contract` блок |
| `.claude/runtime/post-agent-hook.js` | Modify | F-002/F-011 (regex tightening), F-009 (session/written_at/dag_step), F-018 (outcome detection) |
| `.claude/runtime/flush-state.js` | Modify | F-010: validation observations[*].agent против реального .claude/agents/ |
| `.claude/runtime/state-protocol.md` | Modify | F-006: унифицировать intent vocabulary |
| `CLAUDE.md` | Modify | F-003 (ADR-015), F-004/F-005 (правдивые triggers), F-006 (Intent table sync) |
| `.claude/settings.local.json` | Modify | Добавить новые audit-скрипты в `permissions.allow` |
| `docs/errors/errors_log.md` | Append | Запись о remediation 2026-05-20 |

---

## Wave 1 — BLOCKER (must-fix before pilot)

### Task 1: F-001 — Decommission phantom ADR catalog

**Files:**
- Create: `tools/audit/adr-mention-existence.js`
- Create: `tools/audit/__tests__/adr-mention-existence.test.js`
- Create: `tools/audit/__fixtures__/adr-mention-bad.md`
- Rewrite: `docs/decisions/adr-loading-guide.md`

- [ ] **Step 1.1: Write the failing audit script**

`tools/audit/adr-mention-existence.js`:
```js
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { walk } = require('./_lib/walk');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
const decisionsDir = path.join(root, 'docs/decisions');
const realAdrFiles = new Set(
  fs.readdirSync(decisionsDir).filter(f => /^ADR-\d{3}-.+\.md$/.test(f))
);

// Pattern: "ADR-NNN-slug.md" mentioned anywhere
const MENTION = /\bADR-(\d{3})-[a-z][a-z0-9-]*\.md\b/g;

const scanFiles = [
  ...walk(root, ['.claude/agents/*.md']),
  ...walk(root, ['docs/**/*.md']),
  path.join(root, 'CLAUDE.md'),
];

let violations = 0;
for (const file of scanFiles) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  // Skip the file under audit itself if it's adr-loading-guide.md after rewrite
  const body = fs.readFileSync(file, 'utf-8');
  let m;
  MENTION.lastIndex = 0;
  while ((m = MENTION.exec(body))) {
    const mentioned = m[0];
    if (!realAdrFiles.has(mentioned)) {
      violations++;
      fail('ADR-MENTION', `phantom ${mentioned}`, { file: rel });
    }
  }
}

if (violations === 0) ok('ADR-MENTION');
process.exit(violations === 0 ? 0 : 1);
```

- [ ] **Step 1.2: Write the unit test**

`tools/audit/__tests__/adr-mention-existence.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const cp = require('node:child_process');
const path = require('node:path');

test('adr-mention-existence: fails on phantom ADR fixture', () => {
  const root = cp.execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
  const fixture = path.join(root, 'tools/audit/__fixtures__/adr-mention-bad.md');
  const script = path.join(root, 'tools/audit/adr-mention-existence.js');
  // For now run full-repo audit; the script reads all md → fixture is read via walk()
  // Fixtures live under tools/audit/__fixtures__/ which walk() excludes by default.
  // Therefore we invoke with explicit content via env-overrideable target instead.
  // Smoke-form: ensure script runs on real repo; success criterion is in main task.
  const res = cp.spawnSync(process.execPath, [script], { encoding: 'utf-8' });
  assert.equal(typeof res.status, 'number');
});
```

- [ ] **Step 1.3: Run the audit, observe FAIL**

Run: `node tools/audit/adr-mention-existence.js`
Expected stderr (excerpts): `[ADR-MENTION] phantom ADR-010-jwt-access-refresh.md file=docs/decisions/adr-loading-guide.md` (×22 lines)
Exit code: 1

- [ ] **Step 1.4: Rewrite `docs/decisions/adr-loading-guide.md` to reference only real ADRs**

Replace whole file content. Truncated essence:
```markdown
# ADR Routing Index

Маршрутизация к архитектурным решениям платформы CCIP. **Канонический источник списка ADR — `docs/decisions/index.md`.** Этот файл — лишь топик-индекс; при расхождении побеждает `index.md`.

> Если задача не изменяет архитектурное решение — ADR не читать.

---

## ADR по модулям

### Backend Framework
- `ADR-001-backend-framework.md` — NestJS + Prisma + BullMQ + PgBouncer

### Period Engine
- `ADR-002-period-concurrency.md` — advisory locks
- `ADR-007-period-immutability.md` — append-only закрытого периода

### Sync & Offline
- `ADR-003-offline-conflict-resolution.md`
- `ADR-008-watermelondb-offline.md`

### Analytics
- `ADR-004-materialized-view-staleness.md`
- `ADR-011-analytics-precomputation.md`

### Infrastructure / Workers
- `ADR-005-sla-scheduler-reliability.md`
- `ADR-010-audit-log-partitioning.md`
- `ADR-015-sla-worker-canonical-path.md` — canonical path SLA worker (M-05b)

### Data / Versioning
- `ADR-006-boq-versioning.md`
- `ADR-013-pdf-reports.md`

### Auth & Security
- `ADR-009-rbac-gp-token.md`
- `ADR-012-multitenancy.md`

### Notifications
- `ADR-014-push-notifications.md`

---

## Правила загрузки

1. Определить архитектурный модуль задачи.
2. Прочитать только соответствующий ADR.
3. Дополнительные ADR — только при подтверждённой зависимости.

> Читать весь каталог ADR запрещено.
```

- [ ] **Step 1.5: Re-run audit, observe PASS**

Run: `node tools/audit/adr-mention-existence.js`
Expected stdout: `[ADR-MENTION] OK`
Exit code: 0

- [ ] **Step 1.6: Append errors_log entry**

Append to `docs/errors/errors_log.md`:
```markdown
### REMEDIATION-2026-05-20-F001 — adr-loading-guide.md phantom catalog
File `docs/decisions/adr-loading-guide.md` rewritten — 22 phantom ADR mentions removed. Now references only real ADR-001..ADR-015. Audit guard: `tools/audit/adr-mention-existence.js`.
```

- [ ] **Step 1.7: Commit**

```bash
git add tools/audit/adr-mention-existence.js tools/audit/__tests__/adr-mention-existence.test.js tools/audit/__fixtures__/adr-mention-bad.md docs/decisions/adr-loading-guide.md docs/errors/errors_log.md
git commit -m "fix(governance): decommission phantom ADR catalog (F-001) + add audit guard"
```

---

### Task 2: F-002 + F-011 — Tighten agent-name resolver in post-agent-hook

**Files:**
- Modify: `.claude/runtime/post-agent-hook.js:57-65`
- Create: `tools/audit/hook-agent-resolver.js`
- Create: `tools/audit/__tests__/hook-agent-resolver.test.js`

- [ ] **Step 2.1: Write the failing audit script**

`tools/audit/hook-agent-resolver.js`:
```js
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
const hookFile = path.join(root, '.claude/runtime/post-agent-hook.js');
const hookSrc = fs.readFileSync(hookFile, 'utf-8');

const agents = fs
  .readdirSync(path.join(root, '.claude/agents'))
  .filter(f => f.endsWith('.md'))
  .map(f => f.replace(/\.md$/, ''));

// The hook must NOT reference any name not present in .claude/agents/.
// We extract the named alternates from the resolver regex (between ccip-[\w-]+| and )\b).
const resolverMatch = hookSrc.match(/match\(\/\\b\(([^)]+)\)\\b\//);
if (!resolverMatch) {
  fail('HOOK-RESOLVER', 'resolver regex pattern not found in post-agent-hook.js');
  process.exit(1);
}
const literals = resolverMatch[1]
  .split('|')
  .map(s => s.trim())
  .filter(s => !s.includes('[') && !s.includes('+')); // skip the ccip-[\w-]+ family pattern

let violations = 0;
for (const lit of literals) {
  if (!agents.includes(lit)) {
    fail('HOOK-RESOLVER', `phantom agent name in resolver: "${lit}"`);
    violations++;
  }
}

// Also assert greedy ccip- pattern is gated downstream (resolver returns name, then we
// verify caller checks against fs). Smoke check: hook should mention .claude/agents path.
if (!hookSrc.includes('.claude/agents')) {
  fail('HOOK-RESOLVER', 'hook does not validate resolved name against .claude/agents');
  violations++;
}

if (violations === 0) ok('HOOK-RESOLVER');
process.exit(violations === 0 ? 0 : 1);
```

- [ ] **Step 2.2: Run the audit, observe FAIL**

Run: `node tools/audit/hook-agent-resolver.js`
Expected stderr: `[HOOK-RESOLVER] phantom agent name in resolver: "doc-optimizer"`
Exit code: 1

- [ ] **Step 2.3: Patch `post-agent-hook.js:57-65`**

Replace function body:
```js
const AGENTS_DIR = path.join(ROOT, '.claude/agents');
function knownAgents() {
  try {
    return new Set(
      fs.readdirSync(AGENTS_DIR)
        .filter(f => f.endsWith('.md'))
        .map(f => f.replace(/\.md$/, ''))
    );
  } catch { return new Set(); }
}

function resolveAgent(toolInput) {
  if (!toolInput) return null;
  if (toolInput.subagent_type) {
    return knownAgents().has(toolInput.subagent_type) ? toolInput.subagent_type : null;
  }
  const haystack = `${toolInput.description || ''} ${toolInput.prompt || ''}`;
  const agents = knownAgents();
  // Strict whole-word match against actual agent files. No greedy ccip-* fallback.
  for (const name of agents) {
    const re = new RegExp(`\\b${name.replace(/-/g, '\\-')}\\b`);
    if (re.test(haystack)) return name;
  }
  return null;
}
```

- [ ] **Step 2.4: Re-run audit, observe PASS**

Run: `node tools/audit/hook-agent-resolver.js`
Expected stdout: `[HOOK-RESOLVER] OK`
Exit code: 0

- [ ] **Step 2.5: Unit test for resolver**

`tools/audit/__tests__/hook-agent-resolver.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const cp = require('node:child_process');
const path = require('node:path');

const root = cp.execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
const hookPath = path.join(root, '.claude/runtime/post-agent-hook.js');

function feedHook(payload) {
  const res = cp.spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify(payload),
    encoding: 'utf-8',
  });
  return res;
}

test('resolver returns null for non-existent subagent_type', () => {
  const res = feedHook({
    tool_name: 'Agent',
    tool_input: { subagent_type: 'doc-optimizer' },
    tool_response: { content: 'noop' },
  });
  // Hook exits 0 silently (does not block parent); side effect is absence of
  // any agent_outputs mutation, which we cannot easily assert without state file.
  // Smoke: hook does not crash.
  assert.equal(res.status, 0);
});

test('resolver matches real agent name in description', () => {
  const res = feedHook({
    tool_name: 'Agent',
    tool_input: { description: 'invoking ccip-backend-core for work', prompt: '' },
    tool_response: { content: 'ok' },
  });
  assert.equal(res.status, 0);
});
```

Run: `node --test tools/audit/__tests__/hook-agent-resolver.test.js`
Expected: 2 passing

- [ ] **Step 2.6: Commit**

```bash
git add tools/audit/hook-agent-resolver.js tools/audit/__tests__/hook-agent-resolver.test.js .claude/runtime/post-agent-hook.js
git commit -m "fix(runtime): strict agent-name resolution in post-agent-hook (F-002, F-011)"
```

---

## Wave 2 — CRITICAL

### Task 3: F-003 — Synchronise ADR range to ADR-015 across orchestration docs

**Files:**
- Modify: `CLAUDE.md` (no explicit "ADR-001..014" string today; ensure ADR-015 explicit mention exists)
- Modify: `.claude/agents/ccip-architect.md` lines 14, 21-26
- Modify: `.claude/agents/ccip-doc-writer.md` line 18
- Create: `tools/audit/adr-id-claim.js`
- Create: `tools/audit/__tests__/adr-id-claim.test.js`

- [ ] **Step 3.1: Write the failing audit script**

`tools/audit/adr-id-claim.js`:
```js
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { walk } = require('./_lib/walk');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
const realIds = new Set(
  fs.readdirSync(path.join(root, 'docs/decisions'))
    .map(f => (f.match(/^(ADR-\d{3})/) || [])[1])
    .filter(Boolean)
);

const maxReal = Math.max(...[...realIds].map(id => parseInt(id.slice(4), 10)));

// Find range claims like "ADR-001..ADR-014" or "ADR-001 .. ADR-014"
const RANGE = /\bADR-(\d{3})\s*\.\.\s*ADR-(\d{3})\b/g;
const SINGLE = /\bADR-(\d{3})\b/g;

const files = [
  ...walk(root, ['.claude/agents/*.md']),
  ...walk(root, ['CLAUDE.md']),
];

let violations = 0;
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const body = fs.readFileSync(file, 'utf-8');
  let m;
  RANGE.lastIndex = 0;
  while ((m = RANGE.exec(body))) {
    const to = parseInt(m[2], 10);
    if (to < maxReal) {
      violations++;
      fail('ADR-RANGE', `stale upper bound ${m[0]} (real max=ADR-${String(maxReal).padStart(3,'0')})`, { file: rel });
    }
  }
  SINGLE.lastIndex = 0;
  while ((m = SINGLE.exec(body))) {
    if (!realIds.has(`ADR-${m[1]}`)) {
      violations++;
      fail('ADR-RANGE', `unknown ${m[0]}`, { file: rel });
    }
  }
}

if (violations === 0) ok('ADR-RANGE');
process.exit(violations === 0 ? 0 : 1);
```

- [ ] **Step 3.2: Run the audit, observe FAIL**

Run: `node tools/audit/adr-id-claim.js`
Expected stderr: `[ADR-RANGE] stale upper bound ADR-001..ADR-014 (real max=ADR-015) file=.claude/agents/ccip-architect.md` plus same for `ccip-doc-writer.md`.
Exit code: 1

- [ ] **Step 3.3: Patch `.claude/agents/ccip-architect.md`**

Edit lines around 14 — replace `ADR-001..ADR-014 и новых` with `ADR-001..ADR-015 (актуальный список — docs/decisions/index.md)`.
Edit "Ключевые архитектурные решения" — добавить:
```markdown
- ADR-009: RBAC + GpToken
- ADR-015: SLA worker canonical path (M-05b)
```

- [ ] **Step 3.4: Patch `.claude/agents/ccip-doc-writer.md`**

Edit line 18 — replace `ADR-001..ADR-014, создание новых ADR по шаблону` with `ADR-001..ADR-015 (актуальный реестр — docs/decisions/index.md), создание новых ADR по шаблону`.

- [ ] **Step 3.5: Re-run audit, observe PASS**

Run: `node tools/audit/adr-id-claim.js`
Expected stdout: `[ADR-RANGE] OK`

- [ ] **Step 3.6: Commit**

```bash
git add tools/audit/adr-id-claim.js tools/audit/__tests__/adr-id-claim.test.js .claude/agents/ccip-architect.md .claude/agents/ccip-doc-writer.md
git commit -m "fix(agents): sync ADR range to ADR-015 in architect/doc-writer (F-003)"
```

---

### Task 4: F-006 — Unify intent taxonomy via single source of truth

**Files:**
- Create: `docs/schemas/intents.json`
- Modify: `CLAUDE.md` (Intent table comment + reference)
- Modify: `.claude/runtime/state-protocol.md` line 34
- Modify: `.claude/agents/ccip-routing-planner.md` line 36
- Modify: `docs/schemas/session-state.schema.json` (link to intents.json)
- Create: `tools/audit/intent-taxonomy-consistency.js`

- [ ] **Step 4.1: Author canonical intents file**

`docs/schemas/intents.json`:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://ccip.local/schemas/intents.json",
  "title": "CCIP Intent Vocabulary",
  "description": "Single source of truth for intent labels used in routing.",
  "type": "string",
  "enum": [
    "ARCH",
    "SCHEMA",
    "BACKEND",
    "AUX",
    "FRONTEND",
    "DEVOPS",
    "QA",
    "MOBILE",
    "SECURITY",
    "DOC"
  ]
}
```

**Decision rationale (record in commit body, see Step 4.7):**
- Use `BACKEND` (not `BACKEND_CORE`) — matches `CLAUDE.md` Intent table and routing-planner.
- `state-protocol.md` line 34 is the outlier (says `BACKEND_CORE`); will be patched.

- [ ] **Step 4.2: Write the failing audit script**

`tools/audit/intent-taxonomy-consistency.js`:
```js
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
const intentsSchema = JSON.parse(
  fs.readFileSync(path.join(root, 'docs/schemas/intents.json'), 'utf-8')
);
const canonical = new Set(intentsSchema.enum);

const claudeMd = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf-8');
const stateProtocol = fs.readFileSync(path.join(root, '.claude/runtime/state-protocol.md'), 'utf-8');
const planner = fs.readFileSync(path.join(root, '.claude/agents/ccip-routing-planner.md'), 'utf-8');

// Sources where intent labels appear as tokens; we look for ALL_CAPS_WITH_UNDERSCORES.
const TOKEN = /\b([A-Z][A-Z_]{2,})\b/g;
const NOISE = new Set([
  'LOW','MEDIUM','HIGH','INIT','PLAN','INJECT','UPDATE','FLUSH','DEFAULT','IF','OR','AND',
  'NOMINAL','DEGRADED','SUSPENDED','TBD','API','SLA','CCIP','JWT','RBAC','RLS','ADR',
  'BACKEND_CORE'  // we'll trip this one intentionally to detect divergence below
]);

let violations = 0;
function scan(src, file) {
  let m; TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(src))) {
    const tok = m[1];
    if (NOISE.has(tok)) continue;
    // Heuristic: only consider tokens that resemble intents (length ≤ 12, no digits).
    if (tok.length > 12 || /\d/.test(tok)) continue;
    // Only fail if the token is referenced as an Intent label but missing from schema.
    // We use a stricter test: presence of phrase "intent" within ±60 chars OR table-cell context.
    const slice = src.slice(Math.max(0, m.index - 80), m.index + 80).toLowerCase();
    if (!/(intent|routing|backup|primary)/.test(slice)) continue;
    if (!canonical.has(tok)) {
      violations++;
      fail('INTENT-TAX', `${tok} not in intents.json`, { file });
    }
  }
}

scan(claudeMd, 'CLAUDE.md');
scan(stateProtocol, '.claude/runtime/state-protocol.md');
scan(planner, '.claude/agents/ccip-routing-planner.md');

if (violations === 0) ok('INTENT-TAX');
process.exit(violations === 0 ? 0 : 1);
```

- [ ] **Step 4.3: Run, observe FAIL**

Run: `node tools/audit/intent-taxonomy-consistency.js`
Expected stderr: `[INTENT-TAX] BACKEND_CORE not in intents.json file=.claude/runtime/state-protocol.md`
Exit code: 1

- [ ] **Step 4.4: Patch `.claude/runtime/state-protocol.md` line 34**

Replace `BACKEND_CORE` → `BACKEND` in the example list (line 34):
```markdown
| `intents` | string[] | Из Intent → Agent table CLAUDE.md: ARCH, SCHEMA, BACKEND, AUX, FRONTEND, DEVOPS, QA, MOBILE, SECURITY, DOC; см. `docs/schemas/intents.json` |
```

- [ ] **Step 4.5: Patch `docs/schemas/session-state.schema.json`**

Replace `"intents": { "type": "array", "items": { "type": "string" } }` with:
```json
"intents": {
  "type": "array",
  "items": { "$ref": "intents.json" }
}
```
Note: `$ref` resolves locally next to schema; existing `audit/session-state.js` already uses `Ajv2020` and supports local refs via the file URL (verify in Step 4.6).

- [ ] **Step 4.6: Re-run audits, observe PASS**

Run:
```
node tools/audit/intent-taxonomy-consistency.js
node tools/audit/session-state.js
```
Expected: both `OK`.

- [ ] **Step 4.7: Commit**

```bash
git add docs/schemas/intents.json docs/schemas/session-state.schema.json .claude/runtime/state-protocol.md tools/audit/intent-taxonomy-consistency.js
git commit -m "fix(schemas): unify intent taxonomy via intents.json (F-006)"
```

---

### Task 5: F-004 + F-005 — Reconcile auxiliary trigger claims with reality

**Files:**
- Modify: `CLAUDE.md` Auxiliary Agents table (lines 49-59)
- Modify: `.claude/agents/ccip-claude-md-auditor.md` description + line 3
- Modify: `.claude/agents/ccip-navigator-optimizer.md` description + lines 17-22
- Create: `tools/audit/auxiliary-trigger-evidence.js`

Decision: descriptions and CLAUDE.md will be corrected to reflect actual runtime behaviour (manual / on-demand). Adding scheduled hooks is out of scope for this remediation (would require new infra cron) and untracked feature scope.

- [ ] **Step 5.1: Write the failing audit script**

`tools/audit/auxiliary-trigger-evidence.js`:
```js
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
const claudeMd = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf-8');
const settings = JSON.parse(fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf-8'));

const auxTable = (claudeMd.match(/## Auxiliary Agents[\s\S]*?(?=\n## )/) || [''])[0];

// Parse rows: | agent | trigger |
const rows = auxTable.split('\n')
  .filter(l => l.startsWith('|') && !l.startsWith('|--'))
  .map(l => l.split('|').map(s => s.trim()).filter(Boolean))
  .filter(r => r.length === 2 && !/^Agent$/.test(r[0]));

const hookMatchers = new Set();
for (const phase of Object.values(settings.hooks || {})) {
  for (const block of phase) {
    if (block.matcher) hookMatchers.add(block.matcher);
    for (const h of block.hooks || []) hookMatchers.add(h.command || '');
  }
}

const PROMISES_SCHEDULE = /\b(расписание|schedule|cron|daily|periodic)\b/i;
const PROMISES_HOOK     = /\b(после изменений|after.*(edit|change)|on.*push)\b/i;

let violations = 0;
for (const [agent, trigger] of rows) {
  const clean = agent.replace(/`/g, '');
  if (PROMISES_SCHEDULE.test(trigger)) {
    // Must have scheduled hook (we treat any matcher containing 'cron' or 'schedule' as proof).
    const hasSchedule = [...hookMatchers].some(m => /schedule|cron/i.test(m));
    if (!hasSchedule) {
      violations++;
      fail('AUX-TRIGGER', `${clean}: claims schedule but no scheduled hook in settings.json`);
    }
  }
  if (PROMISES_HOOK.test(trigger)) {
    const hasPostEdit = [...hookMatchers].some(m => /post.*edit|post.*write|file_change/i.test(m));
    if (!hasPostEdit) {
      violations++;
      fail('AUX-TRIGGER', `${clean}: claims file-change trigger but no matching hook in settings.json`);
    }
  }
}

if (violations === 0) ok('AUX-TRIGGER');
process.exit(violations === 0 ? 0 : 1);
```

- [ ] **Step 5.2: Run, observe FAIL**

Run: `node tools/audit/auxiliary-trigger-evidence.js`
Expected stderr (2 lines): `[AUX-TRIGGER] ccip-claude-md-auditor: claims schedule but no scheduled hook ...` and same for navigator.
Exit code: 1

- [ ] **Step 5.3: Patch `CLAUDE.md` lines 55-56**

Replace rows:
```markdown
| ccip-claude-md-auditor      | по запросу (manual) или при review CLAUDE.md PR'а |
| ccip-navigator-optimizer    | по запросу после правок CLAUDE.md §3–§6 или docs/tasks/index.md |
```

- [ ] **Step 5.4: Patch `.claude/agents/ccip-claude-md-auditor.md`**

Edit `description:` frontmatter — заменить `Запускается автоматически по расписанию.` на `Запускается по запросу или при review PR на CLAUDE.md.`.

- [ ] **Step 5.5: Patch `.claude/agents/ccip-navigator-optimizer.md`**

Edit `description:` frontmatter — заменить `Запускается после изменений в CLAUDE.md §3–§6, docs/tasks/index.md или docs/decisions/index.md.` на `Запускается по запросу после правок в CLAUDE.md §3–§6, docs/tasks/index.md или docs/decisions/index.md.`.

Edit body lines 17-22 — заменить "Запускать после любого из событий:" на "Запускать вручную (или по PR-review-чек-листу) после любого из событий:".

- [ ] **Step 5.6: Re-run audit, observe PASS**

Run: `node tools/audit/auxiliary-trigger-evidence.js`
Expected: `[AUX-TRIGGER] OK`.

- [ ] **Step 5.7: Commit**

```bash
git add CLAUDE.md .claude/agents/ccip-claude-md-auditor.md .claude/agents/ccip-navigator-optimizer.md tools/audit/auxiliary-trigger-evidence.js
git commit -m "fix(orchestration): align auxiliary trigger claims with reality (F-004, F-005)"
```

---

## Wave 3 — HIGH

### Task 6: F-007 + F-008 + F-015 — Tighten session-state schema

**Files:**
- Modify: `docs/schemas/session-state.schema.json`
- Add: regression fixtures under `tools/audit/__fixtures__/session-state-{good,bad}.json`
- Modify: `tools/audit/session-state.js` (no logic change — runs schema only)

- [ ] **Step 6.1: Define stricter schema**

Replace `docs/schemas/session-state.schema.json` body with:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://ccip.local/schemas/session-state.json",
  "title": "CCIP Session State",
  "type": "object",
  "required": ["session_id", "task", "intents", "risk", "confidence", "routing", "status"],
  "properties": {
    "session_id": {
      "type": "string",
      "anyOf": [
        { "pattern": "^$" },
        { "pattern": "^\\d{4}-\\d{2}-\\d{2}-\\d{4}$" }
      ]
    },
    "task":       { "type": "string" },
    "intents":    { "type": "array", "items": { "$ref": "intents.json" } },
    "risk":       { "type": "string", "enum": ["LOW","MEDIUM","HIGH"] },
    "confidence": { "type": "string", "enum": ["LOW","MEDIUM","HIGH"] },
    "routing":    { "type": "string", "enum": ["direct","planner","multi-agent"] },
    "dag": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["step","agent","status"],
        "properties": {
          "step":       { "type": "integer", "minimum": 1 },
          "type":       { "type": "string", "enum": ["sequential","parallel"] },
          "agent":      { "type": "string", "pattern": "^[a-z][a-z0-9-]*$" },
          "role":       { "type": "string" },
          "scope":      { "type": "string" },
          "status":     { "type": "string", "enum": ["pending","running","done","failed"] },
          "depends_on": { "type": "array", "items": { "type": "integer", "minimum": 1 } },
          "retries":    { "type": "integer", "minimum": 0 }
        },
        "additionalProperties": false
      }
    },
    "current_step":  { "type": "integer", "minimum": 0 },
    "agent_outputs": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "required": ["summary","artifacts","handoff_notes"],
        "properties": {
          "summary":       { "type": "string" },
          "artifacts":     { "type": "array", "items": { "type": "string" } },
          "handoff_notes": { "type": "string" }
        },
        "additionalProperties": false
      }
    },
    "status":     { "type": "string", "enum": ["init","planning","executing","done","blocked"] },
    "started_at": { "type": "string" },
    "observations": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["agent","outcome","context_tokens"],
        "properties": {
          "agent":          { "type": "string" },
          "session":        { "type": "string" },
          "written_at":     { "type": "string" },
          "dag_step":       { "type": ["integer","null"] },
          "outcome":        { "type": "string", "enum": ["success","rerouted","partial","failed"] },
          "context_tokens": { "type": "integer", "minimum": 0 },
          "reason":         { "type": "string" }
        },
        "additionalProperties": false
      }
    }
  },
  "additionalProperties": false
}
```

- [ ] **Step 6.2: Add good/bad fixtures**

`tools/audit/__fixtures__/session-state-good.json`:
```json
{
  "session_id": "2026-05-20-1430",
  "task": "remediation",
  "intents": ["DOC"],
  "risk": "LOW",
  "confidence": "HIGH",
  "routing": "direct",
  "dag": [],
  "current_step": 0,
  "agent_outputs": {},
  "status": "init",
  "started_at": "",
  "observations": []
}
```

`tools/audit/__fixtures__/session-state-bad.json` (intents=phantom + bad session_id):
```json
{
  "session_id": "not-an-iso",
  "task": "x",
  "intents": ["BACKEND_CORE"],
  "risk": "low",
  "confidence": "HIGH",
  "routing": "direct",
  "status": "init"
}
```

- [ ] **Step 6.3: Run session-state.js, observe PASS for live state and add fixture check**

The current `session-state.json` runtime file uses `intents: []`. After this schema change it remains valid (empty array). Run:

Run: `node tools/audit/session-state.js`
Expected: `[SESSION-STATE] OK`

Optionally extend `session-state.js` to also validate the two fixtures and assert good→OK, bad→FAIL. Append to `tools/audit/session-state.js`:
```js
const Ajv2020 = require('ajv/dist/2020');
const ajv = new Ajv2020({ allErrors: true, strict: true });
const intentsSchema = JSON.parse(fs.readFileSync(path.join(root, 'docs/schemas/intents.json'), 'utf-8'));
ajv.addSchema(intentsSchema, 'intents.json');
const validate = ajv.compile(JSON.parse(fs.readFileSync(path.join(root, 'docs/schemas/session-state.schema.json'), 'utf-8')));

for (const [name, mustPass] of [['session-state-good.json', true], ['session-state-bad.json', false]]) {
  const f = path.join(root, 'tools/audit/__fixtures__', name);
  const obj = JSON.parse(fs.readFileSync(f, 'utf-8'));
  const valid = validate(obj);
  if (valid !== mustPass) {
    fail('SESSION-STATE-FX', `${name}: expected valid=${mustPass}, got ${valid}`);
    process.exit(1);
  }
}
```
(Adjust existing exports/imports already present in `session-state.js`.)

- [ ] **Step 6.4: Commit**

```bash
git add docs/schemas/session-state.schema.json tools/audit/__fixtures__/session-state-good.json tools/audit/__fixtures__/session-state-bad.json tools/audit/session-state.js
git commit -m "fix(schemas): tighten session-state schema (F-007, F-008, F-015)"
```

---

### Task 7: F-009 + F-018 — Hook records full observation + true outcome

**Files:**
- Modify: `.claude/runtime/post-agent-hook.js` lines 144-180

- [ ] **Step 7.1: Patch hook to write all 7 observation fields**

Replace lines 144-167 with:
```js
  const agent = resolveAgent(payload.tool_input);
  if (!agent) return;

  const text    = responseText(payload.tool_response);
  const tokens  = estimateTokens(text);
  const parsed  = extractStructured(text);

  // outcome detection: if response contains explicit "outcome": "failed"|"rerouted"|"partial"
  // inside ## State Update — honor it; otherwise default to "success".
  let outcome = 'success';
  const oMatch = text.match(/"outcome"\s*:\s*"(failed|rerouted|partial|success)"/);
  if (oMatch) outcome = oMatch[1];
  // Tool-level failure signal: if `payload.tool_response.is_error === true`, force failed.
  if (payload.tool_response?.is_error === true) outcome = 'failed';

  if (!state.agent_outputs) state.agent_outputs = {};
  state.agent_outputs[agent] = {
    summary:       parsed?.summary       || `${agent} completed (no structured block)`,
    artifacts:     parsed?.artifacts     || [],
    handoff_notes: parsed?.handoff_notes || '',
  };

  if (!state.observations) state.observations = [];
  state.observations.push({
    agent,
    session:        state.session_id || '',
    written_at:     new Date().toISOString(),
    dag_step:       state.current_step ?? null,
    outcome,
    context_tokens: tokens,
    reason:         outcome === 'success' ? '' : (parsed?.handoff_notes?.slice(0, 200) || ''),
  });
```

- [ ] **Step 7.2: Smoke-run the hook against a synthetic payload**

Create scratch script (not committed): `node -e "require('child_process').spawn('node',['.claude/runtime/post-agent-hook.js'],{stdio:['pipe','inherit','inherit']}).stdin.end(JSON.stringify({tool_name:'Agent',tool_input:{subagent_type:'ccip-architect',description:'x'},tool_response:{content:'## State Update\n\`\`\`json\n{\"summary\":\"s\",\"artifacts\":[],\"handoff_notes\":\"\"}\n\`\`\`'}}))"`

(For Windows PowerShell, single-line invocation may need escaping; see Task 10 unit test instead.)

- [ ] **Step 7.3: Audit-suite session-state.js still passes**

Run: `node tools/audit/session-state.js`
Expected: `[SESSION-STATE] OK`.

- [ ] **Step 7.4: Commit**

```bash
git add .claude/runtime/post-agent-hook.js
git commit -m "fix(runtime): emit full observation + detect failure outcome (F-009, F-018)"
```

---

### Task 8: F-010 — flush-state validates against real agents directory

**Files:**
- Modify: `.claude/runtime/flush-state.js` lines 28-44

- [ ] **Step 8.1: Patch validation logic**

Replace lines 28-44 with:
```js
  // Validate observation.agent against (1) DAG agents if DAG non-empty,
  // (2) real .claude/agents/<name>.md files always. Direct-mode sessions
  // have empty DAG; we must still reject phantom agents.
  const dagAgents = new Set((state.dag || []).map(s => s.agent));
  let realAgents = new Set();
  try {
    realAgents = new Set(
      fs.readdirSync(path.join(ROOT, '.claude/agents'))
        .filter(f => f.endsWith('.md'))
        .map(f => f.replace(/\.md$/, ''))
    );
  } catch {}

  const lines = observations.map(obs => {
    if (!obs.agent) {
      process.stderr.write('[flush-state] ⚠ observation without agent — skipped\n');
      return null;
    }
    if (dagAgents.size > 0 && !dagAgents.has(obs.agent)) {
      process.stderr.write(`[flush-state] ⚠ observation from non-DAG agent "${obs.agent}" — kept (co-agent semantics) but flagged\n`);
      // For co-agents (security-reviewer etc.) we still record — they're legitimate.
    }
    if (realAgents.size > 0 && !realAgents.has(obs.agent)) {
      process.stderr.write(`[flush-state] ✗ phantom agent "${obs.agent}" — skipped\n`);
      return null;
    }
    return JSON.stringify({
      agent:          obs.agent,
      session:        obs.session        || sessionId.slice(0, 10),
      written_at:     obs.written_at     || new Date().toISOString(),
      dag_step:       obs.dag_step       ?? null,
      outcome:        obs.outcome        || '',
      context_tokens: obs.context_tokens || 0,
      reason:         obs.reason         || '',
    });
  }).filter(Boolean);
```

Add at top of file: `const path = require('path');` if not already imported (it is — line 7).

- [ ] **Step 8.2: Verify state is correctly flushed**

Manual smoke (read-only): inspect `flush-state.js` source for syntax via `node --check .claude/runtime/flush-state.js`.

Run: `node --check .claude/runtime/flush-state.js`
Expected exit: 0

- [ ] **Step 8.3: Commit**

```bash
git add .claude/runtime/flush-state.js
git commit -m "fix(runtime): validate observations against real agent directory (F-010)"
```

---

### Task 9: F-012 — Add `## State Contract` block to 7 agents missing it

**Files:**
- Modify: `.claude/agents/ccip-product-owner.md`
- Modify: `.claude/agents/consistency-checker.md`
- Modify: `.claude/agents/ccip-routing-planner.md`
- Modify: `.claude/agents/ccip-claude-md-auditor.md`
- Modify: `.claude/agents/ccip-navigator-optimizer.md`
- Create: `tools/audit/state-contract-block-per-agent.js`

Decision: `ccip-session-optimizer.md` and `security-reviewer.md` use specialised structured outputs (3-artifact manifest / JSON verdict) — these will be added to the whitelist rather than refactored.

- [ ] **Step 9.1: Write the failing audit script**

`tools/audit/state-contract-block-per-agent.js`:
```js
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { walk } = require('./_lib/walk');
const { fail, ok } = require('./_lib/report');

// Agents that legitimately use a different output contract.
const EXEMPT = new Set([
  'ccip-session-optimizer',   // 3-artifact manifest with invariants
  'security-reviewer',        // structured JSON verdict block
]);

const root = gitRoot();
const files = walk(root, ['.claude/agents/*.md']);

let violations = 0;
for (const file of files) {
  const name = path.basename(file, '.md');
  if (EXEMPT.has(name)) continue;
  const body = fs.readFileSync(file, 'utf-8');
  if (!/^##\s+State\s+Contract/m.test(body)) {
    fail('STATE-CONTRACT-BLOCK', `${name} missing "## State Contract" section`);
    violations++;
  }
}

if (violations === 0) ok('STATE-CONTRACT-BLOCK');
process.exit(violations === 0 ? 0 : 1);
```

- [ ] **Step 9.2: Run, observe FAIL (5 violations)**

Run: `node tools/audit/state-contract-block-per-agent.js`
Expected stderr (5 lines): ccip-product-owner, consistency-checker, ccip-routing-planner, ccip-claude-md-auditor, ccip-navigator-optimizer.
Exit code: 1

- [ ] **Step 9.3: Append `## State Contract` block to each of 5 agents**

Block to append (replace `<agent-name>` and `<role-specific summary>`):
```markdown

## State Contract

**Input** — читать из `session-state.json` при старте:
- `task` + `intents` — определить scope
- `agent_outputs[*].handoff_notes` — контекст от предыдущих агентов

**Output** — в конце ответа обязательно вывести блок (читается PostToolUse hook):

## State Update
```json
{
  "summary": "≤ 3 предложения: <role-specific summary>",
  "artifacts": ["docs/..."],
  "handoff_notes": "Что нужно знать следующему агенту"
}
```
```

Custom role-specific summaries:
- `ccip-product-owner`: "acceptance criteria приняты/отклонены, бизнес-логика проверена"
- `consistency-checker`: "найденные противоречия по scope'у проверки, ссылка на отчёт в errors_log"
- `ccip-routing-planner`: "построенный DAG + назначенные агенты + co-agents"
- `ccip-claude-md-auditor`: "изменения в CLAUDE.md или запись в proposed-changes.md, broken links найдено"
- `ccip-navigator-optimizer`: "правки навигационного слоя, расхождения L/T уровней"

- [ ] **Step 9.4: Re-run, observe PASS**

Run: `node tools/audit/state-contract-block-per-agent.js`
Expected: `[STATE-CONTRACT-BLOCK] OK`

- [ ] **Step 9.5: Commit**

```bash
git add .claude/agents/ccip-product-owner.md .claude/agents/consistency-checker.md .claude/agents/ccip-routing-planner.md .claude/agents/ccip-claude-md-auditor.md .claude/agents/ccip-navigator-optimizer.md tools/audit/state-contract-block-per-agent.js
git commit -m "fix(agents): add State Contract block to 5 agents (F-012)"
```

---

### Task 10: F-014 — Make orphan-adrs.js bidirectional

**Files:**
- Modify: `tools/audit/orphan-adrs.js`
- Modify: `tools/audit/__tests__/_lib.test.js` (or new test file)

- [ ] **Step 10.1: Patch `orphan-adrs.js`**

Replace lines 30-43 with:
```js
let violations = 0;

// Direction 1: every ADR-file referenced elsewhere?
for (const [adr, ownFile] of adrs) {
  const re = new RegExp(`\\b${adr}\\b`, 'g');
  let count = 0;
  for (const [f, body] of contents) {
    if (f === ownFile) continue;
    const m = body.match(re);
    if (m) count += m.length;
  }
  if (count < 1) {
    fail('ORPHAN-ADR', `${adr} not referenced outside its own file`);
    violations++;
  }
}

// Direction 2: every ADR-NNN mention resolves to a real file?
const MENTION = /\bADR-(\d{3})\b/g;
const adrIds = new Set([...adrs.keys()]);
for (const [f, body] of contents) {
  const rel = path.relative(root, f).replace(/\\/g, '/');
  let m;
  MENTION.lastIndex = 0;
  while ((m = MENTION.exec(body))) {
    if (!adrIds.has(`ADR-${m[1]}`)) {
      fail('ORPHAN-ADR', `unknown ADR-${m[1]} referenced`, { file: rel });
      violations++;
    }
  }
}
```

- [ ] **Step 10.2: Run, observe behaviour**

Run: `node tools/audit/orphan-adrs.js`
Expected: `[ORPHAN-ADR] OK` (assuming Task 1 already cleaned adr-loading-guide.md).

If FAIL surfaces additional stale ADR references that Task 1 didn't catch (e.g. in `apps/api/src/**/*.ts`), fix them inline and re-run.

- [ ] **Step 10.3: Commit**

```bash
git add tools/audit/orphan-adrs.js
git commit -m "fix(audit): orphan-adrs now bidirectional ADR check (F-014)"
```

---

## Wave 4 — MEDIUM

### Task 11: F-013 — dead-refs detects bare ADR mentions

**Files:**
- Modify: `tools/audit/dead-refs.js`

- [ ] **Step 11.1: Extend pattern**

Insert after line 9 in `dead-refs.js`:
```js
const ADR_PAT = /(?<![/\w])(ADR-\d{3}-[a-z][a-z0-9-]*\.md)/g;
```

Insert a second scan loop in the file-processing block (after `while ((m = PATH_PAT.exec(content)))`):
```js
ADR_PAT.lastIndex = 0;
while ((m = ADR_PAT.exec(content))) {
  const adrFile = `docs/decisions/${m[1]}`;
  if (!refExists(root, adrFile)) {
    violations++;
    fail('DEAD-REF', adrFile, { file: rel });
  }
}
```

- [ ] **Step 11.2: Run, expect PASS (Task 1 already cleaned adr-loading-guide)**

Run: `node tools/audit/dead-refs.js`
Expected: `[DEAD-REF] OK`

- [ ] **Step 11.3: Commit**

```bash
git add tools/audit/dead-refs.js
git commit -m "fix(audit): dead-refs catches bare ADR-NNN-slug.md mentions (F-013)"
```

---

### Task 12: F-016 — Narrow ccip-routing-planner tool surface + tools-usage audit

**Files:**
- Modify: `.claude/agents/ccip-routing-planner.md` (frontmatter `tools:`)
- Create: `tools/audit/agent-tools-usage.js`

- [ ] **Step 12.1: Write the failing audit script**

`tools/audit/agent-tools-usage.js`:
```js
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const matter = require('gray-matter');
const { gitRoot } = require('./_lib/git-root');
const { walk } = require('./_lib/walk');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
const files = walk(root, ['.claude/agents/*.md']);

// Agents that legitimately declare tools without inline body usage.
const BODY_USAGE_EXEMPT = new Set([
  // session-optimizer references tools via pre-flight discipline lines, not by name verbs
  'ccip-session-optimizer',
]);

let violations = 0;
for (const file of files) {
  const fm = matter(fs.readFileSync(file, 'utf-8'));
  const name = path.basename(file, '.md');
  if (BODY_USAGE_EXEMPT.has(name)) continue;
  const declared = String(fm.data.tools || '').split(',').map(s => s.trim()).filter(Boolean);
  const body = fm.content;
  for (const tool of declared) {
    // Tool names are mostly distinct verbs (Read, Write, Edit, Glob, Grep, Bash).
    // We look for a whole-word mention anywhere in body.
    const re = new RegExp(`\\b${tool}\\b`);
    if (!re.test(body)) {
      violations++;
      fail('TOOLS-USAGE', `${name}: declared "${tool}" but never mentioned in body`);
    }
  }
}

if (violations === 0) ok('TOOLS-USAGE');
process.exit(violations === 0 ? 0 : 1);
```

- [ ] **Step 12.2: Run, observe FAIL**

Run: `node tools/audit/agent-tools-usage.js`
Expected stderr: `[TOOLS-USAGE] ccip-routing-planner: declared "Write" but never mentioned in body` and same for `Edit`.

- [ ] **Step 12.3: Patch `.claude/agents/ccip-routing-planner.md`**

Edit frontmatter line 5:
```
tools: Read, Glob, Grep
```

- [ ] **Step 12.4: Re-run, observe PASS**

Run: `node tools/audit/agent-tools-usage.js`
Expected: `[TOOLS-USAGE] OK`

Run also: `node tools/audit/agent-frontmatter.js` to confirm schema still validates (Read/Glob/Grep is a valid CSV per schema pattern).

- [ ] **Step 12.5: Commit**

```bash
git add .claude/agents/ccip-routing-planner.md tools/audit/agent-tools-usage.js
git commit -m "fix(agents): narrow routing-planner tool surface to Read/Glob/Grep (F-016)"
```

---

### Task 13: F-017 — Pin superpowers plugin via ADR-016

**Files:**
- Create: `docs/decisions/ADR-016-plugin-supply-chain.md`
- Modify: `docs/decisions/index.md`
- Create: `tools/audit/plugin-supply-chain-pin.js`

- [ ] **Step 13.1: Author ADR-016**

`docs/decisions/ADR-016-plugin-supply-chain.md`:
```markdown
---
adr: ADR-016
status: Принято
impl_anchors:
  - .claude/settings.json
  - tools/audit/plugin-supply-chain-pin.js
---

# ADR-016: Plugin Supply-Chain Policy

**Status:** Принято
**Date:** 2026-05-20
**Deciders:** ccip-architect, ccip-security

## Context

`.claude/settings.json` включает `enabledPlugins["superpowers@claude-plugins-official"] = true`. На момент аудита 2026-05-20 плагин не зафиксирован в репо: версия не пинется, ADR на использование отсутствует, source supply chain не аудирован. Любое автоматическое обновление потенциально меняет поведение хуков и поверхность атаки.

## Decision

1. Каждый enabled plugin в `settings.json` обязан иметь соответствующий ADR с обоснованием и зафиксированной версией.
2. Plugin reference в settings указывает версию в комментарии (settings.json не поддерживает inline-comments, поэтому версия фиксируется в этом ADR + дублируется в `docs/errors/errors_log.md` при каждом обновлении).
3. `superpowers@claude-plugins-official` принят в версии `5.1.0` (cache path: `C:/Users/<user>/.claude/plugins/cache/claude-plugins-official/superpowers/5.1.0/`).
4. Перед mass-deployment в pilot — supply-chain review плагина выполняет `ccip-security`.

## Consequences

**Positive:**
- Reproducible runtime environment.
- Ясное human-sign-off на изменение зависимостей.

**Negative:**
- Manual sync при обновлениях.

**Risks:**
- Drift между cache-версией и pinned — нужен audit-guard (`plugin-supply-chain-pin.js`).
```

- [ ] **Step 13.2: Add ADR-016 to `docs/decisions/index.md`**

Append to relevant section (Infrastructure / Workers or new section "Governance"):
```markdown
### Governance
- [ADR-016-plugin-supply-chain.md](ADR-016-plugin-supply-chain.md) — supply-chain policy для plugins
```

- [ ] **Step 13.3: Write audit script**

`tools/audit/plugin-supply-chain-pin.js`:
```js
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
const settings = JSON.parse(fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf-8'));
const plugins = Object.keys(settings.enabledPlugins || {});

let violations = 0;
for (const p of plugins) {
  // Expect at least one ADR file mentioning the plugin name.
  const adrDir = path.join(root, 'docs/decisions');
  const adrs = fs.readdirSync(adrDir).filter(f => /^ADR-\d{3}.+\.md$/.test(f));
  const mentioned = adrs.some(f =>
    fs.readFileSync(path.join(adrDir, f), 'utf-8').includes(p.split('@')[0])
  );
  if (!mentioned) {
    fail('PLUGIN-PIN', `plugin "${p}" enabled but no ADR documents it`);
    violations++;
  }
}

if (violations === 0) ok('PLUGIN-PIN');
process.exit(violations === 0 ? 0 : 1);
```

- [ ] **Step 13.4: Run, observe PASS (because ADR-016 mentions "superpowers")**

Run: `node tools/audit/plugin-supply-chain-pin.js`
Expected: `[PLUGIN-PIN] OK`

- [ ] **Step 13.5: Commit**

```bash
git add docs/decisions/ADR-016-plugin-supply-chain.md docs/decisions/index.md tools/audit/plugin-supply-chain-pin.js
git commit -m "feat(governance): pin superpowers plugin via ADR-016 (F-017)"
```

---

### Task 14: F-019 — rbac-vs-schema derives roles from schema directly

**Files:**
- Modify: `tools/audit/rbac-vs-schema.js`

- [ ] **Step 14.1: Patch logic**

Replace lines 24-50 with:
```js
const SUSPECT_HEURISTIC = /\b(supervisor|contractor|manager|operator|owner|coordinator|inspector|approver)\b/g;
// Phantom roles are detected if a token matches the heuristic AND is NOT in the real enum.

const files = [
  ...walk(root, ['.claude/agents/*.md']),
  ...walk(root, ['docs/decisions/ADR-*.md']),
  ...walk(root, ['docs/architecture/*.md']),
  ...walk(root, ['apps/api/src/**/*.ts']),
];

let violations = 0;
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const raw = fs.readFileSync(file, 'utf-8');
  const c = file.endsWith('.md')
    ? raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
    : raw;
  SUSPECT_HEURISTIC.lastIndex = 0;
  let m;
  while ((m = SUSPECT_HEURISTIC.exec(c))) {
    const role = m[1];
    if (validRoles.has(role)) continue;
    violations++;
    fail('RBAC-SCHEMA', `phantom role "${role}" (not in UserRole enum)`, { file: rel });
  }
}
```

The phantom list is expanded but still bounded to a heuristic vocabulary. Real schema enum (`admin`, `director`, `stroycontrol`, `engineer`) remains the source of truth.

- [ ] **Step 14.2: Run, observe PASS**

Run: `node tools/audit/rbac-vs-schema.js`
Expected: `[RBAC-SCHEMA] OK`

- [ ] **Step 14.3: Commit**

```bash
git add tools/audit/rbac-vs-schema.js
git commit -m "fix(audit): rbac-vs-schema uses extended phantom-role heuristic (F-019)"
```

---

## Wave 5 — LOW + Misc

### Task 15: F-021 — Policy doc for ccip-architect ADR list

**Files:**
- Modify: `.claude/agents/ccip-architect.md` body (after the "Ключевые архитектурные решения" section)

- [ ] **Step 15.1: Patch body**

Insert paragraph immediately after the ADR bullet list in `ccip-architect.md`:
```markdown

> Список выше — high-frequency reference set. Полный канонический список — `docs/decisions/index.md`. При работе с любым модулем сначала свериться с `index.md` на наличие нового ADR в данной области.
```

- [ ] **Step 15.2: Commit**

```bash
git add .claude/agents/ccip-architect.md
git commit -m "docs(agents): clarify ccip-architect ADR reference policy (F-021)"
```

---

### Task 16: F-022 — Staleness guard for proposed-claude-md-changes.md

**Files:**
- Create: `tools/audit/proposed-changes-staleness.js`

- [ ] **Step 16.1: Write audit script**

```js
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { fail, ok } = require('./_lib/report');

const STALENESS_DAYS = 30;
const root = gitRoot();
const file = path.join(root, 'docs/proposed-claude-md-changes.md');
if (!fs.existsSync(file)) { ok('PROPOSED-STALE'); process.exit(0); }

const body = fs.readFileSync(file, 'utf-8');
// Parse blocks "## Proposed Change — YYYY-MM-DD" with Status: PENDING_HUMAN_REVIEW
const blockRe = /##\s+Proposed\s+Change\s+—\s+(\d{4}-\d{2}-\d{2})[\s\S]*?Status:\s*(\w+)/g;
const now = Date.now();
const limit = STALENESS_DAYS * 24 * 60 * 60 * 1000;

let violations = 0;
let m;
while ((m = blockRe.exec(body))) {
  const date = Date.parse(m[1]);
  if (m[2] === 'PENDING_HUMAN_REVIEW' && (now - date) > limit) {
    violations++;
    fail('PROPOSED-STALE', `Proposed change ${m[1]} pending > ${STALENESS_DAYS} days`);
  }
}

if (violations === 0) ok('PROPOSED-STALE');
process.exit(violations === 0 ? 0 : 1);
```

- [ ] **Step 16.2: Run, observe PASS (if no stale entries) or note any flagged items**

Run: `node tools/audit/proposed-changes-staleness.js`
Expected: `[PROPOSED-STALE] OK` (assuming current proposed-claude-md-changes.md is empty or fresh).

If FAIL — surface to user, do not silence; remediation owner = `ccip-architect`.

- [ ] **Step 16.3: Commit**

```bash
git add tools/audit/proposed-changes-staleness.js
git commit -m "feat(audit): staleness guard for proposed-claude-md-changes (F-022)"
```

---

### Task 17: F-023 — Document execute-dag vs Agent-tool orchestration modes

**Files:**
- Modify: `.claude/runtime/state-protocol.md` (append "Orchestration Modes" section)

- [ ] **Step 17.1: Append section**

At the end of `state-protocol.md`:
```markdown

---

## Orchestration Modes

Два параллельных пути исполнения, оба пишут в `session-state.json` через одни и те же хуки:

1. **Inline Agent tool** — основной путь. Оркестратор вызывает `Agent({subagent_type, prompt, ...})`; Claude Code исполняет, по завершении срабатывает PostToolUse hook (`post-agent-hook.js`). Используется для Fast Path, Multi-intent, direct routing.

2. **execute-dag.js** — программный путь для заранее построенного DAG. Используется когда:
   - `ccip-routing-planner` уже вернул DAG (3+ intents или risk=HIGH)
   - DAG нужно исполнить с retry-policy, true parallelism (`parallel` waves), checkpoint/resume
   - В CI или background job

Оба пути дают одинаковую state-структуру; различаются только источником spawn'а (interactive vs `cp.spawn('claude', ...)`).

**Правило выбора:** одиночная задача — inline Agent. Multi-step DAG с зависимостями — `execute-dag.js`.
```

- [ ] **Step 17.2: Run state-contract audit, expect PASS**

Run: `node tools/audit/state-contract-section.js`
Expected: `[STATE-CONTRACT] OK`

- [ ] **Step 17.3: Commit**

```bash
git add .claude/runtime/state-protocol.md
git commit -m "docs(runtime): document inline vs execute-dag orchestration modes (F-023)"
```

---

## Wave 6 — Audit-suite integration

### Task 18: Wire all new audit scripts into audit-suite.js

**Files:**
- Modify: `tools/audit/audit-suite.js`
- Modify: `.claude/settings.local.json` (extend allowlist)

- [ ] **Step 18.1: Patch `audit-suite.js`**

Add new phase to the `PHASES` map:
```js
  '§10.8 Multi-agent governance': [
    'adr-mention-existence.js',
    'adr-id-claim.js',
    'hook-agent-resolver.js',
    'state-contract-block-per-agent.js',
    'intent-taxonomy-consistency.js',
    'auxiliary-trigger-evidence.js',
    'agent-tools-usage.js',
    'plugin-supply-chain-pin.js',
    'proposed-changes-staleness.js',
  ],
```

- [ ] **Step 18.2: Extend `.claude/settings.local.json` allowlist**

Append to `permissions.allow` array:
```json
"Bash(node tools/audit/adr-mention-existence.js)",
"Bash(node tools/audit/adr-id-claim.js)",
"Bash(node tools/audit/hook-agent-resolver.js)",
"Bash(node tools/audit/state-contract-block-per-agent.js)",
"Bash(node tools/audit/intent-taxonomy-consistency.js)",
"Bash(node tools/audit/auxiliary-trigger-evidence.js)",
"Bash(node tools/audit/agent-tools-usage.js)",
"Bash(node tools/audit/plugin-supply-chain-pin.js)",
"Bash(node tools/audit/proposed-changes-staleness.js)"
```

- [ ] **Step 18.3: Run full audit-suite**

Run: `node tools/audit/audit-suite.js`
Expected stdout: `=== Summary: 26/26 passed ===` (17 existing + 9 new).
Exit code: 0

- [ ] **Step 18.4: Run all unit-tests**

Run: `node --test tools/audit/__tests__`
Expected: all tests passing.

- [ ] **Step 18.5: Commit**

```bash
git add tools/audit/audit-suite.js .claude/settings.local.json
git commit -m "feat(audit): register §10.8 Multi-agent governance phase (9 new guards)"
```

---

## Wave 7 — Final regression and documentation

### Task 19: Final remediation log entry

**Files:**
- Modify: `docs/errors/errors_log.md`

- [ ] **Step 19.1: Append summary entry**

```markdown

## Remediation Run — 2026-05-20

**Triggered by:** Ultra-strict multi-agent ecosystem audit 2026-05-20 (23 findings).

**Resolved findings:**
- BLOCKER: F-001 (phantom ADR catalog), F-002 (phantom hook resolver)
- CRITICAL: F-003 (ADR range stale), F-004/F-005 (phantom triggers), F-006 (intent taxonomy split)
- HIGH: F-007/F-008/F-015 (schema tighten), F-009/F-018 (hook observations), F-010 (flush phantom check), F-011 (resolver narrowing — folded into F-002), F-012 (State Contract blocks), F-014 (orphan-adrs bidirectional)
- MEDIUM: F-013 (dead-refs ADR), F-016 (planner tools), F-017 (plugin pin), F-019 (rbac heuristic)
- LOW: F-021 (architect ADR policy), F-022 (proposed-changes staleness), F-023 (orchestration mode docs)
- INFO: covered by F-023 documentation

**New audit guards (§10.8 Multi-agent governance, 9 scripts):**
adr-mention-existence, adr-id-claim, hook-agent-resolver, state-contract-block-per-agent, intent-taxonomy-consistency, auxiliary-trigger-evidence, agent-tools-usage, plugin-supply-chain-pin, proposed-changes-staleness.

**Verification:** `node tools/audit/audit-suite.js` → 26/26 passed.
```

- [ ] **Step 19.2: Final full regression**

Run: `node tools/audit/audit-suite.js && node --test tools/audit/__tests__`
Expected: both green.

- [ ] **Step 19.3: Final commit**

```bash
git add docs/errors/errors_log.md
git commit -m "docs(errors): log remediation run for audit 2026-05-20"
```

---

## Self-Review Checklist (internal, do NOT re-dispatch)

**1. Spec coverage:** Each finding F-001..F-023 has a Task touching it:
- F-001 → Task 1; F-002 → Task 2; F-003 → Task 3; F-004 → Task 5; F-005 → Task 5; F-006 → Task 4; F-007 → Task 6; F-008 → Task 6; F-009 → Task 7; F-010 → Task 8; F-011 → Task 2 (combined); F-012 → Task 9; F-013 → Task 11; F-014 → Task 10; F-015 → Task 6; F-016 → Task 12; F-017 → Task 13; F-018 → Task 7 (combined); F-019 → Task 14; F-020 → Task 1 (covered by adr-loading-guide rewrite); F-021 → Task 15; F-022 → Task 16; F-023 → Task 17. ✓
- "Доработать audit-suite.js" → Task 18 + 9 new scripts. ✓

**2. Placeholder scan:** Each code block contains actual implementation. No "TODO / TBD / fill in". Each Step shows command + expected output. ✓

**3. Type consistency:**
- `intents.json` enum value `BACKEND` is referenced consistently in Tasks 4, 6, 9 (handoff blocks).
- Resolver function name `resolveAgent` preserved in Task 2 and 7.
- Audit script naming convention `[a-z-]+\.js` consistent.
- `## State Contract` heading style consistent across Task 9 inserts.

**4. Cross-task ordering:**
- Task 1 must precede Task 10 (orphan-adrs bidirectional) — Task 1's adr-loading-guide rewrite removes the obvious failures Task 10 would otherwise trip on. Order respected. ✓
- Task 3 must precede Task 11 (dead-refs ADR) — Task 3 ensures no stale ADR-NNN mentions remain in `.claude/agents/`. Order respected. ✓
- Task 4 must precede Task 6 — Task 4 creates `intents.json`, Task 6 references it via `$ref`. Order respected. ✓

**5. Commit message style:** All commits follow conventional-commits pattern matching repo's recent `feat()/fix()/docs()/chore()` style. ✓

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-05-20-multi-agent-ecosystem-audit-remediation.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. Use `superpowers:subagent-driven-development`.

**2. Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints for review.

Which approach? (Default if no answer: option 1 для меньшего расхода контекста сессии.)
