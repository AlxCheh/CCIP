#!/usr/bin/env node
/**
 * PostToolUse hook — fires after every Agent tool call.
 * Reads stdin JSON from Claude Code, updates session-state.json:
 *   - agent_outputs[name]: summary, artifacts, handoff_notes
 *   - observations[]: outcome + estimated tokens
 *   - dag[current_step].status → "done", current_step++
 *
 * Extraction strategy (priority order):
 *   1. Structured ## State Update ```json {...} ``` block in agent output
 *   2. Minimal fallback: summary = first non-empty line, artifacts = [], handoff_notes = ""
 *
 * Fails silently on any error — never blocks the parent session.
 */

const fs = require('fs');
const path = require('path');
const { sanitizeHandoff, parseStateUpdate } = require('./sanitize-utils'); // D-04/UU-4
const { updateStateLocked } = require('./state-io'); // HA-2: locked read-modify-write
const { recordStateLockFailOpen } = require('./gate-fail-open'); // HA-2: observable lock fail-open
const { isContractExempt } = require('./contract-exempt'); // INV-STATE-CONTRACT exemption (FPR→0)

const ROOT        = path.resolve(__dirname, '../..');
const STATE       = process.env.CCIP_STATE_FILE || path.join(ROOT, '.claude/runtime/session-state.json');
const AGENTS_DIR  = path.join(ROOT, '.claude/agents');

// ── helpers ──────────────────────────────────────────────────────────────────
// readState/writeState/.bak-recovery теперь в state-io.js (единый locked путь, HA-2/R-1).

/** Read the real set of agents from .claude/agents/. Re-read on every call so a
 *  newly-added agent is picked up without restart. */
function knownAgents() {
  try {
    return new Set(
      fs.readdirSync(AGENTS_DIR)
        .filter(f => f.endsWith('.md'))
        .map(f => f.replace(/\.md$/, ''))
    );
  } catch { return new Set(); }
}

/** Extract agent name from tool_input fields. Strict: returns null for any
 *  name not present as a file in .claude/agents/. */
function resolveAgent(toolInput) {
  if (!toolInput) return null;
  const agents = knownAgents();
  // Explicit subagent_type wins — but must exist.
  if (toolInput.subagent_type) {
    return agents.has(toolInput.subagent_type) ? toolInput.subagent_type : null;
  }
  // Scan description and prompt for whole-word mentions of real agent names.
  // Require EXACTLY ONE match — ambiguous (or zero) mentions resolve to null so a
  // non-deterministic first-hit can't misattribute the call (F-RT-10).
  const haystack = `${toolInput.description || ''} ${toolInput.prompt || ''}`;
  const matches = [...agents].filter(name => new RegExp(`\\b${name}\\b`).test(haystack));
  return matches.length === 1 ? matches[0] : null;
}

/** Flatten Claude tool_response to a plain string */
function responseText(toolResponse) {
  if (!toolResponse) return '';
  if (typeof toolResponse === 'string') return toolResponse;
  const c = toolResponse.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map(x => x.text || x.content || '').join('\n');
  return JSON.stringify(toolResponse);
}

/** Rough token estimate: ~4 chars per token */
function estimateTokens(text) {
  return Math.round((text || '').length / 4);
}

// ── main ─────────────────────────────────────────────────────────────────────

let raw = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  try {
    run(raw);
    process.exit(0);
  } catch (e) {
    process.stderr.write(`[post-agent-hook] FAIL: ${e.message}\n${e.stack || ''}\n`);
    // Exit 0 чтобы не сломать родительскую сессию Claude Code (она ожидает 0 от hook),
    // но факт ошибки виден в stderr и попадает в логи Claude Code.
    process.exit(0);
  }
});

