# Structural Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть три среднеприоритетных риска CCIP runtime: ADR immutability pre-commit (HA-8), session-state backup/recovery (SPOF-1), Windows stdin в hooks (UU-2).

**Architecture:** Каждый таск независим. HA-8 — расширение существующего tools/audit/adr-immutability.js в pre-commit режим. SPOF-1 — добавление read-before-write + rolling .bak в flush-state.js и post-agent-hook.js. UU-2 — integration-тесты hooks на реальном PowerShell с stdin.

**Tech Stack:** Node.js 18+, PowerShell 5.1/7, Jest, Windows 10 (primary), WSL optional.

**Timeline:** ~1 месяц, задачи независимые, можно выполнять в любом порядке.

**Source audit:** `docs/audit/2026-06-08-adversarial-rfc.md` §HA-8, §SPOF-1, §UU-2

---

## File Map

| File | Действие | Таск |
|------|----------|------|
| `tools/audit/adr-immutability.js` | Modify: добавить `--staged` mode | T1 |
| `tools/audit/__tests__/adr-immutability.test.js` | Modify: тесты pre-commit mode | T1 |
| `.husky/pre-commit` (или `.claude/hooks/pre-commit.sh`) | Create/Modify: добавить вызов | T1 |
| `.claude/runtime/flush-state.js` | Modify: re-read + write .bak before atomic write | T2 |
| `.claude/runtime/post-agent-hook.js` | Modify: то же для writeState в session | T2 |
| `.claude/runtime/read-state.js` (или util) | Modify: добавить auto-restore из .bak | T2 |
| `tools/audit/__tests__/flush-state.test.js` | Create: тест backup/restore | T2 |
| `tools/audit/__tests__/hooks-windows-stdin.test.js` | Create: integration тесты stdin | T3 |

---

## Task 1 — HA-8: ADR pre-commit immutability check

**Проблема:** `adr-immutability.js` запускается только в CI/`node tools/audit/...`, сравнивая HEAD vs origin/main. Pre-commit хук проходит. Разработчик коммитит правку `accepted` ADR → CI падает уже после коммита (и не откатывает его автоматически).

**Цель:** добавить режим `--staged` который проверяет staged files против HEAD, запустить его в pre-commit хуке.

**Files:**
- Modify: `tools/audit/adr-immutability.js`
- Modify: `tools/audit/__tests__/adr-immutability.test.js`
- Create/Modify: pre-commit hook

- [ ] **Step 1: Прочитать существующий adr-immutability.js**

```bash
cat -n tools/audit/adr-immutability.js
```

Ожидание: понять структуру — как читает статус ADR, какие диффы проверяет.

- [ ] **Step 2: Написать failing тест для `--staged` mode**

Добавить в `tools/audit/__tests__/adr-immutability.test.js`:

```javascript
describe('--staged mode', () => {
  it('rejects staged modification of accepted ADR', () => {
    // setup: write an accepted ADR file with mock content
    // mock execSync('git diff --staged --name-only') to return the ADR path
    // mock readFileSync to return the staged (modified) content
    // mock execSync('git show HEAD:path') to return the original content
    // call checkStagedADRs()
    // expect: process.exit(1) or throw with "immutability violation"
  });

  it('allows staging of non-accepted ADR', () => {
    // same setup but ADR status: "proposed"
    // expect: no error
  });

  it('allows staging new ADR file (HEAD does not have it)', () => {
    // mock git show to throw ENOENT (new file)
    // expect: no error
  });
});
```

```bash
node --experimental-vm-modules node_modules/.bin/jest tools/audit/__tests__/adr-immutability.test.js --testNamePattern="staged" 2>&1 | tail -20
```

Ожидание: FAIL — `checkStagedADRs is not a function`

- [ ] **Step 3: Добавить `checkStagedADRs()` в adr-immutability.js**

