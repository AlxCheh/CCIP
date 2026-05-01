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

const ROOT    = path.resolve(__dirname, '../../..');
const STATE   = path.join(ROOT, 'CCIP/.claude/runtime/session-state.json');

// ── helpers ──────────────────────────────────────────────────────────────────

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf-8')); }
  catch { return null; }
}

function writeState(state) {
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n', 'utf-8');
}

/** Extract agent name from tool_input fields */
function resolveAgent(toolInput) {
  if (!toolInput) return null;
  // Explicit subagent_type wins
  if (toolInput.subagent_type) return toolInput.subagent_type;
  // Scan description and prompt for known agent patterns
  const haystack = `${toolInput.description || ''} ${toolInput.prompt || ''}`;
  const m = haystack.match(/\b(ccip-[\w-]+|general-purpose|security-reviewer|doc-optimizer|consistency-checker)\b/);
  return m ? m[1] : null;
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

/**
 * Look for the agent-emitted structured block:
 *
 *   ## State Update
 *   ```json
 *   { "summary": "...", "artifacts": [...], "handoff_notes": "..." }
 *   ```
 */
function extractStructured(text) {
  const re = /##\s*State\s*Update\s*```(?:json)?\s*(\{[\s\S]*?\})\s*```/i;
  const m = text.match(re);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[1]);
    return {
      summary:        (typeof obj.summary       === 'string' ? obj.summary.trim()       : '') || '',
      artifacts:      (Array.isArray(obj.artifacts)           ? obj.artifacts            : []),
      handoff_notes:  (typeof obj.handoff_notes === 'string' ? obj.handoff_notes.trim() : '') || '',
    };
  } catch { return null; }
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
  } catch {
    // silent — never crash the parent session
  }
  process.exit(0);
});

function run(raw) {
  // Parse hook payload
  let payload;
  try { payload = JSON.parse(raw); }
  catch { return; }

  // Only act on Agent tool calls
  if (payload.tool_name !== 'Agent') return;

  // Load state; skip if not initialised
  const state = readState();
  if (!state || !state.session_id) return;

  const agent = resolveAgent(payload.tool_input);
  if (!agent) return;

  const text    = responseText(payload.tool_response);
  const tokens  = estimateTokens(text);
  const parsed  = extractStructured(text);

  // ── agent_outputs ──────────────────────────────────────────────────────────
  if (!state.agent_outputs) state.agent_outputs = {};
  state.agent_outputs[agent] = {
    summary:       parsed?.summary       || `${agent} completed (no structured block)`,
    artifacts:     parsed?.artifacts     || [],
    handoff_notes: parsed?.handoff_notes || '',
  };

  // ── observations ───────────────────────────────────────────────────────────
  if (!state.observations) state.observations = [];
  state.observations.push({
    agent,
    outcome:        'success',   // hook has no way to detect failure — agent sets this if rerouted
    context_tokens: tokens,
    reason:         '',
  });

  // ── DAG step advance ───────────────────────────────────────────────────────
  if (Array.isArray(state.dag) && state.dag.length > 0) {
    const idx = state.current_step ?? 0;
    if (state.dag[idx]) state.dag[idx].status = 'done';
    state.current_step = idx + 1;

    // Mark session done when all steps completed
    if (state.current_step >= state.dag.length) {
      state.status = 'done';
    }
  }

  writeState(state);
}
