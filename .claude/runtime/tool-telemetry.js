#!/usr/bin/env node
'use strict';
const { nonAsciiRatio, estimateTokens } = require('../../tools/audit/_lib/token-estimate');
/**
 * PostToolUse hook (RFC R2) — fires after EVERY tool call (not only Agent).
 * Appends one telemetry event per call to events.jsonl, giving inline-session
 * coverage (Read/Edit/Bash/…) that the Agent-only post-agent-hook cannot see.
 *
 * Measures EVENTS, not tokens (ADR-016: main-agent token attribution is out of reach).
 * Fail-open: any internal error → exit 0 + stderr, never blocks the session.
 */

/** Read with no offset/limit = full-file read (Reading Discipline §16 signal). */
function isFullRead(p) {
  if (!p || p.tool_name !== 'Read') return false;
  const i = p.tool_input || {};
  return i.offset == null && i.limit == null;
}

/** Best-effort target: file path, or head of command/pattern. */
function extractTarget(p) {
  const i = (p && p.tool_input) || {};
  if (i.file_path) return String(i.file_path);
  if (i.command) return String(i.command).trim().replace(/^(\w+=\S+\s+)+/, '').split(/\s+/)[0] || '';
  if (i.pattern) return String(i.pattern).slice(0, 80);
  return '';
}

/** Build a schema-conforming telemetry event from a hook payload. */
function buildEvent(p, session) {
  const text = JSON.stringify((p && p.tool_response) || '');
  const bytes = Buffer.byteLength(text, 'utf-8');
  const ratio = nonAsciiRatio(text);
  return {
    ts:        new Date().toISOString(),
    session:   session || '',
    tool:      (p && p.tool_name) || '',
    target:    extractTarget(p),
    bytes,                                  // proxy for volume, not tokens
    non_ascii_ratio: ratio,                 // event-time Cyrillic signal (#5)
    est_tokens: estimateTokens(bytes, ratio), // heuristic tool-I/O tokens (ADR-020)
    full_read: isFullRead(p),
    outcome:   p && p.tool_response && p.tool_response.is_error ? 'error' : 'ok',
  };
}

module.exports = { isFullRead, extractTarget, buildEvent };

// ── main (PostToolUse entrypoint) ──────────────────────────────────────────────
if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const ROOT = path.resolve(__dirname, '../..');
  const EVENTS = process.env.CCIP_EVENTS_FILE
    || path.join(ROOT, '.claude/runtime/events.jsonl');
  const STATE = path.join(ROOT, '.claude/runtime/session-state.json');
  const MAX_BYTES = 5 * 1024 * 1024;

  const sessionId = () => {
    try { return JSON.parse(fs.readFileSync(STATE, 'utf-8')).session_id || ''; }
    catch { return ''; }
  };
  const rotate = () => {
    try { if (fs.statSync(EVENTS).size > MAX_BYTES) fs.renameSync(EVENTS, EVENTS + '.1'); }
    catch {}
  };

  let raw = '';
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', c => { raw += c; });
  process.stdin.on('end', () => {
    try {
      const payload = JSON.parse(raw);
      rotate();
      // [INV-TOOL-TELEMETRY] RFC R2 — one event per tool call, inline-session coverage
      fs.appendFileSync(EVENTS, JSON.stringify(buildEvent(payload, sessionId())) + '\n', 'utf-8');
    } catch (e) {
      process.stderr.write(`[tool-telemetry] ${e.message}\n`);
    }
    process.exit(0); // fail-open — governance must never break the session
  });
}
