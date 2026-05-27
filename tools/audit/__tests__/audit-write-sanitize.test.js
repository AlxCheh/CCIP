'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { gitRoot } = require('../_lib/git-root');

const HOOK = path.join(gitRoot(), '.claude/runtime/audit-write-sanitize.js');
const { detectMalformedAuditPath, isAuditRulesYaml, stripBomAtomic } = require('../../../.claude/runtime/audit-write-sanitize');

function run(payload) {
  return cp.spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload), encoding: 'utf8',
  });
}

const pre = (tool, filePath) => ({
  hook_event_name: 'PreToolUse',
  tool_name: tool,
  tool_input: { file_path: filePath },
});

const post = (tool, filePath) => ({
  hook_event_name: 'PostToolUse',
  tool_name: tool,
  tool_input: { file_path: filePath },
});

// ─── unit: detector ───────────────────────────────────────────────────────────

test('detector: reports without slash → malformed', () => {
  assert.deepStrictEqual(
    detectMalformedAuditPath('.claude/audit/reportsabc.md'),
    { type: 'reports', badSuffix: 'abc.md' }
  );
});

test('detector: evidence without slash → malformed', () => {
  assert.deepStrictEqual(
    detectMalformedAuditPath('.claude/audit/evidencefoo.json'),
    { type: 'evidence', badSuffix: 'foo.json' }
  );
});

test('detector: reports with slash → clean', () => {
  assert.strictEqual(detectMalformedAuditPath('.claude/audit/reports/abc.md'), null);
});

test('detector: bare reports dir → clean (no filename appended)', () => {
  assert.strictEqual(detectMalformedAuditPath('.claude/audit/reports'), null);
});

test('detector: Windows backslashes normalized', () => {
  assert.deepStrictEqual(
    detectMalformedAuditPath('.claude\\audit\\reportsXYZ.md'),
    { type: 'reports', badSuffix: 'XYZ.md' }
  );
});

test('detector: absolute path with reports without slash → malformed', () => {
  assert.deepStrictEqual(
    detectMalformedAuditPath('/tmp/proj/.claude/audit/reports2026.md'),
    { type: 'reports', badSuffix: '2026.md' }
  );
});

test('detector: unrelated path → clean', () => {
  assert.strictEqual(detectMalformedAuditPath('docs/something.md'), null);
});

test('detector: directory name "reports" not under audit → clean', () => {
  assert.strictEqual(detectMalformedAuditPath('foo/reportsXYZ.md'), null);
});

// ─── unit: yaml matcher ───────────────────────────────────────────────────────

test('isAuditRulesYaml: rules yaml → true', () => {
  assert.strictEqual(isAuditRulesYaml('.claude/audit/rules/active.yaml'), true);
  assert.strictEqual(isAuditRulesYaml('.claude/audit/rules/baseline.yaml'), true);
});

test('isAuditRulesYaml: rules subdir different ext → false', () => {
  assert.strictEqual(isAuditRulesYaml('.claude/audit/rules/active.yml'), false);
  assert.strictEqual(isAuditRulesYaml('.claude/audit/rules/something.json'), false);
});

test('isAuditRulesYaml: unrelated yaml → false', () => {
  assert.strictEqual(isAuditRulesYaml('docs/foo.yaml'), false);
});

// ─── unit: BOM strip ──────────────────────────────────────────────────────────

test('stripBomAtomic: file with BOM → BOM removed, content preserved', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccip-bom-'));
  const file = path.join(tmp, 'active.yaml');
  try {
    const body = 'version: 1\nactive: []\n';
    fs.writeFileSync(file, Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(body, 'utf8')]));
    assert.strictEqual(stripBomAtomic(file), true);
    const after = fs.readFileSync(file);
    assert.notStrictEqual(after[0], 0xEF);
    assert.strictEqual(after.toString('utf8'), body);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('stripBomAtomic: file without BOM → no-op, content untouched', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccip-bom-'));
  const file = path.join(tmp, 'active.yaml');
  try {
    const body = 'version: 1\nactive: []\n';
    fs.writeFileSync(file, body, 'utf8');
    assert.strictEqual(stripBomAtomic(file), false);
    assert.strictEqual(fs.readFileSync(file, 'utf8'), body);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

// ─── integration: PreToolUse via subprocess ──────────────────────────────────

test('Pre + Write + bad reports path → deny', () => {
  const r = run(pre('Write', '.claude/audit/reportsabc.md'));
  assert.match(r.stdout, /"permissionDecision":"deny"/);
  assert.match(r.stdout, /Malformed audit path/);
});

test('Pre + Edit + bad evidence path → deny', () => {
  const r = run(pre('Edit', '.claude/audit/evidencefoo.json'));
  assert.match(r.stdout, /"permissionDecision":"deny"/);
  assert.match(r.stdout, /evidence/);
});

test('Pre + Write + good reports path → allow (empty stdout)', () => {
  const r = run(pre('Write', '.claude/audit/reports/2026-05-26-abc.md'));
  assert.strictEqual(r.stdout, '');
  assert.strictEqual(r.status, 0);
});

test('Pre + Write + good evidence path → allow', () => {
  const r = run(pre('Write', '.claude/audit/evidence/2026-05-26-abc.json'));
  assert.strictEqual(r.stdout, '');
});

test('Pre + non-Write tool → pass-through', () => {
  const r = run({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } });
  assert.strictEqual(r.stdout, '');
});

test('Pre + Write + unrelated path → allow', () => {
  const r = run(pre('Write', 'docs/decisions/ADR-999.md'));
  assert.strictEqual(r.stdout, '');
});

// ─── integration: PostToolUse via subprocess ─────────────────────────────────

test('Post + Write + rules yaml with BOM → BOM stripped', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccip-hook-'));
  const audit = path.join(tmp, '.claude/audit/rules');
  fs.mkdirSync(audit, { recursive: true });
  const file = path.join(audit, 'active.yaml');
  try {
    const body = 'version: 1\nactive: []\n';
    fs.writeFileSync(file, Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(body, 'utf8')]));
    const r = run(post('Write', file));
    assert.strictEqual(r.status, 0);
    const after = fs.readFileSync(file);
    assert.notStrictEqual(after[0], 0xEF, 'BOM must be removed');
    assert.strictEqual(after.toString('utf8'), body);
    assert.match(r.stderr, /stripped UTF-8 BOM/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('Post + Edit + rules yaml without BOM → file untouched', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccip-hook-'));
  const audit = path.join(tmp, '.claude/audit/rules');
  fs.mkdirSync(audit, { recursive: true });
  const file = path.join(audit, 'active.yaml');
  try {
    const body = 'version: 1\nactive: []\n';
    fs.writeFileSync(file, body, 'utf8');
    const r = run(post('Edit', file));
    assert.strictEqual(r.status, 0);
    assert.strictEqual(fs.readFileSync(file, 'utf8'), body);
    assert.doesNotMatch(r.stderr || '', /stripped/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('Post + Write + non-rules path → ignored (no error, no touch)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccip-hook-'));
  const file = path.join(tmp, 'docs.md');
  try {
    // даже если в файле есть BOM, путь не подходит — не трогаем
    fs.writeFileSync(file, Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from('# hi\n', 'utf8')]));
    const r = run(post('Write', file));
    assert.strictEqual(r.status, 0);
    const after = fs.readFileSync(file);
    assert.strictEqual(after[0], 0xEF, 'unrelated file must not be modified');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('malformed stdin → fail-open (exit 0, no deny)', () => {
  const r = cp.spawnSync(process.execPath, [HOOK], { input: 'not-json', encoding: 'utf8' });
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '');
});
