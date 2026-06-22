'use strict';
/**
 * Shared handoff sanitization utilities (D-04/D-13, UU-4/UU-5).
 * Used by execute-dag.js (DAG path) and post-agent-hook.js (live-session path).
 */

const INJECTION_RE = /^\s*(ignore|disregard|forget|override|system\s*:|you\s+are\s+now|new\s+instruction|act\s+as\b)/i;
const INLINE_SYSTEM_RE = /\bsystem\s*:/i;
const MIDLINE_INJECTION_RE =
  /\b(ignore|disregard|forget|override)\b[\s\S]{0,20}\b(previous|prior|above|earlier|all)\b[\s\S]{0,20}\b(instruction|instructions|prompt|prompts|context|rules?)\b/i;

// Cyrillic/Greek visually confusable with ASCII — bypass vector for injection regexes (D-13).
const CONFUSABLE_MAP = new Map([
  // Cyrillic uppercase → Latin
  ['А', 'A'], ['В', 'B'], ['Е', 'E'], ['К', 'K'],
  ['М', 'M'], ['Н', 'H'], ['О', 'O'], ['Р', 'P'],
  ['С', 'C'], ['Т', 'T'], ['Х', 'X'],
  // Cyrillic lowercase → Latin
  ['а', 'a'], ['е', 'e'], ['о', 'o'],
  ['р', 'p'], ['с', 'c'], ['х', 'x'],
  // Greek uppercase → Latin
  ['Α', 'A'], ['Β', 'B'], ['Ε', 'E'], ['Κ', 'K'],
  ['Μ', 'M'], ['Ν', 'N'], ['Ο', 'O'], ['Ρ', 'P'],
  ['Τ', 'T'], ['Χ', 'X'],
  // Greek lowercase → Latin
  ['ο', 'o'], ['ρ', 'p'], ['σ', 'c'],
]);
const CONFUSABLE_RE = new RegExp([...CONFUSABLE_MAP.keys()].join('|'), 'g');

function normalizeForScan(line) {
  return line
    .replace(/[​-‏‪-‮⁠﻿]/g, '') // zero-width + bidi controls
    .normalize('NFKC')
    .replace(CONFUSABLE_RE, ch => CONFUSABLE_MAP.get(ch) || ch); // confusable fold (D-13)
}

function sanitizeHandoff(notes) {
  if (!notes) return '—';
  if (typeof notes === 'object') return JSON.stringify(notes, null, 2);
  const cleaned = String(notes)
    .split(/\r\n|\r|\n/)
    .filter(line => {
      const scan = normalizeForScan(line);
      return !INJECTION_RE.test(scan) && !INLINE_SYSTEM_RE.test(scan)
        && !MIDLINE_INJECTION_RE.test(scan);
    })
    .join('\n')
    .trim();
  return cleaned || '—';
}

/**
 * Extracts and parses the LAST ## State Update ```json {...} ``` block from text.
 * Uses brace-balancing to handle braces inside string values (UU-4).
 * Takes the last match to prevent injected first-block from overriding real output (UU-5).
 */
function parseStateUpdate(text) {
  if (!text) return null;
  const HEADER_RE = /##\s*State\s*Update\s*```(?:json)?\s*/gi;
  const candidates = [];
  let m;
  while ((m = HEADER_RE.exec(text)) !== null) {
    const jsonStart = text.indexOf('{', m.index + m[0].length);
    if (jsonStart === -1) continue;
    // Brace-balanced scan — respects strings and escape sequences
    let depth = 0, inStr = false, esc = false, jsonEnd = -1;
    for (let i = jsonStart; i < text.length; i++) {
      const ch = text[i];
      if (esc)                         { esc = false; continue; }
      if (ch === '\\' && inStr)        { esc = true; continue; }
      if (ch === '"')                  { inStr = !inStr; continue; }
      if (inStr)                       continue;
      if (ch === '{')                  depth++;
      if (ch === '}') { depth--; if (depth === 0) { jsonEnd = i; break; } }
    }
    if (jsonEnd === -1) continue;
    try {
      const obj = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
      candidates.push({
        summary:       (typeof obj.summary       === 'string' ? obj.summary.trim()       : '') || '',
        artifacts:     (Array.isArray(obj.artifacts)           ? obj.artifacts            : []),
        handoff_notes: (typeof obj.handoff_notes === 'string' ? obj.handoff_notes.trim() : '') || '',
      });
    } catch { /* malformed JSON in this block — skip, try next */ }
  }
  return candidates.length > 0 ? candidates[candidates.length - 1] : null; // last wins (UU-5)
}

module.exports = {
  sanitizeHandoff, normalizeForScan, parseStateUpdate,
  INJECTION_RE, INLINE_SYSTEM_RE, MIDLINE_INJECTION_RE,
};
