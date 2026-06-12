const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Require after gating run() with require.main === module
const { writeStateSafe, readStateSafe } = require('../../../.claude/runtime/flush-state');

function makeTmpState() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flush-state-test-'));
  const statePath = path.join(dir, 'session-state.json');
  return { dir, statePath, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('writeStateSafe creates .bak of previous state before writing', () => {
  const { statePath, cleanup } = makeTmpState();
  try {
    const oldState = { session_id: 'old', observations: ['x'] };
    fs.writeFileSync(statePath, JSON.stringify(oldState), 'utf-8');

    const newState = { session_id: 'new', observations: [] };
    writeStateSafe(newState, statePath);

    assert.ok(fs.existsSync(statePath + '.bak'), '.bak should exist');
    const bak = JSON.parse(fs.readFileSync(statePath + '.bak', 'utf-8'));
    assert.equal(bak.session_id, 'old');

    const written = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    assert.equal(written.session_id, 'new');
  } finally { cleanup(); }
});

test('readStateSafe returns .bak content when main file is corrupt', () => {
  const { statePath, cleanup } = makeTmpState();
  try {
    const good = { session_id: 'recovered', observations: [] };
    fs.writeFileSync(statePath + '.bak', JSON.stringify(good), 'utf-8');
    fs.writeFileSync(statePath, 'CORRUPT{{{', 'utf-8');

    const result = readStateSafe(statePath);
    assert.equal(result.session_id, 'recovered');
  } finally { cleanup(); }
});

test('readStateSafe returns defaultState when both files corrupt', () => {
  const { statePath, cleanup } = makeTmpState();
  try {
    fs.writeFileSync(statePath, 'CORRUPT', 'utf-8');
    fs.writeFileSync(statePath + '.bak', 'ALSO_CORRUPT', 'utf-8');

    const result = readStateSafe(statePath);
    assert.ok(result, 'should return defaultState, not throw');
    assert.deepEqual(result.observations, []);
  } finally { cleanup(); }
});

test('readStateSafe returns defaultState when neither file exists', () => {
  const { statePath, cleanup } = makeTmpState();
  try {
    const result = readStateSafe(statePath);
    assert.deepEqual(result.observations, []);
  } finally { cleanup(); }
});

test('writeStateSafe creates no .bak when target does not exist yet', () => {
  const { statePath, cleanup } = makeTmpState();
  try {
    writeStateSafe({ session_id: 'first', observations: [] }, statePath);
    assert.ok(!fs.existsSync(statePath + '.bak'), '.bak should not exist for first write');
    assert.ok(fs.existsSync(statePath));
  } finally { cleanup(); }
});

test('R-1: readStateSafe recovers from .bak and adds a state_recovered_from_backup alert', () => {
  const { statePath, cleanup } = makeTmpState();
  try {
    fs.writeFileSync(statePath + '.bak', JSON.stringify({ session_id: '2026-01-01-1200', observations: [] }), 'utf-8');
    fs.writeFileSync(statePath, 'CORRUPT{{{', 'utf-8');
    const r = readStateSafe(statePath);
    assert.equal(r.session_id, '2026-01-01-1200');
    const kinds = (r.governance_alerts || []).map(a => a.kind);
    assert.ok(kinds.includes('state_recovered_from_backup'), 'recovery must be visible (R-1)');
  } finally { cleanup(); }
});

test('R-1: readStateSafe with both corrupt → defaults + state_lost_defaulted alert', () => {
  const { statePath, cleanup } = makeTmpState();
  try {
    fs.writeFileSync(statePath + '.bak', 'ALSO CORRUPT', 'utf-8');
    fs.writeFileSync(statePath, 'CORRUPT{{{', 'utf-8');
    const r = readStateSafe(statePath);
    const kinds = (r.governance_alerts || []).map(a => a.kind);
    assert.ok(kinds.includes('state_lost_defaulted'), 'total loss must be visible (R-1)');
  } finally { cleanup(); }
});

test('R-1: clean readStateSafe (valid main) adds no recovery alert', () => {
  const { statePath, cleanup } = makeTmpState();
  try {
    fs.writeFileSync(statePath, JSON.stringify({ session_id: '2026-01-01-1200', governance_alerts: [] }), 'utf-8');
    const r = readStateSafe(statePath);
    assert.deepEqual(r.governance_alerts, [], 'no recovery alert on a clean read');
  } finally { cleanup(); }
});