function run(raw) {
  // Parse hook payload
  let payload;
  try { payload = JSON.parse(raw); }
  catch (e) {
    process.stderr.write(`[post-agent-hook] malformed payload: ${e.message}\n`);
    return;
  }

  // Only act on Agent tool calls
  if (payload.tool_name !== 'Agent') return;

  const agent = resolveAgent(payload.tool_input);
  if (!agent) return;

  const text    = responseText(payload.tool_response);
  const tokens  = estimateTokens(text);
  const parsed  = parseStateUpdate(text); // UU-4: brace-balanced, last-match semantics
  // [INV-STATE-CONTRACT] ADR-017 — observability of missing ## State Update.
  // Exempt relay agents (contract-exempt.js): пропуск блока by-design, не нарушение (FPR→0).
  const exempt = isContractExempt(agent);
  const missingBlock = parsed === null && !exempt;
  if (parsed === null && exempt) {
    process.stderr.write(`[post-agent-hook] ${agent}: no State Update (contract-exempt, by design)\n`);
  } else if (missingBlock) {
    process.stderr.write(`[post-agent-hook] ⚠ ${agent}: no valid ## State Update block\n`);
  }

  // Outcome detection: agent-emitted "outcome" wins, else tool error → failed, else success.
  let outcome = 'success';
  const oMatch = text.match(/"outcome"\s*:\s*"(failed|rerouted|partial|success)"/);
  if (oMatch) outcome = oMatch[1];
  if (payload.tool_response?.is_error === true) outcome = 'failed';

  // Read-modify-write под cross-process локом (HA-2). Guard на инициализацию — ВНУТРИ лока
  // (одно чтение, без гонки с параллельным copyFileSync/rename, что давало транзиентный
  // null и терю observation). `return false` → пропуск записи (uninitialised session).
  const result = updateStateLocked(STATE, (state) => {
    if (!state.session_id) {
      process.stderr.write('[post-agent-hook] session_id empty — skip (uninitialised session)\n');
      return false; // skip write
    }

    // ── E-2 reconciliation: this agent completed → drop ONE matching in-flight marker
    // recorded by pre-agent-gate, so the budget count no longer double-counts it.
    if (Array.isArray(state.inflight_spawns)) {
      const i = state.inflight_spawns.findIndex(s => s && s.agent === agent);
      if (i !== -1) state.inflight_spawns.splice(i, 1);
    }

    // ── agent_outputs ──────────────────────────────────────────────────────────
    if (!state.agent_outputs) state.agent_outputs = {};
    state.agent_outputs[agent] = {
      summary:       parsed?.summary       || `${agent} completed (no structured block)`,
      artifacts:     parsed?.artifacts     || [],
      handoff_notes: sanitizeHandoff(parsed?.handoff_notes || ''), // D-04: sanitize in live-session path
    };

    // ── observations ───────────────────────────────────────────────────────────
    if (!state.observations) state.observations = [];

    // Resolve dag_step by THIS agent's step, not by current_step index — robust to
    // parallel/out-of-order completion (F-RT-09). First match wins if an agent
    // appears in multiple steps (acceptable; multi-step same-agent is out of scope).
    const stepObj = Array.isArray(state.dag)
        ? state.dag.find(s => s.agent === agent)
        : null;
    const currentDagStep = stepObj?.step ?? null;

    state.observations.push({
      agent,
      session:        state.session_id || '',
      written_at:     new Date().toISOString(),
      dag_step:       currentDagStep,
      outcome,
      context_tokens: tokens,
      reason:         outcome === 'success' ? '' : (parsed?.handoff_notes?.slice(0, 200) || ''),
      missing_state_update: missingBlock,
    });

    // [INV-CONTRACT-DEBT] RFC R3 — Level 1 escalation: count contract misses, alert at threshold.
    if (missingBlock) {
      const threshold = parseInt(process.env.CCIP_CONTRACT_DEBT_THRESHOLD || '3', 10);
      state.contract_debt = (state.contract_debt || 0) + 1;
      if (state.contract_debt >= threshold) {
        state.governance_alerts = state.governance_alerts || [];
        state.governance_alerts.push({
          kind: 'state_contract_degraded',
          at: new Date().toISOString(),
          debt: state.contract_debt,
          agent,
        });
      }
    }

    // ── DAG step advance ───────────────────────────────────────────────────────
    if (Array.isArray(state.dag) && state.dag.length > 0) {
      if (stepObj) stepObj.status = 'done';
      // current_step tracks how many steps are done (consistent with execute-dag.js).
      state.current_step = state.dag.filter(s => s.status === 'done').length;
      if (state.dag.every(s => s.status === 'done')) {
        state.status = 'done';
      }
    }
  }, { onFailOpen: (why) => recordStateLockFailOpen({ gate: 'post-agent-hook', why }) });

  if (result === null) {
    process.stderr.write('[post-agent-hook] state file missing or unparseable\n');
  }
}
