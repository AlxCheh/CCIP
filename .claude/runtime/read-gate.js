#!/usr/bin/env node
'use strict';
/**
 * PreToolUse[Read] gate (RFC R7) — enforces Reading Discipline (CLAUDE.md §16):
 * denies a FULL read (no offset/limit) of a protected, large-by-default path.
 * Default SHADOW; real deny only under CCIP_READGATE_ENFORCE=1. Fail-open.
 */

// [INV-READING-DISCIPLINE] RFC R7 — §16: never full-read these without offset/limit.
const DEFAULT_PROTECTED = ['docs/architecture/', '.claude/agents/'];

function isFullRead(p) {
  if (!p || p.tool_name !== 'Read') return false;
  const i = p.tool_input || {};
  return i.limit == null;
}

/** Pure decision: { decision:'allow'|'deny', reason?, wouldDeny? }. */
function evaluateReadGate(payload, opts = {}) {
  const { enforce = false, protectedPaths = DEFAULT_PROTECTED } = opts;
  if (!payload || payload.tool_name !== 'Read') return { decision: 'allow' };
  if (!isFullRead(payload)) return { decision: 'allow' };
  const fp = String((payload.tool_input || {}).file_path || '').replace(/\\/g, '/').replace(/\/\/+/g, '/');
  const hit = protectedPaths.find(g => fp === g.replace(/\/$/, '') || fp.startsWith(g) || fp.includes('/' + g));
  if (!hit) return { decision: 'allow' };
  const reason = `[read-gate] full read of protected path "${hit}" — use offset/limit `
    + `(CLAUDE.md §16 Reading Discipline)`;
  return enforce ? { decision: 'deny', reason } : { decision: 'allow', wouldDeny: true, reason };
}

module.exports = { evaluateReadGate, isFullRead, DEFAULT_PROTECTED };

// ── main (PreToolUse[Read] entrypoint) ──────────────────────────────────────────
if (require.main === module) {
  const ENFORCE = process.env.CCIP_READGATE_ENFORCE === '1';
  const deny = (reason) => process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
  }));
  let raw = '';
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', c => { raw += c; });
  process.stdin.on('end', () => {
    try {
      const r = evaluateReadGate(JSON.parse(raw), { enforce: ENFORCE });
      if (r.wouldDeny) process.stderr.write(`[read-gate] SHADOW would-deny: ${r.reason}\n`);
      if (r.decision === 'deny') { process.stderr.write(`[read-gate] DENY: ${r.reason}\n`); deny(r.reason); }
    } catch (e) {
      process.stderr.write(`[read-gate] ${e.message}\n`); // fail-open
    }
    process.exit(0);
  });
}
