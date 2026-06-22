#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { walk } = require('./_lib/walk');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
const decisionsDir = path.join(root, 'docs/decisions');
const realAdrFiles = new Set(
  fs.readdirSync(decisionsDir).filter(f => /^ADR-\d{3}-.+\.md$/.test(f))
);

// Audit / planning documents legitimately reference phantom or future ADR slugs as findings.
const ALLOWLIST = new Set([
  'docs/audits/2026-05-07-multi-agent-ecosystem.md',
  'docs/plans/2026-05-17-multi-agent-ecosystem-residual-remediation.md',
  'docs/plans/2026-05-20-multi-agent-ecosystem-audit-remediation.md',
]);

const MENTION = /\bADR-(\d{3})-[a-z][a-z0-9-]*\.md\b/g;

const args = process.argv.slice(2);
const targetIdx = args.indexOf('--target');
const targets = targetIdx >= 0 ? [args[targetIdx + 1]] : null;
const useAllowlist = targets === null;

const scanFiles = targets || [
  ...walk(root, ['.claude/agents/*.md']),
  ...walk(root, ['docs/**/*.md']),
  ...walk(root, ['CLAUDE.md']),
];

let violations = 0;
for (const file of scanFiles) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  if (useAllowlist && ALLOWLIST.has(rel)) continue;
  const body = fs.readFileSync(file, 'utf-8');
  let m;
  MENTION.lastIndex = 0;
  while ((m = MENTION.exec(body))) {
    const mentioned = m[0];
    if (!realAdrFiles.has(mentioned)) {
      violations++;
      fail('ADR-MENTION', `phantom ${mentioned}`, { file: rel });
    }
  }
}

if (violations === 0) ok('ADR-MENTION');
process.exit(violations === 0 ? 0 : 1);
