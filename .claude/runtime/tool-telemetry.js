#!/usr/bin/env node
'use strict';
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
  if (i.command) return String(i.command).slice(0, 80);
  if (i.pattern) return String(i.pattern).slice(0, 80);
  return '';
}

/** Build a schema-conforming telemetry event from a hook payload. */
function buildEvent(p, session) {
  const text = JSON.stringify((p && p.tool_response) || '');
  return {
    ts:        new Date().toISOString(),
    session:   session || '',
    tool:      (p && p.tool_name) || '',
    target:    extractTarget(p),
    bytes:     Buffer.byteLength(text, 'utf-8'),   // proxy for volume, not tokens
    full_read: isFullRead(p),
    outcome:   p && p.tool_response && p.tool_response.is_error ? 'error' : 'ok',
  };
}

module.exports = { isFullRead, extractTarget, buildEvent };
