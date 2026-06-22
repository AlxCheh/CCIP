'use strict';
const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const os     = require('node:os');
const path   = require('node:path');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const MOD  = path.join(root, '.claude/runtime/dag-journal.js');
const {
  newRunId, hashDAG, appendEntry, loadEntries,
  getDoneSteps, findResumableRun, prune,
} = require(MOD);

function tmp() {
  return path.join(os.tmpdir(), `ccip-dj-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
}

const SAMPLE_DAG = [
  { step: 1, agent: 'ccip-architect', depends_on: [] },
  { step: 2, agent: 'ccip-dba',       depends_on: [1] },
];

test('newRunId returns non-empty unique strings', () => {
  const a = newRunId(), b = newRunId();
  assert.ok(typeof a === 'string' && a.length > 0);
  assert.notEqual(a, b, 'run ids must be unique');
});

test('hashDAG is deterministic and changes with DAG shape', () => {
  const h1 = hashDAG(SAMPLE_DAG);
  const h2 = hashDAG(SAMPLE_DAG);
  assert.equal(h1, h2, 'same DAG → same hash');
  const otherDag = [{ step: 1, agent: 'ccip-frontend', depends_on: [] }];
  assert.notEqual(h1, hashDAG(otherDag), 'different DAG → different hash');
});

test('appendEntry writes valid NDJSON line', () => {
  const jf = tmp();
  try {
    appendEntry({ run_id: 'r1', dag_hash: 'abc', event: 'run_start', ts: 't1' }, jf);
    appendEntry({ run_id: 'r1', dag_hash: 'abc', event: 'step_done', step: 1, ts: 't2' }, jf);
    const lines = fs.readFileSync(jf, 'utf-8').trim().split('\n').filter(Boolean);
    assert.equal(lines.length, 2);
    const e0 = JSON.parse(lines[0]);
    assert.equal(e0.event, 'run_start');
    assert.equal(e0.run_id, 'r1');
  } finally { fs.rmSync(jf, { force: true }); }
});

test('loadEntries returns [] for missing file', () => {
  assert.deepEqual(loadEntries('/nonexistent/dag-journal.jsonl'), []);
});

test('getDoneSteps returns step numbers of step_done events for this run', () => {
  const jf = tmp();
  try {
    appendEntry({ run_id: 'r1', event: 'step_done', step: 1, agent: 'a', ts: 't' }, jf);
    appendEntry({ run_id: 'r1', event: 'step_done', step: 2, agent: 'b', ts: 't' }, jf);
    appendEntry({ run_id: 'r2', event: 'step_done', step: 1, agent: 'a', ts: 't' }, jf); // other run
    const done = getDoneSteps('r1', jf);
    assert.deepEqual(done.sort(), [1, 2]);
  } finally { fs.rmSync(jf, { force: true }); }
});

test('findResumableRun returns latest incomplete run matching dag_hash', () => {
  const jf = tmp();
  const hash = hashDAG(SAMPLE_DAG);
  try {
    // r1: complete run (has run_done)
    appendEntry({ run_id: 'r1', dag_hash: hash, event: 'run_start', ts: new Date(2026, 0, 1).toISOString() }, jf);
    appendEntry({ run_id: 'r1', dag_hash: hash, event: 'step_done', step: 1, ts: 't' }, jf);
    appendEntry({ run_id: 'r1', dag_hash: hash, event: 'run_done', ts: 't' }, jf);

    // r2: partial run (no run_done) — this is the resumable one
    appendEntry({ run_id: 'r2', dag_hash: hash, event: 'run_start', ts: new Date(2026, 0, 2).toISOString() }, jf);
    appendEntry({ run_id: 'r2', dag_hash: hash, event: 'step_done', step: 1, ts: 't' }, jf);

    const found = findResumableRun(hash, jf);
    assert.ok(found, 'must find resumable run');
    assert.equal(found.run_id, 'r2');
  } finally { fs.rmSync(jf, { force: true }); }
});

test('findResumableRun returns null when all runs are complete', () => {
  const jf = tmp();
  const hash = hashDAG(SAMPLE_DAG);
  try {
    appendEntry({ run_id: 'r1', dag_hash: hash, event: 'run_start', ts: 't' }, jf);
    appendEntry({ run_id: 'r1', dag_hash: hash, event: 'run_done',  ts: 't' }, jf);
    assert.equal(findResumableRun(hash, jf), null);
  } finally { fs.rmSync(jf, { force: true }); }
});

test('findResumableRun ignores runs with different dag_hash', () => {
  const jf = tmp();
  const hash = hashDAG(SAMPLE_DAG);
  const otherHash = 'deadbeef';
  try {
    appendEntry({ run_id: 'r1', dag_hash: otherHash, event: 'run_start', ts: 't' }, jf);
    assert.equal(findResumableRun(hash, jf), null, 'must not resume run for different DAG');
  } finally { fs.rmSync(jf, { force: true }); }
});

test('prune removes entries older than ttlMs', () => {
  const jf = tmp();
  const oldTs  = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(); // 8 days ago
  const newTs  = new Date().toISOString();
  const ttl7d  = 7 * 24 * 60 * 60 * 1000;
  try {
    appendEntry({ run_id: 'old', event: 'run_start', ts: oldTs }, jf);
    appendEntry({ run_id: 'new', event: 'run_start', ts: newTs }, jf);
    prune(ttl7d, jf);
    const entries = loadEntries(jf);
    assert.equal(entries.length, 1, 'old entry must be pruned');
    assert.equal(entries[0].run_id, 'new');
  } finally { fs.rmSync(jf, { force: true }); }
});

test('prune is a no-op when journal is missing', () => {
  assert.doesNotThrow(() => prune(1000, '/nonexistent/dag-journal.jsonl'));
});
