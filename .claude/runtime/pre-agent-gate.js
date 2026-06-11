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
 *
 * Override (E-1 hardening):
 *   - `tool_input.override` must be a non-empty JUSTIFICATION STRING (boolean no longer works).
 *   - It waives ONLY the agent-budget invariant. The security co-agent requirement is
 *     NEVER waivable — a HIGH-risk security surface without security-reviewer always denies.
 *   - Every applied or rejected override leaves a durable append-only record in
 *     governance-audit.jsonl AND governance_alerts[]. The "(audited)" claim is now real.
 *   - CCIP_OVERRIDE_DISABLED=1 disables override entirely (high-assurance runs).
 */

// Canonical security-surface triggers — MUST mirror CLAUDE.md:84
// (security-reviewer triggers on: JWT / RBAC guards / RLS / multi-tenancy / GpToken / AuditLog).
// Drift here = E-3. The E-3 test block in pre-agent-gate.test.js encodes the full list and
// fails if any declared trigger stops matching. Over-matching is fail-safe (asks for a
// co-agent when maybe unneeded); under-matching is the security hole.
const SECURITY_RE =
  /security|auth|rbac|rls|jwt|gp[_-]?token|multitenan|\btenan|audit[\s_-]?log/i;

/** Pure decision. Returns:
 *   { decision:'allow'|'deny', reason?, wouldDeny?,
 *     overridden?, overrideReason?, bypassed?:[], remaining?:[] }
 *  `overrideReason` is set whenever a justification string was supplied (even if rejected),
 *  so the caller can durably record the attempt. `bypassed` = waived violation messages;
 *  `remaining` = violation messages that still stand. */
function evaluateGate(state, payload, opts = {}) {
  const { enforce = false, maxAgents = 3, overrideDisabled = false,
    inflightTtlMs = parseInt(process.env.CCIP_INFLIGHT_TTL_MS || '600000', 10) } = opts;
  if (!payload || payload.tool_name !== 'Agent') return { decision: 'allow' };
  const input = payload.tool_input || {};

  // Override is a non-empty justification string; truthy/boolean no longer suffices (E-1).
  const overrideReason = (!overrideDisabled
    && typeof input.override === 'string' && input.override.trim())
    ? input.override.trim() : null;

  const target = input.subagent_type || '';
  const violations = [];

  // INVARIANT 1 — [INV-AGENT-BUDGET] (waivable by override)
  // Use agent_outputs (persists through flush) rather than observations (cleared at Stop) — D-10.
  // E-2: also count in-flight spawns (approved by this gate, not yet completed) so a parallel
  // burst in one turn cannot evade the limit. TTL-filter ages out crashed-agent leaks.
  const cutoff = Date.now() - inflightTtlMs;
  const inflight = (state.inflight_spawns || [])
    .filter(s => s && s.at && Date.parse(s.at) >= cutoff).length;
  const active = Object.keys(state.agent_outputs || {}).length
    + (state.dag || []).filter(s => s && s.status === 'running').length
    + inflight;
  if (active >= maxAgents)
    violations.push({ type: 'budget', waivable: true,
      msg: `agent budget ${maxAgents} reached (${active} active) — CLAUDE.md §Execution` });

  // INVARIANT 2 — [INV-SECURITY-COAGENT] (NEVER waivable)
  const scopeText = (state.dag || []).map(s => (s && s.scope) || '').join(' ');
  const securitySurface = (state.intents || []).includes('SECURITY')
    || SECURITY_RE.test(target)
    || SECURITY_RE.test(scopeText);
  const roster = [
    ...((state.dag || []).map(s => s && s.agent)),
    ...((state.observations || []).map(o => o && o.agent)),
  ];
  // Opt1: surface drives the requirement at ANY risk level — risk labels are LLM-assigned
  // and gameable; the textual surface match is the objective signal. HIGH-without-surface
  // does NOT require a security co-agent. See cert 2026-06-10 §VI (A2 hole).
  if (securitySurface && !roster.includes('security-reviewer'))
    violations.push({ type: 'security', waivable: false,
      msg: 'security surface (JWT/RBAC/RLS/tenancy/GpToken/AuditLog) requires security-reviewer co-agent, any risk — CLAUDE.md Risk Rules' });

  if (violations.length === 0) return { decision: 'allow' };

  // Override clears only waivable violations, and only with a justification string.
  const bypassed = overrideReason ? violations.filter(v => v.waivable) : [];
  const remaining = violations.filter(v => !bypassed.includes(v));

  const result = {};
  if (overrideReason) {
    result.overrideReason = overrideReason;
    if (bypassed.length > 0) {
      result.overridden = true;
      result.bypassed = bypassed.map(v => v.msg);
    }
    if (remaining.length > 0) result.remaining = remaining.map(v => v.msg);
  }

  if (remaining.length === 0) {
    result.decision = 'allow';
    return result;
  }

  const reason = `[pre-agent-gate] ${remaining.map(v => v.msg).join('; ')}`;
  result.reason = reason;
  result.decision = enforce ? 'deny' : 'allow';
  if (!enforce) result.wouldDeny = true;
  return result;
}

module.exports = { evaluateGate };

