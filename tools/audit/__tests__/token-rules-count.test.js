const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { gitRoot } = require('../_lib/git-root');
const { applyStats } = require('../token-rules-count');

const root = gitRoot();
const SCRIPT = path.join(root, 'tools/audit/token-rules-count.js');
const ACTIVE = path.join(root, '.claude/audit/rules/active.yaml');
const QUAR   = path.join(root, '.claude/audit/rules/quarantine.yaml');

function backup() {
  const snap = [ACTIVE, QUAR].map(f => [f, fs.readFileSync(f, 'utf-8')]);
  return () => snap.forEach(([f, v]) => fs.writeFileSync(f, v, 'utf-8'));
}
const parse = (p) => require('gray-matter')('---\n' + fs.readFileSync(p, 'utf-8') + '\n---\n').data;
const find = (list, id) => list.find(e => e.id === id);

// ── applyStats unit ──
test('applyStats bumps session counter and derives precision from cumulative tp/fp', () => {
  const out = applyStats({ id: 'R-001', hit_count: 5, tp: 3, fp: 1, sessions_observed: 2 }, { hits: 2, tp: 1, fp: 1 }, 'sessions_observed');
  assert.strictEqual(out.sessions_observed, 3);
  assert.strictEqual(out.hit_count, 7);
  assert.strictEqual(out.tp, 4);
  assert.strictEqual(out.fp, 2);
  assert.strictEqual(out.precision, +(4 / 6).toFixed(4));
});

test('applyStats with no stat: session++ , hits unchanged, precision from existing', () => {
  const out = applyStats({ id: 'R-002', hit_count: 0, tp: 0, fp: 0, sessions_observed: 0 }, undefined, 'sessions_observed');
  assert.strictEqual(out.sessions_observed, 1);
  assert.strictEqual(out.hit_count, 0);
  assert.strictEqual(out.precision, null); // 0/0 → null
});

test('applyStats handles missing tp/fp fields on legacy entry', () => {
  const out = applyStats({ id: 'R-003', hit_count: 1, precision: null, sessions_observed: 4 }, { hits: 1, tp: 1, fp: 0 }, 'sessions_observed');
  assert.strictEqual(out.tp, 1);
  assert.strictEqual(out.fp, 0);
  assert.strictEqual(out.precision, 1);
});

// ── CLI integration ──
test('CLI updates counters on the real rule set and stays audit-clean', () => {
  const restore = backup();
  try {
    const r = cp.spawnSync(process.execPath, [SCRIPT, '--session', '{"R-001":{"hits":2,"tp":1,"fp":1}}'], { encoding: 'utf-8' });
    assert.strictEqual(r.status, 0, r.stderr); // commitFiles ran audit-rules and it passed
    assert.match(r.stdout, /"status":"counted"/);
    const active = parse(ACTIVE).active;
    const r001 = find(active, 'R-001');
    assert.strictEqual(r001.hit_count, 2);
    assert.strictEqual(r001.precision, 0.5);
    assert.strictEqual(r001.sessions_observed, 1);
    // a rule not in the session still gets sessions_observed++ but no hits
    const other = active.find(e => e.id !== 'R-001');
    assert.strictEqual(other.sessions_observed, 1);
    assert.strictEqual(other.hit_count, 0);
    // quarantine rules get sessions_in_quarantine++
    const q = parse(QUAR).quarantine[0];
    assert.strictEqual(q.sessions_in_quarantine, 1);
  } finally { restore(); }
});

test('CLI --dry-run writes nothing', () => {
  const restore = backup();
  try {
    const before = fs.readFileSync(ACTIVE, 'utf-8');
    const r = cp.spawnSync(process.execPath, [SCRIPT, '--session', '{"R-001":{"hits":9}}', '--dry-run'], { encoding: 'utf-8' });
    assert.match(r.stdout, /"status": "dry-run"/);
    assert.strictEqual(fs.readFileSync(ACTIVE, 'utf-8'), before);
  } finally { restore(); }
});
