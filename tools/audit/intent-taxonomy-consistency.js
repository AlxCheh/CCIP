#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
const intentsSchema = JSON.parse(
  fs.readFileSync(path.join(root, 'docs/schemas/intents.json'), 'utf-8')
);
const canonical = new Set(intentsSchema.enum);

const SOURCES = [
  'CLAUDE.md',
  '.claude/runtime/state-protocol.md',
  '.claude/agents/ccip-routing-planner.md',
];

// Heuristic: ALL_CAPS_WITH_UNDERSCORES tokens of length ≤ 12, no digits.
const TOKEN = /\b([A-Z][A-Z_]{2,})\b/g;
// Tokens that are NEVER intents — risk levels, state machine names, common abbrs, common words.
const NOISE = new Set([
  'LOW','MEDIUM','HIGH',
  'INIT','PLAN','INJECT','UPDATE','FLUSH','DEFAULT',
  'IF','OR','AND','THEN','NOT','ANY','ALL','NEW','OLD','ETC','SEE','USE',
  'NOMINAL','DEGRADED','SUSPENDED','TBD',
  'CLAUDE','PR','CI','OS',
  'API','SLA','CCIP','JWT','RBAC','RLS','ADR','DAG','MV','SQL','PG','HTML','JSON','CSV','REST','URL','UUID','SMTP','FCM','APNS','AOF','POC','CRUD','TTL','UI','UX','TLS','SSL','HTTP','HTTPS',
]);

let violations = 0;
for (const file of SOURCES) {
  const body = fs.readFileSync(path.join(root, file), 'utf-8');
  let m; TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(body))) {
    const tok = m[1];
    if (NOISE.has(tok)) continue;
    if (tok.length > 12 || /\d/.test(tok)) continue;
    // Context-narrow: only consider tokens that look like intent labels.
    const slice = body.slice(Math.max(0, m.index - 80), m.index + 80).toLowerCase();
    if (!/(intent|routing|backup|primary|backend|frontend|schema)/.test(slice)) continue;
    if (!canonical.has(tok)) {
      violations++;
      fail('INTENT-TAX', `${tok} not in intents.json`, { file });
    }
  }
}

if (violations === 0) ok('INTENT-TAX');
process.exit(violations === 0 ? 0 : 1);
