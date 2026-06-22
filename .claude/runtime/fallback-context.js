'use strict';
/** RFC R8 — lightweight knowledge injection for a fallback (DEGRADED→general-purpose). */
function buildFallbackContext(agent, profiles) {
  const p = profiles && agent ? profiles[agent] : null;
  if (!p) return '';
  const inv = (p.invariants || []).map(i => `- ${i}`).join('\n');
  const anchors = (p.domain_anchors || []).join(', ');
  const forbidden = (p.forbidden || []).map(f => `- ${f}`).join('\n');
  return `## Domain Bootstrap (fallback for ${agent})\n`
    + `Invariants you MUST preserve:\n${inv}\n`
    + (anchors ? `Read before acting: ${anchors}\n` : '')
    + (forbidden ? `Forbidden actions:\n${forbidden}\n` : '');
}
module.exports = { buildFallbackContext };
