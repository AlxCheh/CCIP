#!/usr/bin/env node
// Flushes routing observations from session-state.json into feedback-loop.md §4
// Triggered automatically by Stop hook in .claude/settings.json

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const STATE_FILE = path.join(ROOT, 'CCIP/.claude/runtime/session-state.json');
const FEEDBACK_FILE = path.join(ROOT, 'CCIP/docs/tasks/feedback-loop.md');

function run() {
  if (!fs.existsSync(STATE_FILE)) return;

  let state;
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return;
  }

  const observations = state.observations || [];
  if (observations.length === 0) return;

  const sessionId = state.session_id || 'unknown';
  const task = state.task || '';

  const lines = observations.map(obs => JSON.stringify({
    agent: obs.agent || '',
    session: sessionId.slice(0, 10),
    outcome: obs.outcome || '',
    context_tokens: obs.context_tokens || 0,
    reason: obs.reason || ''
  }));

  const block = [
    '',
    `<!-- flush: ${sessionId} | task: ${task.slice(0, 60)} -->`,
    ...lines,
    ''
  ].join('\n');

  // Ensure §4 section exists in feedback-loop.md
  let feedback = fs.readFileSync(FEEDBACK_FILE, 'utf-8');
  const SECTION_HEADER = '## 4. Routing Observations';

  if (!feedback.includes(SECTION_HEADER)) {
    feedback += `\n\n---\n\n${SECTION_HEADER}\n\nJSON-записи §7.3 (автофлаш при Stop):\n`;
    fs.writeFileSync(FEEDBACK_FILE, feedback, 'utf-8');
  }

  fs.appendFileSync(FEEDBACK_FILE, block, 'utf-8');

  // Clear observations from state (keep other fields intact)
  state.observations = [];
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');

  process.stdout.write(`[flush-state] ${observations.length} observation(s) → feedback-loop.md (session: ${sessionId})\n`);
}

run();
