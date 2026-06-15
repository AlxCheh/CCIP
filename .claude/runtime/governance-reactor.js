#!/usr/bin/env node
'use strict';
/**
 * UserPromptSubmit hook (G-1 — close the detect→react loop).
 *
 * failure-detectors.js and the gates write governance_alerts[] at Stop / PreToolUse,
 * but nothing consumed them for a runtime reaction — they were write-only telemetry.
 * This hook surfaces UNACKNOWLEDGED alerts into the orchestrator's context on the next
 * turn via additionalSystemPrompt, then marks them `surfaced:true` (anti-spam).
 *
 * Reaction is ADVISORY (UserPromptSubmit cannot deny). Hard blocks for the security
 * class already live at PreToolUse (pre-agent-gate INV-SECURITY-COAGENT, INV-AGENT-BUDGET).
 * Most alert kinds are quality degradation — the right reaction is to raise the signal
 * into the decision loop, mirroring contract-debt-injector.js for contract_debt.
 *
 * Fail-open: any error → exit 0 + empty stdout (never blocks a prompt).
 *
 * [INV-GOVERNANCE-REACTOR] G-1 — surface governance_alerts into the next turn.
 */

// One short directive per alert kind. Unknown kinds get a generic line (forward-compatible).
const DIRECTIVES = {
  silent_state_degradation: 'agents are omitting ## State Update (low SSC) — ensure every agent ends with the structured block (CLAUDE.md §15)',
  contract_collapse:        'contract debt is critical — enforce the ## State Update block on the next agent response',
  state_contract_degraded:  'repeated ## State Update misses — require the block before continuing',
  telemetry_blackout:       'tool telemetry is missing despite agent activity — observability gap; verify the PostToolUse hooks are firing',
  handoff_decay:            'handoff_notes are frequently empty — agents MUST pass handoff_notes so the next agent has context',
  fallback_degradation:     'a specialist degraded to general-purpose without fallback context — re-check routing and inject domain anchors',
  override_applied:         'a budget override was applied (durably audited) — confirm it was intended; prefer staying within the agent budget',
  override_rejected:        'an override attempt on a security invariant was rejected — a security-reviewer co-agent is required, do not bypass it',
  invalid_intent:           'an unknown intent was recorded — use only the CLAUDE.md Intent vocabulary',
  state_recovered_from_backup: 'session state was recovered from .bak after the main file was corrupt — data may be one write stale; verify recent changes persisted',
  state_lost_defaulted:     'session state was UNRECOVERABLE (main + backup corrupt) and reset to defaults — recent session context was lost',
  gate_failed_open:         'a governance gate could not evaluate and failed OPEN (allowed) — that spawn/read was NOT checked; if phase=evaluate it is a gate bug, investigate; re-verify the action manually',
  state_lock_failed_open:   'a state-write lock could not be acquired and the write proceeded WITHOUT mutual exclusion — possible lost update under contention; verify recent state mutations persisted',
};

/** Pure: { msg, surfacedIdx:[indices], correctedKinds:[kinds] }.
 *  Empty msg when nothing fresh to surface.
 *  opts.selfGoverned=true activates AUTO_CORRECTIONS (ADR-027). */
function buildReaction(state, opts = {}) {
  const { selfGoverned = false } = opts;
  const alerts = Array.isArray(state && state.governance_alerts) ? state.governance_alerts : [];
  const surfacedIdx = [];
  const correctedKinds = [];
  const lines = [];
  alerts.forEach((a, idx) => {
    if (!a || a.surfaced === true) return;
    surfacedIdx.push(idx);
    const kind = a.kind || 'unknown';
    const directive = DIRECTIVES[kind] || `governance signal "${kind}" raised — review session-state.governance_alerts`;
    // Add a compact detail suffix where it helps the orchestrator act.
    const detail = a.gate ? ` (${a.gate}/${a.phase || '?'})`
      : a.target ? ` (${a.target})`
      : a.agent ? ` (${a.agent})`
      : a.ratio != null ? ` (ratio ${a.ratio})`
      : a.ssc != null ? ` (SSC ${a.ssc})`
      : '';

    if (selfGoverned && AUTO_CORRECTIONS[kind]) {
      const correction = AUTO_CORRECTIONS[kind];
      correctedKinds.push(kind);
      lines.push(`• ${kind}${detail}: [SELF-CORRECTED] ${directive}\n  ${correction.template}`);
    } else {
      lines.push(`• ${kind}${detail}: ${directive}`);
    }
  });
  if (lines.length === 0) return { msg: '', surfacedIdx: [], correctedKinds: [] };
  const msg = `⚠️ GOVERNANCE REMINDER — ${lines.length} unacknowledged alert(s) from the previous turn. `
    + `Address these before/while routing the next step:\n${lines.join('\n')}`;
  return { msg, surfacedIdx, correctedKinds };
}

