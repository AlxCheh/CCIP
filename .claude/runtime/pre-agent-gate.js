#!/usr/bin/env node
'use strict';
/**
 * PreToolUse[Agent] gate (RFC R4) — enforces routing invariants BEFORE an Agent spawn.
 *   INVARIANT 1  agent budget (CLAUDE.md §Execution: max 2–3 agents total)
 *   INVARIANT 2  HIGH-risk security surface requires security-reviewer co-agent (Risk Rules)
 *
 * Default SHADOW: logs would-deny but allows. Real deny only under CCIP_GATE_ENFORCE=1.
 * Fail-open: any error → allow (never block a legitimate spawn). Deny protocol copied
 * from optimizer-gate.js.
 */

const SECURITY_RE = /security|auth|rbac|rls/i;

/** Pure decision: returns { decision:'allow'|'deny', reason?, wouldDeny?, overridden? }. */
function evaluateGate(state, payload, opts = {}) {
  const { enforce = false, maxAgents = 3 } = opts;
  if (!payload || payload.tool_name !== 'Agent') return { decision: 'allow' };
  const input = payload.tool_input || {};
  if (input.override) return { decision: 'allow', overridden: true };

  const target = input.subagent_type || '';
  const violations = [];

  // INVARIANT 1 — [INV-AGENT-BUDGET]
  // Use agent_outputs (persists through flush) rather than observations (cleared at Stop) — D-10
  const active = Object.keys(state.agent_outputs || {}).length
    + (state.dag || []).filter(s => s && s.status === 'running').length;
  if (active >= maxAgents)
    violations.push(`agent budget ${maxAgents} reached (${active} active) — CLAUDE.md §Execution`);

  // INVARIANT 2 — [INV-SECURITY-COAGENT]
  const scopeText = (state.dag || []).map(s => (s && s.scope) || '').join(' ');
  const securitySurface = (state.intents || []).includes('SECURITY')
    || SECURITY_RE.test(target)
    || SECURITY_RE.test(scopeText);
  const roster = [
    ...((state.dag || []).map(s => s && s.agent)),
    ...((state.observations || []).map(o => o && o.agent)),
  ];
  if (state.risk === 'HIGH' && securitySurface && !roster.includes('security-reviewer'))
    violations.push('HIGH-risk security surface requires security-reviewer co-agent — CLAUDE.md Risk Rules');

  if (violations.length === 0) return { decision: 'allow' };
  const reason = `[pre-agent-gate] ${violations.join('; ')}`;
  return enforce ? { decision: 'deny', reason } : { decision: 'allow', wouldDeny: true, reason };
}

module.exports = { evaluateGate };

// ── main (PreToolUse[Agent] entrypoint) ─────────────────────────────────────────
if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const ROOT = path.resolve(__dirname, '../..');
  const STATE = process.env.CCIP_STATE_FILE || path.join(ROOT, '.claude/runtime/session-state.json');
  const ENFORCE = process.env.CCIP_GATE_ENFORCE === '1';
  const MAX = parseInt(process.env.CCIP_MAX_AGENTS || '3', 10);

  const readState = () => {
    try { return JSON.parse(fs.readFileSync(STATE, 'utf-8')); } catch { return {}; }
  };
  const deny = (reason) => process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
  }));

  let raw = '';
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', c => { raw += c; });
  process.stdin.on('end', () => {
    try {
      const payload = JSON.parse(raw);
      const r = evaluateGate(readState(), payload, { enforce: ENFORCE, maxAgents: MAX });
      if (r.overridden) process.stderr.write('[pre-agent-gate] budget override used (audited)\n');
      if (r.wouldDeny) process.stderr.write(`[pre-agent-gate] SHADOW would-deny: ${r.reason}\n`);
      if (r.decision === 'deny') {
        process.stderr.write(`[pre-agent-gate] DENY: ${r.reason}\n`);
        deny(r.reason);
      }
    } catch (e) {
      process.stderr.write(`[pre-agent-gate] ${e.message}\n`); // fail-open: allow
    }
    process.exit(0);
  });
}