```javascript
// В конце файла, перед module.exports:
function checkStagedADRs() {
  const { execSync, spawnSync } = require('child_process');
  let stagedFiles;
  try {
    stagedFiles = execSync('git diff --staged --name-only', { encoding: 'utf8' })
      .split('\n').filter(Boolean);
  } catch {
    return; // не git-репозиторий или нет staged files
  }

  const adrFiles = stagedFiles.filter(f => f.match(/docs\/decisions\/ADR-\d+.*\.md$/));
  if (adrFiles.length === 0) return;

  const violations = [];
  for (const filePath of adrFiles) {
    let headContent;
    try {
      headContent = execSync(`git show HEAD:${filePath}`, { encoding: 'utf8' });
    } catch {
      continue; // новый файл — OK
    }
    const statusMatch = headContent.match(/^\*\*Status:\*\*\s+(.+)$/m);
    if (!statusMatch) continue;
    const status = statusMatch[1].trim().toLowerCase();
    if (status === 'accepted') {
      violations.push(filePath);
    }
  }

  if (violations.length > 0) {
    console.error('[adr-immutability] BLOCK: attempting to modify accepted ADR(s):');
    violations.forEach(f => console.error(`  - ${f}`));
    console.error('Increment revision or create a superseding ADR instead.');
    process.exit(1);
  }
}

if (require.main === module) {
  const mode = process.argv[2];
  if (mode === '--staged') {
    checkStagedADRs();
  } else {
    // existing CI mode
    runCICheck();
  }
}

module.exports = { ...(module.exports || {}), checkStagedADRs };
```

> Примечание: `runCICheck()` — замените на реальное имя существующей точки входа в файле.

- [ ] **Step 4: Запустить тесты**

```bash
node --experimental-vm-modules node_modules/.bin/jest tools/audit/__tests__/adr-immutability.test.js 2>&1 | tail -20
```

Ожидание: все тесты проходят.

- [ ] **Step 5: Добавить вызов в pre-commit хук**

Найти или создать `.husky/pre-commit` (если проект использует husky) или добавить в существующий pre-commit скрипт:

```bash
# ADR immutability check
node tools/audit/adr-immutability.js --staged
```

Если husky не используется — проверить `.git/hooks/pre-commit` или создать:

```bash
#!/bin/sh
node tools/audit/adr-immutability.js --staged
```

```bash
chmod +x .git/hooks/pre-commit  # Linux/Mac
```

На Windows: `.git/hooks/pre-commit` без расширения работает в Git Bash.

- [ ] **Step 6: Smoke-test pre-commit вручную**

```bash
# Временно пометить staging изменение в accepted ADR
echo "" >> docs/decisions/ADR-001-core-architecture.md
git add docs/decisions/ADR-001-core-architecture.md
git commit -m "test" --dry-run 2>&1 || true
git restore --staged docs/decisions/ADR-001-core-architecture.md
git checkout -- docs/decisions/ADR-001-core-architecture.md
```

Ожидание: вывод `[adr-immutability] BLOCK: ...` и выход с кодом 1.

- [ ] **Step 7: Commit**

```bash
git add tools/audit/adr-immutability.js tools/audit/__tests__/adr-immutability.test.js
git commit -m "fix(audit): add --staged mode to adr-immutability for pre-commit gate"
```

---

## Task 2 — SPOF-1: session-state.json rolling backup

**Проблема:** если `session-state.json` повреждён (EBUSY, partial write, disk error) — вся runtime governance слетает и начинается с пустого state. Нет автоматического recovery.

**Цель:** перед каждой атомарной записью state сохранять предыдущую версию в `.bak`; при чтении, если JSON невалиден, пытаться восстановить из `.bak`.

**Files:**
- Modify: `.claude/runtime/flush-state.js`
- Modify: `.claude/runtime/post-agent-hook.js` (если содержит writeState)
- Create: `tools/audit/__tests__/flush-state.test.js`

- [ ] **Step 1: Прочитать flush-state.js**

```bash
cat -n .claude/runtime/flush-state.js
```

Ожидание: найти `writeFileSync(tmp, ...)` + `renameSync(tmp, STATE_PATH)` pattern. Запомнить STATE_PATH.

