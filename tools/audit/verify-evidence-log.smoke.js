#!/usr/bin/env node
/**
 * Smoke test for verify-evidence-log.js hook.
 * Runs two synthetic payloads against the hook in an isolated tmpdir,
 * asserts expected violations / clean output, then cleans up.
 *
 * Real persistence paths (docs/errors/sessions/, session-opt-index.md,
 * errors_log.md) are never touched.
 *
 * Run: node tools/audit/verify-evidence-log.smoke.js
 * Exit 0 on success, 1 on failure.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const HOOK = path.join(ROOT, '.claude/runtime/verify-evidence-log.js');
const FIX_DIR = path.join(__dirname, '__fixtures__');

function setupTmp() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccip-opt-smoke-'));
  const sessions = path.join(tmpRoot, 'sessions');
  fs.mkdirSync(sessions);
  return {
    root: tmpRoot,
    sessions,
    index: path.join(tmpRoot, 'index.md'),
    errors: path.join(tmpRoot, 'errors.md'),
    lock: path.join(tmpRoot, 'optimizer.lock'),
  };
}

function teardown(tmp) {
  try { fs.rmSync(tmp.root, { recursive: true, force: true }); } catch {}
}

function runHook(agentOutput, tmp) {
  const payload = {
    tool_name: 'Agent',
    tool_input: { subagent_type: 'ccip-session-optimizer' },
    tool_response: { content: agentOutput },
  };
  return spawnSync('node', [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: {
      ...process.env,
      OPT_SESSIONS_DIR: tmp.sessions,
      OPT_INDEX_FILE:   tmp.index,
      OPT_ERRORS_LOG:   tmp.errors,
      OPT_LOCK_FILE:    tmp.lock,
    },
  });
}

function readFixture(name) {
  return fs.readFileSync(path.join(FIX_DIR, name), 'utf-8');
}

function latestSessionFile(tmp) {
  const files = fs.readdirSync(tmp.sessions).filter(f => f.endsWith('.md')).sort();
  if (!files.length) return null;
  return fs.readFileSync(path.join(tmp.sessions, files[files.length - 1]), 'utf-8');
}

let failed = 0;
function expectIncludes(label, haystack, needle) {
  if (haystack && haystack.includes(needle)) {
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✗ ${label}\n    expected: ${JSON.stringify(needle)}`);
    failed++;
  }
}
function expectNotIncludes(label, haystack, needle) {
  if (!haystack || !haystack.includes(needle)) {
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✗ ${label}\n    unexpected: ${JSON.stringify(needle)}`);
    failed++;
  }
}

// ── case 1: mixed (expect violations) ────────────────────────────────────────
console.log('\n=== case 1: mixed fixture (expect violations) ===');
{
  const tmp = setupTmp();
  try {
    const r = runHook(readFixture('optimizer-output-mixed.md'), tmp);
    console.log(`  hook exit: ${r.status}`);
    console.log(`  stderr: ${r.stderr.trim()}`);
    const session = latestSessionFile(tmp);

    expectIncludes('session-file has VIOLATIONS section', session, '## VIOLATIONS');
    expectIncludes('detects self-attest "verified"', session, 'FIREWALL_SELF_ATTEST');
    expectIncludes('detects missing source file (row 2)', session, 'source_file_missing');
    expectIncludes('detects missing source prefix (row 3)', session, 'source_prefix_invalid');
    expectIncludes('row 1 (CLAUDE.md / Simple > complex) verified', session, 'evidence_rows_verified: 1/3');
  } finally { teardown(tmp); }
}

// ── case 2: clean (expect 0 violations) ─────────────────────────────────────
console.log('\n=== case 2: clean fixture (expect 0 violations) ===');
{
  const tmp = setupTmp();
  try {
    const r = runHook(readFixture('optimizer-output-clean.md'), tmp);
    console.log(`  hook exit: ${r.status}`);
    const session = latestSessionFile(tmp);

    expectIncludes('clean: VIOLATIONS none', session, '## VIOLATIONS\n\n_none_');
    expectIncludes('clean: 1/1 verified', session, 'evidence_rows_verified: 1/1');
    expectNotIncludes('clean: no FIREWALL trips', session, 'FIREWALL_');
    expectNotIncludes('clean: no L2 trips', session, 'L2_EVIDENCE_ROW');
  } finally { teardown(tmp); }
}

console.log(`\n=== summary: ${failed === 0 ? 'PASS' : `FAIL (${failed} assertion(s))`} ===`);
process.exit(failed === 0 ? 0 : 1);
