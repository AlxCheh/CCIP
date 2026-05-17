#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { walk } = require('./_lib/walk');
const { fail, ok } = require('./_lib/report');

// Запрещённые префиксы. Литералы экранируются в regex.
const FORBIDDEN = [
  { pat: /W:\/Claude\/CCIP\//g, why: 'absolute Windows path' },
  { pat: /C:\\\\Users\\\\/g,    why: 'absolute Windows user path' },
  { pat: /\/home\/[a-z]+\//g,   why: 'absolute Linux home path' },
  { pat: /\bCCIP\/(docs|apps|packages|\.claude|infra|tools)\//g, why: 'CCIP/ prefix; use relative path' },
];

// Allowlist файлов, где упоминания W:/... легитимны (например, test fixtures или plan docs).
const ALLOWLIST = [
  'docs/plans/2026-05-12-zero-drift-compliance-section10.md', // plan doc — contains literal examples
  'tools/audit/__fixtures__/path-bad.md',                     // test fixture — intentionally bad
  'docs/audits/multi-agent-ecosystem-2026-05-07.md',          // audit report — documents found violations
  '.claude/agents/ccip-session-optimizer.md',                 // describes bad patterns as anti-examples
  '.claude/agents/consistency-checker.md',                    // table labels, not executable paths
  'docs/refactor/session-optimizer-skill-scope.md',          // planning doc — project-relative labels, not executable paths
  'docs/plans/2026-05-17-multi-agent-ecosystem-residual-remediation.md', // plan doc — quotes audit verification commands
];

const args = process.argv.slice(2);
const targetIdx = args.indexOf('--target');
const targets = targetIdx >= 0 ? [args[targetIdx + 1]] : null;
const useAllowlist = targets === null; // allowlist applies only in full-repo scan mode

const root = gitRoot();
const files = targets || walk(root, ['**/*.md', '**/*.json', '**/*.js', '**/*.ts']);

let violations = 0;
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  if (useAllowlist && ALLOWLIST.includes(rel)) continue;
  const content = fs.readFileSync(file, 'utf-8');
  for (const { pat, why } of FORBIDDEN) {
    const m = content.match(pat);
    if (m) {
      violations += m.length;
      fail('PATH-CANON', `${why}: ${m[0]}`, { file: rel, count: m.length });
    }
  }
}

if (violations === 0) ok('PATH-CANON');
process.exit(violations === 0 ? 0 : 1);
