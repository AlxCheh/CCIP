#!/usr/bin/env node
'use strict';
/**
 * PreToolUse[Read] gate (RFC R7) — enforces Reading Discipline (CLAUDE.md §16):
 * denies a FULL read (no offset/limit) of a protected, large-by-default path.
 * Default SHADOW; real deny only under CCIP_READGATE_ENFORCE=1. Fail-open.
 */

// [INV-READING-DISCIPLINE] RFC R7 — §16: never full-read these without offset/limit.
const DEFAULT_PROTECTED = ['docs/architecture/', '.claude/agents/'];
// Read tool defaults to 2000 lines; a limit beyond this is a whole-file read in practice (E-5).
const DEFAULT_MAX_LINES = parseInt(process.env.CCIP_READ_MAX_LINES || '2000', 10);

/** A "full read" = no bounds at all, OR an explicit limit beyond the discipline cap (E-5). */
function isFullRead(p, maxLines = DEFAULT_MAX_LINES) {
  if (!p || p.tool_name !== 'Read') return false;
  const i = p.tool_input || {};
  if (i.offset == null && i.limit == null) return true;
  if (i.limit != null && Number(i.limit) > maxLines) return true;
  return false;
}

/** Pure decision: { decision:'allow'|'deny', reason?, wouldDeny? }. */
function evaluateReadGate(payload, opts = {}) {
  const { enforce = false, protectedPaths = DEFAULT_PROTECTED, maxLines = DEFAULT_MAX_LINES } = opts;
  if (!payload || payload.tool_name !== 'Read') return { decision: 'allow' };
  if (!isFullRead(payload, maxLines)) return { decision: 'allow' };
  // E-4: match case-insensitively — Windows FS is case-insensitive, so docs/Architecture/
  // resolves to the same protected file as docs/architecture/. Lowercase both sides.
  const fp = String((payload.tool_input || {}).file_path || '')
    .replace(/\\/g, '/').replace(/\/\/+/g, '/').toLowerCase();
  const hit = protectedPaths.find(g => {
    const gl = g.toLowerCase();
    return fp === gl.replace(/\/$/, '') || fp.startsWith(gl) || fp.includes('/' + gl);
  });
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
  const { recordGateFailOpen } = require('./gate-fail-open.js');

  let raw = '';
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', c => { raw += c; });
  process.stdin.on('end', () => {
    let phase = 'parse';
    try {
      const payload = JSON.parse(raw);
      phase = 'evaluate';
      const r = evaluateReadGate(payload, { enforce: ENFORCE });
      if (r.wouldDeny) process.stderr.write(`[read-gate] SHADOW would-deny: ${r.reason}\n`);
      if (r.decision === 'deny') { process.stderr.write(`[read-gate] DENY: ${r.reason}\n`); deny(r.reason); }
    } catch (e) {
      process.stderr.write(`[read-gate] ${e.message}\n`); // fail-open
      // E-6: make the fail-open observable (durable audit + reactor-surfaced alert).
      recordGateFailOpen({ gate: 'read-gate', phase, message: e.message });
    }
    process.exit(0);
  });
}
