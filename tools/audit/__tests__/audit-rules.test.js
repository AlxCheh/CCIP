const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const SCRIPT = path.join(root, 'tools/audit/audit-rules.js');
const RULES  = path.join(root, '.claude/audit/rules');
const FILES  = ['baseline.yaml', 'active.yaml', 'quarantine.yaml', 'deprecated.yaml', 'baseline.lock']
  .map(f => path.join(RULES, f));

function backup() {
  const snap = FILES.map(f => [f, fs.existsSync(f) ? fs.readFileSync(f, 'utf-8') : null]);
  return () => snap.forEach(([f, v]) => {
    if (v === null) { try { fs.unlinkSync(f); } catch {} }
    else fs.writeFileSync(f, v, 'utf-8');
  });
}
function run() {
  const r = cp.spawnSync(process.execPath, [SCRIPT], { encoding: 'utf-8' });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
const write = (name, txt) => fs.writeFileSync(path.join(RULES, name), txt);

test('passes on the committed rule set', () => {
  const r = run();
  assert.strictEqual(r.status, 0, r.out);
  assert.match(r.out, /\[RULES\] OK/);
});

test('G1 — detects baseline tampering (hash mismatch)', () => {
  const restore = backup();
  try {
    const bl = fs.readFileSync(path.join(RULES, 'baseline.yaml'), 'utf-8');
    write('baseline.yaml', bl + '\n# tampered\n');
    const r = run();
    assert.strictEqual(r.status, 1);
    assert.match(r.out, /hash mismatch/);
  } finally { restore(); }
});

test('G1 — fails when baseline.lock is missing', () => {
  const restore = backup();
  try {
    fs.unlinkSync(path.join(RULES, 'baseline.lock'));
    const r = run();
    assert.strictEqual(r.status, 1);
    assert.match(r.out, /baseline\.lock missing/);
  } finally { restore(); }
});

test('G4 — detects a rule in both active and quarantine', () => {
  const restore = backup();
  try {
    // R-007 lives in quarantine; also add it to active → overlap
    const act = fs.readFileSync(path.join(RULES, 'active.yaml'), 'utf-8')
      .replace('active:', 'active:\n  - { id: R-007, status: active, hit_count: 0, precision: null, sessions_observed: 0 }');
    write('active.yaml', act);
    const r = run();
    assert.strictEqual(r.status, 1);
    assert.match(r.out, /R-007 in both active and quarantine/);
  } finally { restore(); }
});

test('MEM — detects a working-set rule absent from baseline', () => {
  const restore = backup();
  try {
    const act = fs.readFileSync(path.join(RULES, 'active.yaml'), 'utf-8')
      .replace('active:', 'active:\n  - { id: R-999, status: active, hit_count: 0, precision: null, sessions_observed: 0 }');
    write('active.yaml', act);
    const r = run();
    assert.strictEqual(r.status, 1);
    assert.match(r.out, /R-999 in active\.yaml not in baseline/);
  } finally { restore(); }
});

test('PART — detects a baseline rule placed in no working set', () => {
  const restore = backup();
  try {
    // remove R-001 from active → it is now in no working set
    const act = fs.readFileSync(path.join(RULES, 'active.yaml'), 'utf-8')
      .split('\n').filter(l => !l.includes('id: R-001,')).join('\n');
    write('active.yaml', act);
    const r = run();
    assert.strictEqual(r.status, 1);
    assert.match(r.out, /R-001 not placed in any working set/);
  } finally { restore(); }
});

test('--write-lock regenerates a matching lock', () => {
  const restore = backup();
  try {
    fs.unlinkSync(path.join(RULES, 'baseline.lock'));
    const w = cp.spawnSync(process.execPath, [SCRIPT, '--write-lock'], { encoding: 'utf-8' });
    assert.strictEqual(w.status, 0);
    assert.ok(fs.existsSync(path.join(RULES, 'baseline.lock')));
    assert.strictEqual(run().status, 0); // validates clean after bootstrap
  } finally { restore(); }
});
