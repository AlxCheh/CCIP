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

// ── case 3: empty bootstrap (0 claims, placeholder row tolerated) ──────────
console.log('\n=== case 3: empty fixture (0 claims, expect 0 violations) ===');
{
  const tmp = setupTmp();
  try {
    const r = runHook(readFixture('optimizer-output-empty.md'), tmp);
    console.log(`  hook exit: ${r.status}`);
    const session = latestSessionFile(tmp);

    expectIncludes('empty: VIOLATIONS none', session, '## VIOLATIONS\n\n_none_');
    expectIncludes('empty: 0/0 verified', session, 'evidence_rows_verified: 0/0');
    expectNotIncludes('empty: no FIREWALL trips', session, 'FIREWALL_');
    expectNotIncludes('empty: placeholder row skipped (no L2)', session, 'L2_EVIDENCE_ROW');
    expectNotIncludes('empty: no L3 count drift', session, 'L3_EVIDENCE_COUNT_DRIFT');
  } finally { teardown(tmp); }
}

// ── case 4: escaped pipe (Wave 2 fix #2) ───────────────────────────────────
// Quote contains `\|\|` which must be un-escaped to `||` before substring-check
// against source containing `if (a || b) continue;`.
console.log('\n=== case 4: escaped pipe quote (Wave 2 fix #2) ===');
{
  const tmp = setupTmp();
  try {
    const r = runHook(readFixture('optimizer-output-wave2-pipe.md'), tmp);
    console.log(`  hook exit: ${r.status}`);
    const session = latestSessionFile(tmp);

    expectIncludes('pipe: 1/1 verified after un-escape', session, 'evidence_rows_verified: 1/1');
    expectNotIncludes('pipe: no L2 trips', session, 'L2_EVIDENCE_ROW');
    expectIncludes('pipe: VIOLATIONS none', session, '## VIOLATIONS\n\n_none_');
  } finally { teardown(tmp); }
}

// ── case 5: cyrillic quote 81B (Wave 2 fix #3) ─────────────────────────────
// Quote is 43 code units / 81 UTF-8 bytes. Spec says ≤80B. Current hook uses
// `.length` (code units) and passes; fixed hook uses Buffer.byteLength.
console.log('\n=== case 5: cyrillic 81-byte quote (Wave 2 fix #3) ===');
{
  const tmp = setupTmp();
  try {
    const r = runHook(readFixture('optimizer-output-wave2-cyrillic.md'), tmp);
    console.log(`  hook exit: ${r.status}`);
    const session = latestSessionFile(tmp);

    expectIncludes('cyrillic: detects byte-length violation', session, 'quote_too_long(81B)');
    expectIncludes('cyrillic: L2 row 1 flagged', session, 'L2_EVIDENCE_ROW_1');
    expectIncludes('cyrillic: 0/1 verified', session, 'evidence_rows_verified: 0/1');
  } finally { teardown(tmp); }
}

// ── case 6: Артефакт N — prefix heading tolerance (Wave 3) ──────────────────
// Defense-in-depth: if the agent emits `### Артефакт 2 — Next-Session Bootstrap`
// (the spec's structural label) instead of canonical `## Next-Session Bootstrap`,
// the hook should still extract the section correctly.
console.log('\n=== case 6: prefixed heading (Wave 3 tolerance) ===');
{
  const tmp = setupTmp();
  try {
    const r = runHook(readFixture('optimizer-output-wave3-prefix.md'), tmp);
    console.log(`  hook exit: ${r.status}`);
    const session = latestSessionFile(tmp);

    expectIncludes('prefixed bootstrap heading extracts', session, 'evidence_rows_verified: 1/1');
    expectNotIncludes('no FIREWALL_BOOTSTRAP_MISSING', session, 'FIREWALL_BOOTSTRAP_MISSING');
    expectNotIncludes('no L3 count drift', session, 'L3_EVIDENCE_COUNT_DRIFT');
    expectIncludes('prefixed heading: VIOLATIONS none', session, '## VIOLATIONS\n\n_none_');
  } finally { teardown(tmp); }
}

// ── case 7: branch claim verification (Wave 4) ──────────────────────────────
// Bootstrap claims `Branch: feat/definitely-nonexistent-branch-xyz` but the
// repo HEAD is on a different branch — hook should detect the drift.
console.log('\n=== case 7: branch drift (Wave 4) ===');
{
  const tmp = setupTmp();
  try {
    const r = runHook(readFixture('optimizer-output-wave4-branch-bad.md'), tmp);
    console.log(`  hook exit: ${r.status}`);
    const session = latestSessionFile(tmp);

    expectIncludes('branch: FIREWALL_BRANCH_DRIFT fired', session, 'FIREWALL_BRANCH_DRIFT');
    expectIncludes('branch: claimed value reported', session, 'claimed=feat/definitely-nonexistent-branch-xyz');
  } finally { teardown(tmp); }
}

// ── case 8: SHA token verification (Wave 5) ─────────────────────────────────
// Bootstrap references [sha:0000000] — syntactically valid 7-hex but no
// matching git object. Hook should flag FIREWALL_SHA_NOT_FOUND.
console.log('\n=== case 8: SHA not-found (Wave 5) ===');
{
  const tmp = setupTmp();
  try {
    const r = runHook(readFixture('optimizer-output-wave5-sha-bad.md'), tmp);
    console.log(`  hook exit: ${r.status}`);
    const session = latestSessionFile(tmp);

    expectIncludes('sha: FIREWALL_SHA_NOT_FOUND fired', session, 'FIREWALL_SHA_NOT_FOUND');
    expectIncludes('sha: token reported', session, '0000000');
  } finally { teardown(tmp); }
}

console.log(`\n=== summary: ${failed === 0 ? 'PASS' : `FAIL (${failed} assertion(s))`} ===`);
process.exit(failed === 0 ? 0 : 1);
