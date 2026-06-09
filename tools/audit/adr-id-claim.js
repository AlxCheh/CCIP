#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { walk } = require('./_lib/walk');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
const realIds = new Set(
  fs.readdirSync(path.join(root, 'docs/decisions'))
    .map(f => (f.match(/^(ADR-\d{3})/) || [])[1])
    .filter(Boolean)
);
const maxReal = Math.max(...[...realIds].map(id => parseInt(id.slice(4), 10)));

// Audit / planning docs legitimately reference future or phantom ADR IDs as findings.
const ALLOWLIST = new Set([
  'docs/audits/2026-05-07-multi-agent-ecosystem.md',
  'docs/plans/2026-05-17-multi-agent-ecosystem-residual-remediation.md',
  'docs/plans/2026-05-20-multi-agent-ecosystem-audit-remediation.md',
]);

const RANGE = /\bADR-(\d{3})\s*\.\.\s*ADR-(\d{3})\b/g;
const SINGLE = /\bADR-(\d{3})\b/g;

const args = process.argv.slice(2);
const targetIdx = args.indexOf('--target');
const targets = targetIdx >= 0 ? [args[targetIdx + 1]] : null;
const useAllowlist = targets === null;

const files = targets || [
  ...walk(root, ['.claude/agents/*.md']),
  ...walk(root, ['CLAUDE.md']),
];

let violations = 0;
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  if (useAllowlist && ALLOWLIST.has(rel)) continue;
  const body = fs.readFileSync(file, 'utf-8');
  let m;
  RANGE.lastIndex = 0;
  while ((m = RANGE.exec(body))) {
    const to = parseInt(m[2], 10);
    if (to < maxReal) {
      violations++;
      fail('ADR-RANGE', `stale upper bound ${m[0]} (real max=ADR-${String(maxReal).padStart(3,'0')})`, { file: rel });
    }
  }
  SINGLE.lastIndex = 0;
  while ((m = SINGLE.exec(body))) {
    if (!realIds.has(`ADR-${m[1]}`)) {
      violations++;
      fail('ADR-RANGE', `unknown ADR-${m[1]}`, { file: rel });
    }
  }
}

if (violations === 0) ok('ADR-RANGE');
process.exit(violations === 0 ? 0 : 1);
