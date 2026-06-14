'use strict';
const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const os     = require('node:os');
const path   = require('node:path');
const cp     = require('node:child_process');
const { gitRoot } = require('../_lib/git-root');

const root  = gitRoot();
const DAG   = path.join(root, '.claude/runtime/execute-dag.js');
const STATE = path.join(root, '.claude/runtime/session-state.json');
const { hashDAG, newRunId, appendEntry } = require(path.join(root, '.claude/runtime/dag-journal.js'));

function backupState() {
  const orig = fs.readFileSync(STATE, 'utf-8');
  return () => fs.writeFileSync(STATE, orig, 'utf-8');
}

const SAMPLE_DAG_STEPS = [
  { step: 1, agent: 'ccip-architect', status: 'pending', depends_on: [], scope: 'test scope 1' },
  { step: 2, agent: 'ccip-dba',       status: 'pending', depends_on: [1], scope: 'test scope 2' },
];

test('journal --resume: step_done in journal is skipped even after session restart', () => {
  const restore = backupState();
  const journalFile = path.join(os.tmpdir(), `ccip-dj-smoke-${Date.now()}.jsonl`);
  const dagHash = hashDAG(SAMPLE_DAG_STEPS);
  const runId   = newRunId();

  try {
    // Simulate: previous session ran step 1, got interrupted before step 2
    appendEntry({ run_id: runId, dag_hash: dagHash, event: 'run_start',  ts: new Date().toISOString() }, journalFile);
    appendEntry({ run_id: runId, dag_hash: dagHash, event: 'step_done', step: 1, agent: 'ccip-architect', ts: new Date().toISOString() }, journalFile);

    // "New session" starts: session-state has all steps pending (state was reset)
    const freshState = {
      session_id: '2026-06-14-test', task: 'journal-smoke-test', intents: [], risk: 'LOW',
      confidence: 'HIGH', routing: 'planner', status: 'executing',
      dag: SAMPLE_DAG_STEPS.map(s => ({ ...s })),
      current_step: 0, agent_outputs: {}, started_at: new Date().toISOString(), observations: [],
    };
    fs.writeFileSync(STATE, JSON.stringify(freshState, null, 2), 'utf-8');

    const res = cp.spawnSync(
      process.execPath,
      [DAG, '--resume', '--dry-run', '--auto'],
      {
        encoding: 'utf-8', cwd: root,
        env: { ...process.env, CCIP_DAG_JOURNAL_FILE: journalFile },
      }
    );

    // dry-run with --auto should show plan and skip step 1 (journal says done)
    assert.ok(
      res.stdout.includes('ccip-architect') === false || res.stdout.includes('⏭'),
      'journal-restored step 1 must be skipped (⏭) or not appear in pending plan'
    );
    assert.ok(
      res.stdout.includes('ccip-dba'),
      'step 2 must still appear as pending'
    );
    // Must NOT crash
    assert.notEqual(res.status, 1, `exit 1 unexpected. stderr: ${res.stderr.slice(0, 300)}`);
  } finally {
    restore();
    fs.rmSync(journalFile, { force: true });
  }
});

test('journal: step_done entries are written during dry-run execution', () => {
  const restore = backupState();
  const journalFile = path.join(os.tmpdir(), `ccip-dj-write-${Date.now()}.jsonl`);

  try {
    const freshState = {
      session_id: '2026-06-14-write', task: 'journal-write-test', intents: [], risk: 'LOW',
      confidence: 'HIGH', routing: 'planner', status: 'executing',
      dag: [{ step: 1, agent: 'ccip-architect', status: 'pending', depends_on: [], scope: 'test' }],
      current_step: 0, agent_outputs: {}, started_at: new Date().toISOString(), observations: [],
    };
    fs.writeFileSync(STATE, JSON.stringify(freshState, null, 2), 'utf-8');

    cp.spawnSync(
      process.execPath,
      [DAG, '--dry-run', '--auto'],
      { encoding: 'utf-8', cwd: root, env: { ...process.env, CCIP_DAG_JOURNAL_FILE: journalFile } }
    );

    const { loadEntries } = require(path.join(root, '.claude/runtime/dag-journal.js'));
    const entries = loadEntries(journalFile);
    assert.ok(entries.some(e => e.event === 'run_start'), 'journal must have run_start entry');
    // dry-run marks steps done without spawning claude
    assert.ok(entries.some(e => e.event === 'step_done' && e.step === 1), 'journal must record step_done');
  } finally {
    restore();
    fs.rmSync(journalFile, { force: true });
  }
});