- [ ] **Step 2: Написать failing тест**

Создать `tools/audit/__tests__/flush-state.test.js`:

```javascript
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('flush-state backup/restore', () => {
  let tmpDir;
  let statePath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flush-state-test-'));
    statePath = path.join(tmpDir, 'session-state.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates .bak before writing new state', () => {
    const oldState = { session_id: 'old', status: 'done' };
    fs.writeFileSync(statePath, JSON.stringify(oldState));

    const { writeStateSafe } = require('../../../.claude/runtime/flush-state');
    const newState = { session_id: 'new', status: 'planning' };
    writeStateSafe(newState, statePath);

    expect(fs.existsSync(statePath + '.bak')).toBe(true);
    const bak = JSON.parse(fs.readFileSync(statePath + '.bak', 'utf8'));
    expect(bak.session_id).toBe('old');
  });

  it('reads .bak when main file is corrupt', () => {
    const goodState = { session_id: 'good', status: 'done' };
    fs.writeFileSync(statePath + '.bak', JSON.stringify(goodState));
    fs.writeFileSync(statePath, 'CORRUPT{{{');

    const { readStateSafe } = require('../../../.claude/runtime/flush-state');
    const result = readStateSafe(statePath);
    expect(result.session_id).toBe('good');
  });

  it('returns defaultState when both files corrupt', () => {
    fs.writeFileSync(statePath, 'CORRUPT');
    fs.writeFileSync(statePath + '.bak', 'ALSO_CORRUPT');

    const { readStateSafe } = require('../../../.claude/runtime/flush-state');
    const result = readStateSafe(statePath);
    expect(result).toBeDefined(); // defaultState
    expect(result.observations).toEqual([]);
  });
});
```

```bash
node --experimental-vm-modules node_modules/.bin/jest tools/audit/__tests__/flush-state.test.js 2>&1 | tail -20
```

Ожидание: FAIL — `writeStateSafe is not a function`

- [ ] **Step 3: Добавить writeStateSafe и readStateSafe в flush-state.js**

Найти существующий writeState / readState. Добавить (или модифицировать):

```javascript
const BAK_SUFFIX = '.bak';

function writeStateSafe(state, statePath) {
  statePath = statePath || STATE_PATH;
  const bakPath = statePath + BAK_SUFFIX;
  const tmp = statePath + '.tmp';

  // backup current state before overwriting
  if (fs.existsSync(statePath)) {
    try { fs.copyFileSync(statePath, bakPath); } catch (_) {}
  }

  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, statePath);
}

function readStateSafe(statePath) {
  statePath = statePath || STATE_PATH;
  const bakPath = statePath + BAK_SUFFIX;

  for (const p of [statePath, bakPath]) {
    if (!fs.existsSync(p)) continue;
    try {
      const raw = fs.readFileSync(p, 'utf8');
      return JSON.parse(raw);
    } catch (_) {}
  }
  return defaultState(); // функция уже существует в файле
}

module.exports = { ...(module.exports || {}), writeStateSafe, readStateSafe };
```

Заменить все вызовы `writeFileSync(STATE_PATH, ...)` → `writeStateSafe(state)` и `JSON.parse(readFileSync(STATE_PATH))` → `readStateSafe()` в этом файле.

- [ ] **Step 4: Применить readStateSafe в post-agent-hook.js**

```bash
grep -n "readFileSync\|JSON.parse" .claude/runtime/post-agent-hook.js | head -20
```

Найти place где читается session-state. Заменить на:

```javascript
const { readStateSafe } = require('./flush-state');
// ...
const state = readStateSafe();
```

- [ ] **Step 5: Запустить тесты**

```bash
node --experimental-vm-modules node_modules/.bin/jest tools/audit/__tests__/flush-state.test.js 2>&1 | tail -20
```

Ожидание: все 3 теста проходят.

- [ ] **Step 6: Smoke-test вручную**

