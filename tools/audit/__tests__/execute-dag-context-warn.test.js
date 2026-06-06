'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const { buildPrompt, sanitizeHandoff } = require(path.join(root, '.claude/runtime/execute-dag.js'));

// The context-overflow guard (audit C-18) warns when the assembled previous
// agent_outputs exceed CONTEXT_WARN_BYTES (50KB). The warning depends only on
// agent_outputs size, so we size handoff_notes precisely around the threshold.
function makeState(notesSizeBytes) {
  return {
    task: 'test task',
    session_id: '2026-01-01-1200',
    intents: ['BACKEND'],
    risk: 'LOW',
    confidence: 'HIGH',
    agent_outputs: {
      'ccip-architect': {
        summary: 'Designed the thing.',
        handoff_notes: 'x'.repeat(notesSizeBytes),
      },
    },
  };
}

function captureWarn(fn) {
  const captured = [];
  const orig = console.warn;
  console.warn = (...args) => captured.push(args.join(' '));
  try { fn(); } finally { console.warn = orig; }
  return captured;
}

const STEP = { step: 2, agent: 'ccip-backend-core', scope: 'implement X' };

test('buildPrompt emits context-overflow warning when agent_outputs exceeds 50KB', () => {
  const warns = captureWarn(() => buildPrompt(makeState(51_000), STEP));
  assert.ok(warns.some(w => w.includes('agent_outputs context')),
    'console.warn must fire with "agent_outputs context" for large context');
  assert.ok(warns.some(w => w.includes('audit C-18')),
    'warning must reference audit C-18');
});

test('buildPrompt does NOT warn when agent_outputs is small', () => {
  const warns = captureWarn(() => buildPrompt(makeState(100), STEP));
  assert.ok(!warns.some(w => w.includes('agent_outputs context')),
    'no overflow warning must be emitted for small context');
});

test('buildPrompt includes prior agent summary and scope in the prompt', () => {
  const prompt = buildPrompt(makeState(100), STEP);
  assert.match(prompt, /Designed the thing\./, 'prior agent summary must appear');
  assert.match(prompt, /implement X/, 'step scope must appear');
});

test('sanitizeHandoff still exported after context-warn changes', () => {
  assert.strictEqual(typeof sanitizeHandoff, 'function');
});