// Structured auto-corrections for reproducible anomaly classes (ADR-027).
// Keyed by alert kind — only kinds listed here are self-correctable.
// type 'inject': add a concrete repair directive to the surfaced prompt.
const AUTO_CORRECTIONS = {
  state_contract_degraded: {
    type: 'inject',
    label: 'state-contract-repair',
    template: [
      '🛠 AUTO-REPAIR: the next agent MUST end its response with the exact block:',
      '```',
      '## State Update',
      '```json',
      '{ "summary": "one-sentence summary", "artifacts": [], "handoff_notes": "what the next agent needs" }',
      '```',
      '```',
    ].join('\n'),
  },
  contract_collapse: {
    type: 'inject',
    label: 'contract-collapse-repair',
    template: [
      '🛠 AUTO-REPAIR: contract debt CRITICAL — every agent from this point MUST include ## State Update.',
      'Required format:\n```\n## State Update\n```json\n{ "summary": "...", "artifacts": [], "handoff_notes": "..." }\n```\n```',
    ].join('\n'),
  },
  agent_failure_degraded: {
    type: 'inject',
    label: 'routing-repair',
    template: '🛠 AUTO-REPAIR: degraded agent(s) detected — consult AGENT_BACKUP_MAP in execute-dag.js and re-route to backup before the next spawn.',
  },
};

module.exports = { buildReaction, DIRECTIVES, AUTO_CORRECTIONS };

// ── main (UserPromptSubmit entrypoint) ─────────────────────────────────────────
if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const { updateStateLocked } = require('./state-io'); // HA-2: locked mark-surfaced
  const ROOT = path.resolve(__dirname, '../..');
  const STATE_FILE = process.env.CCIP_STATE_FILE
    || path.join(ROOT, '.claude/runtime/session-state.json');
  const SELF_GOVERN = process.env.CCIP_SELF_GOVERN === '1'; // ADR-027

  let raw = '';
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', c => { raw += c; });
  process.stdin.on('end', () => {
    try {
      JSON.parse(raw); // validate the UserPromptSubmit payload
      const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      const { msg, surfacedIdx, correctedKinds } = buildReaction(state, { selfGoverned: SELF_GOVERN });
      if (!msg) { process.exit(0); }

      // Mark surfaced alerts so they are not re-injected every turn (anti-spam).
      // Atomic write with re-read immediately before (HA-3); fail-open on any error.
      try {
        updateStateLocked(STATE_FILE, (fresh) => {
          if (Array.isArray(fresh.governance_alerts))
            for (const i of surfacedIdx) {
              if (fresh.governance_alerts[i]) {
                fresh.governance_alerts[i].surfaced = true;
                if (correctedKinds.includes(fresh.governance_alerts[i].kind))
                  fresh.governance_alerts[i].auto_corrected = true;
              }
            }
        });
      } catch (e) {
        process.stderr.write(`[governance-reactor] mark-surfaced failed: ${e.message}\n`); // still inject
      }

      process.stdout.write(JSON.stringify({
        hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalSystemPrompt: msg },
      }));
    } catch (e) {
      process.stderr.write(`[governance-reactor] ${e.message}\n`); // fail-open
    }
    process.exit(0);
  });
}