```bash
# Corrupt state file
echo "CORRUPT" > .claude/runtime/session-state.json
node -e "const {readStateSafe}=require('./.claude/runtime/flush-state'); console.log(readStateSafe())"
```

Ожидание: выводит defaultState или содержимое .bak, не бросает исключение.

```bash
# Восстановить нормальный state из session-state.json.bak (если есть)
# или через git restore
git restore .claude/runtime/session-state.json
```

- [ ] **Step 7: Commit**

```bash
git add .claude/runtime/flush-state.js .claude/runtime/post-agent-hook.js tools/audit/__tests__/flush-state.test.js
git commit -m "fix(runtime): add session-state rolling backup and safe read/write (SPOF-1)"
```

---

## Task 3 — UU-2: Windows stdin integration tests for hooks

**Проблема:** hook-скрипты (post-agent-hook.js, pre-agent-gate.js, etc.) принимают stdin в формате JSON (`process.stdin.on('data', ...)`). На Windows PowerShell есть специфика: pipe через `|` передаёт UTF-16 LE, `echo` добавляет CRLF, и `spawnSync` ведёт себя иначе чем в bash. Поведение не тестировалось.

**Цель:** написать integration тесты которые запускают hook-скрипты через `child_process.spawnSync` с явным stdin, проверяют что они корректно читают JSON и не падают на Windows-специфичных edge cases.

**Files:**
- Create: `tools/audit/__tests__/hooks-windows-stdin.test.js`

- [ ] **Step 1: Определить список hooks с stdin**

```bash
grep -l "process.stdin" .claude/runtime/*.js
```

Ожидание: список файлов (обычно post-agent-hook.js, pre-agent-gate.js, audit-session-reset.js).

- [ ] **Step 2: Написать тест-шаблон для stdin-aware hook**

Создать `tools/audit/__tests__/hooks-windows-stdin.test.js`:

```javascript
const { spawnSync } = require('child_process');
const path = require('path');

const HOOKS_DIR = path.resolve(__dirname, '../../../.claude/runtime');
const NODE = process.execPath;

function runHook(scriptName, stdinPayload) {
  const result = spawnSync(NODE, [path.join(HOOKS_DIR, scriptName)], {
    input: JSON.stringify(stdinPayload),
    encoding: 'utf8',
    timeout: 5000,
    env: { ...process.env, CCIP_TEST_MODE: '1' }
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
    error: result.error
  };
}

describe('hooks stdin on Windows', () => {
  describe('post-agent-hook.js', () => {
    it('handles valid JSON stdin without crash', () => {
      const payload = {
        tool_name: 'Agent',
        tool_input: { description: 'test', subagent_type: 'general-purpose' },
        tool_result: { content: [{ type: 'text', text: 'ok' }] }
      };
      const { status, error } = runHook('post-agent-hook.js', payload);
      expect(error).toBeUndefined();
      // exit 0 or 1 — both OK, not crash
      expect([0, 1]).toContain(status);
    });

    it('handles CRLF-terminated JSON without parse error', () => {
      const crlfJson = '{"tool_name":"Read","tool_input":{},"tool_result":{}}\r\n';
      const result = spawnSync(NODE, [path.join(HOOKS_DIR, 'post-agent-hook.js')], {
        input: crlfJson,
        encoding: 'utf8',
        timeout: 5000,
        env: { ...process.env, CCIP_TEST_MODE: '1' }
      });
      expect(result.error).toBeUndefined();
      expect(result.stderr).not.toMatch(/SyntaxError/);
    });

    it('handles empty stdin gracefully', () => {
      const result = spawnSync(NODE, [path.join(HOOKS_DIR, 'post-agent-hook.js')], {
        input: '',
        encoding: 'utf8',
        timeout: 5000,
        env: { ...process.env, CCIP_TEST_MODE: '1' }
      });
      expect(result.error).toBeUndefined();
      // должен завершиться, а не зависнуть
    });

    it('handles UTF-8 JSON with non-ASCII characters', () => {
      const payload = {
        tool_name: 'Agent',
        tool_input: { description: 'тест кириллица', subagent_type: 'general-purpose' },
        tool_result: { content: [{ type: 'text', text: 'результат' }] }
      };
      const { error, stderr } = runHook('post-agent-hook.js', payload);
      expect(error).toBeUndefined();
      expect(stderr).not.toMatch(/SyntaxError/);
    });
  });

  describe('pre-agent-gate.js', () => {
    it('handles valid PreToolUse payload without crash', () => {
      const payload = {
        tool_name: 'Agent',
        tool_input: { description: 'test task', subagent_type: 'ccip-backend-core' }
      };
      const { error, stderr } = runHook('pre-agent-gate.js', payload);
      expect(error).toBeUndefined();
      expect(stderr).not.toMatch(/SyntaxError/);
    });
  });
});
```

