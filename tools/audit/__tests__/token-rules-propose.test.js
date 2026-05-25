const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const cp = require('node:child_process');
const { gitRoot } = require('../_lib/git-root');
const { computeProposals } = require('../token-rules-propose');
const { acquireSerialGuard } = require('../_lib/serial-guard');

// CLI-кейсы читают общий реальный rule-set (dry-run), который пишут соседние тесты →
// serial-by-design (см. serial-guard.js).
acquireSerialGuard('token-rules-propose.test.js');

const root = gitRoot();
const SCRIPT = path.join(root, 'tools/audit/token-rules-propose.js');

const Q = (over) => ({ quarantine: [{ id: 'R-007', status: 'quarantine', requires_transcript_access: false, sessions_in_quarantine: 3, hit_count: 5, precision: 0.8, ...over }] });
const A = (over) => ({ active: [{ id: 'R-001', status: 'active', hit_count: 0, precision: null, sessions_observed: 0, ...over }] });
const ROLL = (over) => ({ sessions_count: 30, aggregates: { delta_T_trend: -6, E_resp_mean: 0.7, ...over } });

test('no proposals on empty inputs', () => {
  const p = computeProposals({ active: [] }, { quarantine: [] }, {});
  assert.strictEqual(p.promote.length, 0);
  assert.strictEqual(p.deprecate.length, 0);
});

test('promotes a seasoned, precise rule when global savings trend holds', () => {
  const p = computeProposals(A(), Q(), ROLL());
  assert.strictEqual(p.promote.length, 1);
  assert.strictEqual(p.promote[0].id, 'R-007');
  assert.strictEqual(p.promote[0].q_estimated, true);
});

test('does NOT promote transcript-gated rule (G5)', () => {
  const p = computeProposals(A(), Q({ requires_transcript_access: true }), ROLL());
  assert.strictEqual(p.promote.length, 0);
});

test('does NOT promote when savings trend insufficient (delta_T_trend > -5)', () => {
  const p = computeProposals(A(), Q(), ROLL({ delta_T_trend: -3 }));
  assert.strictEqual(p.promote.length, 0);
});

test('does NOT promote when precision below 0.7', () => {
  const p = computeProposals(A(), Q({ precision: 0.5 }), ROLL());
  assert.strictEqual(p.promote.length, 0);
});

test('does NOT promote when sessions_in_quarantine < 3', () => {
  const p = computeProposals(A(), Q({ sessions_in_quarantine: 2 }), ROLL());
  assert.strictEqual(p.promote.length, 0);
});

test('does NOT promote when E_resp degraded below 0.6', () => {
  const p = computeProposals(A(), Q(), ROLL({ E_resp_mean: 0.5 }));
  assert.strictEqual(p.promote.length, 0);
});

test('promotes when E_resp unknown (null does not block)', () => {
  const p = computeProposals(A(), Q(), ROLL({ E_resp_mean: null }));
  assert.strictEqual(p.promote.length, 1);
});

test('deprecates active rule with no hits over 20 sessions (G9)', () => {
  const p = computeProposals(A({ sessions_observed: 20, hit_count: 0 }), { quarantine: [] }, ROLL());
  assert.strictEqual(p.deprecate.length, 1);
  assert.match(p.deprecate[0].reason, /hit_count==0/);
});

test('deprecates active rule with low precision (G9)', () => {
  const p = computeProposals(A({ precision: 0.3 }), { quarantine: [] }, ROLL());
  assert.strictEqual(p.deprecate.length, 1);
  assert.match(p.deprecate[0].reason, /precision/);
});

test('does NOT deprecate when sessions_observed below 20 and precision ok', () => {
  const p = computeProposals(A({ sessions_observed: 19, hit_count: 0 }), { quarantine: [] }, ROLL());
  assert.strictEqual(p.deprecate.length, 0);
});

test('CLI: no-proposals on the committed rule set', () => {
  const r = cp.spawnSync(process.execPath, [SCRIPT, '--dry-run'], { encoding: 'utf-8' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /"status": "dry-run"/);
});
