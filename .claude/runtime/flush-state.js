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

  // Validate that each observation was written by an agent actually in the DAG.
  const dagAgents = new Set((state.dag || []).map(s => s.agent));
  const lines = observations.map(obs => {
    if (dagAgents.size > 0 && obs.agent && !dagAgents.has(obs.agent)) {
      process.stderr.write(`[flush-state] ⚠ observation from unknown agent "${obs.agent}" — skipped\n`);
      return null;
    }
    return JSON.stringify({
      agent:          obs.agent          || '',
      session:        obs.session        || sessionId.slice(0, 10),
      written_at:     obs.written_at     || new Date().toISOString(),
      dag_step:       obs.dag_step       ?? null,
      outcome:        obs.outcome        || '',
      context_tokens: obs.context_tokens || 0,
      reason:         obs.reason         || '',
    });
  }).filter(Boolean);

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

  // Clear observations from state; use atomic tmp→rename (same as execute-dag.js).
  state.observations = [];
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, STATE_FILE);

  process.stdout.write(`[flush-state] ${observations.length} observation(s) → feedback-loop.md (session: ${sessionId})\n`);
}

run();
