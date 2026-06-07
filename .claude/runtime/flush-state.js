#!/usr/bin/env node
// Flushes routing observations from session-state.json into feedback-loop.md §4
// Triggered automatically by Stop hook in .claude/settings.json

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../..');
const STATE_FILE = path.join(ROOT, '.claude/runtime/session-state.json');
const FEEDBACK_FILE = process.env.CCIP_FEEDBACK_FILE
  || path.join(ROOT, 'docs/tasks/feedback-loop.md');

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

  // Validate observation.agent against (1) DAG agents if DAG non-empty (warn-only — co-agents
  // like security-reviewer legitimately write outside DAG); (2) real .claude/agents/<name>.md
  // files always (hard-skip — phantom agents must never appear in feedback-loop).
  const dagAgents = new Set((state.dag || []).map(s => s.agent));
  let realAgents = new Set();
  try {
    realAgents = new Set(
      fs.readdirSync(path.join(ROOT, '.claude/agents'))
        .filter(f => f.endsWith('.md'))
        .map(f => f.replace(/\.md$/, ''))
    );
  } catch {}

  // Keep only observations that survive validation, so the rollup denominator and
  // the persisted JSON records agree on the same set (no phantom/unnamed skew — F-03).
  const kept = observations.filter(obs => {
    if (!obs.agent) {
      process.stderr.write('[flush-state] ⚠ observation without agent — skipped\n');
      return false;
    }
    if (realAgents.size > 0 && !realAgents.has(obs.agent)) {
      process.stderr.write(`[flush-state] ✗ phantom agent "${obs.agent}" — skipped (not in .claude/agents/)\n`);
      return false;
    }
    if (dagAgents.size > 0 && !dagAgents.has(obs.agent)) {
      process.stderr.write(`[flush-state] ⚠ observation from non-DAG agent "${obs.agent}" — kept (co-agent semantics) but flagged\n`);
    }
    return true;
  });

  const lines = kept.map(obs => JSON.stringify({
    agent:          obs.agent,
    session:        obs.session        || sessionId.slice(0, 10),
    written_at:     obs.written_at     || new Date().toISOString(),
    dag_step:       obs.dag_step       ?? null,
    outcome:        obs.outcome        || '',
    context_tokens: obs.context_tokens || 0,
    reason:         obs.reason         || '',
    // ADR-017: persist the contract flag so feedback-loop.md stays machine-observable.
    // Default false for legacy records that predate the field (backward-compat).
    missing_state_update: obs.missing_state_update === true,
  }));

  const batchHash = crypto.createHash('sha1')
    .update(lines.join('\n')).digest('hex').slice(0, 8);
  const idemKey = `flush:${sessionId}:${batchHash}`;

  // ADR-017: surface agents that skipped the ## State Update block. Counted from the
  // kept set so N/M matches the records actually written.
  const missing = kept.filter(o => o.missing_state_update === true);
  const rollup = missing.length > 0
    ? [`> ⚠ ${sessionId.slice(0, 10)}: ${missing.length}/${kept.length} agents без ## State Update (${missing.map(o => o.agent).join(', ')})`]
    : [];
  if (missing.length > 0) {
    process.stderr.write(`[flush-state] ⚠ ${missing.length}/${kept.length} observations missing ## State Update\n`);
  }

  const block = [
    '',
    `<!-- ${idemKey} | task: ${task.slice(0, 60)} -->`,
    ...lines,
    ...rollup,
    ''
  ].join('\n');

  // Ensure §4 section exists in feedback-loop.md
  const SECTION_HEADER = '## 4. Routing Observations';

  let feedback = '';
  if (fs.existsSync(FEEDBACK_FILE)) {
    try { feedback = fs.readFileSync(FEEDBACK_FILE, 'utf-8'); }
    catch (e) {
      process.stderr.write(`[flush-state] ⚠ cannot read feedback-loop.md: ${e.message} — creating fresh\n`);
    }
  }

  if (!feedback.includes(SECTION_HEADER)) {
    feedback += `\n\n---\n\n${SECTION_HEADER}\n\nJSON-записи routing observations (автофлаш при Stop):\n`;
    try {
      fs.mkdirSync(path.dirname(FEEDBACK_FILE), { recursive: true });
      fs.writeFileSync(FEEDBACK_FILE, feedback, 'utf-8');
    } catch (e) {
      process.stderr.write(`[flush-state] ⚠ cannot write feedback-loop.md: ${e.message}\n`);
      return;
    }
  }

  // Idempotent append: skip if this exact batch was already flushed (crash-window
  // re-run leaves observations uncleared in state — F-RT-03).
  const already = fs.existsSync(FEEDBACK_FILE)
    && fs.readFileSync(FEEDBACK_FILE, 'utf-8').includes(idemKey);
  if (!already) {
    fs.appendFileSync(FEEDBACK_FILE, block, 'utf-8');
  } else {
    process.stderr.write(`[flush-state] ⏭ batch ${idemKey} already flushed — skip (idempotent)\n`);
  }

  // Clear observations from state; use atomic tmp→fsync→rename.
  state.observations = [];
  const tmp = STATE_FILE + '.tmp.' + process.pid;
  const data = JSON.stringify(state, null, 2) + '\n';
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.renameSync(tmp, STATE_FILE);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch {}
    throw e;
  }

  process.stdout.write(`[flush-state] ${observations.length} observation(s) → feedback-loop.md (session: ${sessionId})\n`);
}

run();
