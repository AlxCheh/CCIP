#!/usr/bin/env node
// Flushes routing observations from session-state.json into feedback-loop.md §4
// Triggered automatically by Stop hook in .claude/settings.json

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../..');

// HA-7: guard against routing decisions made with unrecognised intent labels
const VALID_INTENTS = new Set(['ARCH','SCHEMA','BACKEND','AUX','FRONTEND','DEVOPS','QA','MOBILE','SECURITY','DOC']);
function validateIntents(state) {
  const intents = Array.isArray(state.intents) ? state.intents : [];
  const invalid = intents.filter(i => !VALID_INTENTS.has(i));
  if (invalid.length === 0) return;
  process.stderr.write(`[flush-state] unknown intents: ${invalid.join(', ')} — expected one of ${[...VALID_INTENTS].join('|')}\n`);
}

const STATE_FILE = process.env.CCIP_STATE_FILE
  || path.join(ROOT, '.claude/runtime/session-state.json');
const FEEDBACK_FILE = process.env.CCIP_FEEDBACK_FILE
  || path.join(ROOT, 'docs/tasks/feedback-loop.md');
const { updateStateLocked, writeStateAtomic } = require('./state-io'); // HA-2: locked path

function run() {
  if (!fs.existsSync(STATE_FILE)) return;

  let state;
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return;
  }
  validateIntents(state);

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
  // [INV-OBSERVABILITY-ROLLUP] ADR-017 — Stop-time rollup
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

  // Preserve names of agents that missed ## State Update for debt audit trail (D-05)
  const debtAgents = observations
    .filter(o => o && o.missing_state_update === true)
    .map(o => o.agent)
    .filter(Boolean);

  // Очищаем observations + мёржим contract_debt_agents АТОМАРНО под локом (HA-2). Мутируем
  // fresh (перечитанный под локом), перенося только то, что flush реально меняет — чтобы не
  // затереть alerts/agent_outputs, добавленные параллельными хуками между чтением и записью.
  updateStateLocked(STATE_FILE, (fresh) => {
    fresh.observations = []; // clear cleared-observations (D-15: on-disk commit)
    if (debtAgents.length > 0) {
      const existing = Array.isArray(fresh.contract_debt_agents) ? fresh.contract_debt_agents : [];
      fresh.contract_debt_agents = [...new Set([...existing, ...debtAgents])];
    }
  });
  state.observations = []; // in-memory mirror после успешного commit

  process.stdout.write(`[flush-state] ${observations.length} observation(s) → feedback-loop.md (session: ${sessionId})\n`);
}

if (require.main === module) run();

// ---------------------------------------------------------------------------
// SPOF-1: safe read/write with rolling .bak
// ---------------------------------------------------------------------------

const BAK_SUFFIX = '.bak';

function defaultState() {
  return { observations: [], agent_outputs: {}, status: 'idle', session_id: null };
}

function writeStateSafe(state, statePath) {
  writeStateAtomic(state, statePath || STATE_FILE); // единый атомарный путь +.bak (Task 2)
}

function recoveryAlert(state, kind) {
  if (!Array.isArray(state.governance_alerts)) state.governance_alerts = [];
  state.governance_alerts.push({ kind, at: new Date().toISOString(), session: state.session_id || '' });
  return state;
}

function readStateSafe(statePath) {
  const target = statePath || STATE_FILE;
  const bakPath = target + BAK_SUFFIX;

  if (fs.existsSync(target)) {
    try { return JSON.parse(fs.readFileSync(target, 'utf-8')); }
    catch {
      // target exists but is corrupt → recover VISIBLY (R-1: no silent rollback).
      if (fs.existsSync(bakPath)) {
        try {
          const recovered = JSON.parse(fs.readFileSync(bakPath, 'utf-8'));
          process.stderr.write(`[flush-state] ⚠ recovered state from ${BAK_SUFFIX} (main corrupt) — R-1\n`);
          return recoveryAlert(recovered, 'state_recovered_from_backup');
        } catch {}
      }
      process.stderr.write('[flush-state] ✗ state lost — main and backup unreadable, using defaults — R-1\n');
      return recoveryAlert(defaultState(), 'state_lost_defaulted');
    }
  }
  // target missing (fresh) → try backup quietly (not a corruption event).
  if (fs.existsSync(bakPath)) {
    try { return JSON.parse(fs.readFileSync(bakPath, 'utf-8')); } catch {}
  }
  return defaultState();
}

module.exports = { writeStateSafe, readStateSafe, validateIntents };