```bash
node --experimental-vm-modules node_modules/.bin/jest tools/audit/__tests__/hooks-windows-stdin.test.js 2>&1 | tail -30
```

Ожидание: тесты запустились. Если падают с реальными ошибками stdin — это и есть UU-2 bug; фиксировать в следующем step.

- [ ] **Step 3: Исправить найденные Windows stdin баги**

Частый паттерн в Node.js hooks:

```javascript
// ПРОБЛЕМА: зависает если stdin закрыт раньше
process.stdin.on('data', chunk => { ... });
// FIX: добавить timeout и явный end handler
```

Если hook использует синхронное чтение через `fs.readFileSync('/dev/stdin')` — на Windows это не работает. Заменить на:

```javascript
function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => chunks.push(c));
    process.stdin.on('end', () => resolve(chunks.join('')));
    process.stdin.on('error', () => resolve(''));
    // Windows safety: if stdin is not a pipe, resolve immediately
    if (!process.stdin.isTTY && process.platform === 'win32') {
      setTimeout(() => resolve(chunks.join('')), 100);
    }
  });
}
```

Применить к каждому хуку у которого тест упал с таймаутом или ошибкой.

- [ ] **Step 4: Добавить CCIP_TEST_MODE guard в hooks (если нет)**

Чтобы в тест-режиме hooks не писали в реальный session-state:

```javascript
// В начале каждого hook:
const TEST_MODE = process.env.CCIP_TEST_MODE === '1';
// ...
// Перед writeFileSync:
if (!TEST_MODE) {
  writeStateSafe(state);
}
```

- [ ] **Step 5: Перезапустить тесты — убедиться в зелёном статусе**

```bash
node --experimental-vm-modules node_modules/.bin/jest tools/audit/__tests__/hooks-windows-stdin.test.js --verbose 2>&1 | tail -40
```

Ожидание: все тесты зелёные. Timeout < 5s на каждый тест.

- [ ] **Step 6: Добавить в CI (если настроен)**

Если есть `.github/workflows/` — добавить шаг:

```yaml
- name: Hook stdin tests (Windows)
  run: node --experimental-vm-modules node_modules/.bin/jest tools/audit/__tests__/hooks-windows-stdin.test.js
  if: runner.os == 'Windows'
```

- [ ] **Step 7: Commit**

```bash
git add tools/audit/__tests__/hooks-windows-stdin.test.js .claude/runtime/post-agent-hook.js .claude/runtime/pre-agent-gate.js
git commit -m "test(runtime): add Windows stdin integration tests for hooks (UU-2)"
```

---

## Dependency Graph

```
T1 (HA-8)   ──independent──┐
T2 (SPOF-1) ──independent──┤ все три можно делать параллельно
T3 (UU-2)   ──independent──┘
```

---

## Post-Implementation Validation

После выполнения всех трёх задач:

- [ ] Запустить полный audit suite: `node tools/audit/audit-suite.js`
- [ ] Попробовать закоммитить изменение в accepted ADR — должен заблокировать
- [ ] Corrupt session-state.json и запустить любой hook — должен восстановиться
- [ ] Прогнать hooks-windows-stdin.test.js — все зелёные