// ── main (PreToolUse[Agent] entrypoint) ─────────────────────────────────────────
if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const ROOT = path.resolve(__dirname, '../..');
  const STATE = process.env.CCIP_STATE_FILE || path.join(ROOT, '.claude/runtime/session-state.json');
  const GOV_AUDIT = process.env.CCIP_GOV_AUDIT_FILE
    || path.join(ROOT, '.claude/runtime/governance-audit.jsonl');
  const ENFORCE = process.env.CCIP_GATE_ENFORCE === '1';
  const OVERRIDE_DISABLED = process.env.CCIP_OVERRIDE_DISABLED === '1';
  const MAX = parseInt(process.env.CCIP_MAX_AGENTS || '3', 10);
  const MAX_BYTES = 5 * 1024 * 1024;

  const readState = () => {
    try { return JSON.parse(fs.readFileSync(STATE, 'utf-8')); } catch { return {}; }
  };
  const deny = (reason) => process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
  }));

  /** Append one governance-audit record (durable, append-only, rotated like events.jsonl). */
  const auditAppend = (record) => {
    try {
      try { if (fs.statSync(GOV_AUDIT).size > MAX_BYTES) fs.renameSync(GOV_AUDIT, GOV_AUDIT + '.1'); }
      catch {}
      fs.appendFileSync(GOV_AUDIT, JSON.stringify(record) + '\n', 'utf-8');
    } catch (e) {
      process.stderr.write(`[pre-agent-gate] audit-append failed: ${e.message}\n`);
    }
  };

  /** Best-effort mirror into session-state.governance_alerts[] (atomic, fail-open, HA-3 re-read). */
  const alertAppend = (record) => {
    try {
      const fresh = readState();
      const merged = [...(fresh.governance_alerts || []), record];
      const tmp = STATE + '.gate.tmp.' + process.pid;
      const fd = fs.openSync(tmp, 'w');
      try {
        fs.writeSync(fd, JSON.stringify({ ...fresh, governance_alerts: merged }, null, 2));
        fs.fsyncSync(fd);
      } finally { fs.closeSync(fd); }
      try { fs.renameSync(tmp, STATE); }
      catch (e) { try { fs.unlinkSync(tmp); } catch {} throw e; }
    } catch (e) {
      process.stderr.write(`[pre-agent-gate] alert-append failed: ${e.message}\n`);
    }
  };

  /** Append an in-flight spawn marker (atomic, fail-open, HA-3 re-read). E-2. */
  const recordInflight = (_state, agent) => {
    try {
      const fresh = readState();
      const list = Array.isArray(fresh.inflight_spawns) ? fresh.inflight_spawns : [];
      list.push({ agent: String(agent), at: new Date().toISOString() });
      const tmp = STATE + '.gate.tmp.' + process.pid;
      const fd = fs.openSync(tmp, 'w');
      try {
        fs.writeSync(fd, JSON.stringify({ ...fresh, inflight_spawns: list }, null, 2));
        fs.fsyncSync(fd);
      } finally { fs.closeSync(fd); }
      try { fs.renameSync(tmp, STATE); }
      catch (e) { try { fs.unlinkSync(tmp); } catch {} throw e; }
    } catch (e) {
      process.stderr.write(`[pre-agent-gate] inflight-record failed: ${e.message}\n`);
    }
  };

  const { recordGateFailOpen } = require('./gate-fail-open.js');

  let raw = '';
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', c => { raw += c; });
  process.stdin.on('end', () => {
    let phase = 'parse';
    try {
      const payload = JSON.parse(raw);
      phase = 'evaluate';
      const state = readState();
      const r = evaluateGate(state, payload, { enforce: ENFORCE, maxAgents: MAX, overrideDisabled: OVERRIDE_DISABLED });

      // Durable governance audit for any override attempt (applied or rejected).
      if (r.overridden) {
        const rec = { kind: 'override_applied', at: new Date().toISOString(),
          session: state.session_id || '', target: (payload.tool_input || {}).subagent_type || '',
          reason: r.overrideReason, bypassed: r.bypassed || [] };
        process.stderr.write(`[pre-agent-gate] OVERRIDE APPLIED (durably audited): ${JSON.stringify(rec)}\n`);
        auditAppend(rec); alertAppend(rec);
      } else if (r.overrideReason && r.remaining) {
        const rec = { kind: 'override_rejected', at: new Date().toISOString(),
          session: state.session_id || '', target: (payload.tool_input || {}).subagent_type || '',
          reason: r.overrideReason, remaining: r.remaining };
        process.stderr.write(`[pre-agent-gate] OVERRIDE REJECTED (non-waivable violation): ${JSON.stringify(rec)}\n`);
        auditAppend(rec); alertAppend(rec);
      }

      if (r.wouldDeny) process.stderr.write(`[pre-agent-gate] SHADOW would-deny: ${r.reason}\n`);
      if (r.decision === 'deny') {
        process.stderr.write(`[pre-agent-gate] DENY: ${r.reason}\n`);
        deny(r.reason);
      } else if (payload.tool_name === 'Agent') {
        // E-2: record this approved spawn as in-flight so a parallel burst in the same turn
        // counts toward the budget. Reconciled (removed) by post-agent-hook on completion;
        // TTL-filtered at count time; cleared at SessionStart.
        recordInflight(state, (payload.tool_input || {}).subagent_type || '');
      }
    } catch (e) {
      process.stderr.write(`[pre-agent-gate] ${e.message}\n`); // fail-open: allow
      // E-6: make the fail-open observable (durable audit + reactor-surfaced alert).
      recordGateFailOpen({ gate: 'pre-agent-gate', phase, message: e.message });
    }
    process.exit(0);
  });
}
