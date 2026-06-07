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
  const active = (state.observations || []).filter(o => o && o.agent).length
    + (state.dag || []).filter(s => s && s.status === 'running').length;
  if (active >= maxAgents)
    violations.push(`agent budget ${maxAgents} reached (${active} active) — CLAUDE.md §Execution`);

  // INVARIANT 2 — [INV-SECURITY-COAGENT]
  const securitySurface = (state.intents || []).includes('SECURITY') || SECURITY_RE.test(target);
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
