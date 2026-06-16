#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { walk } = require('./_lib/walk');
const { fail, ok } = require('./_lib/report');

const PATH_PAT = /(?:^|[\s\(\[`>])((?:\.claude|docs|apps|packages|infra|tools)\/[A-Za-z0-9_./*\-]+)/g;

// Audit-документы цитируют пути из находок (как DEAD-REF, так и stale).
// По дизайну содержат "плохие" ссылки — не валидируем их.
const AUDIT_DOC_ALLOWLIST = [
  'docs/audits/2026-05-07-multi-agent-ecosystem.md',
  'docs/plans/archive/2026-05-17-multi-agent-ecosystem-residual-remediation.md', // plan doc — references future files (ADR-015, sub-plan scaffolds)
  'docs/plans/archive/2026-06-01-gp-form.md', // plan doc — references files to be created during implementation
  'docs/plans/2026-06-05-agent-optimizer-audit-fixes.md', // plan doc — bash examples reference .bak paths not meant to exist
  'docs/plans/archive/2026-06-08-defect-remediation.md', // plan doc — references sanitize-utils.js and quarantine-increment.js to be created during implementation
  'docs/plans/archive/2026-06-08-structural-hardening.md', // plan doc — references future test files and hook modifications
  'docs/plans/archive/2026-05-12-zero-drift-compliance-section10.md', // archive plan — references audit files by old names
  'docs/plans/archive/2026-05-26-remediation-master-sequencing.md', // archive plan — historical references
  'docs/errors/sessions/2026-05-17T20-14-50-549Z-72282cc.md', // session log — historical snapshot
  'docs/errors/sessions/2026-06-12T06-09-10-761Z-472c55c.md', // session log — historical snapshot; refs pre-archive plan paths
  'docs/errors/errors_log.md', // error log — accumulates historical references to pre-archive paths
];

function stripCodeBlocks(md) {
  return md
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]*`/g, '');
}

// Resolve ref against fs, supporting wildcard suffixes (foo/*, foo.*).
function refExists(root, ref) {
  if (ref.endsWith('/*')) {
    const dir = path.join(root, ref.slice(0, -2));
    return fs.existsSync(dir);
  }
  if (ref.endsWith('.*')) {
    const base = ref.slice(0, -2);
    const dir = path.dirname(base);
    const prefix = path.basename(base) + '.';
    const absDir = path.join(root, dir);
    if (!fs.existsSync(absDir)) return false;
    return fs.readdirSync(absDir).some(name => name.startsWith(prefix));
  }
  return fs.existsSync(path.join(root, ref));
}

const args = process.argv.slice(2);
const targetIdx = args.indexOf('--target');
const targets = targetIdx >= 0 ? [args[targetIdx + 1]] : null;
const useAllowlist = targets === null;

const root = gitRoot();
const files = targets || walk(root, ['**/*.md']);

let violations = 0;
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  if (useAllowlist && AUDIT_DOC_ALLOWLIST.includes(rel)) continue;
  const content = stripCodeBlocks(fs.readFileSync(file, 'utf-8'));
  let m;
  PATH_PAT.lastIndex = 0;
  while ((m = PATH_PAT.exec(content))) {
    let ref = m[1].replace(/[.,;:)\]]+$/, '');
    if (!refExists(root, ref)) {
      violations++;
      fail('DEAD-REF', ref, { file: rel });
    }
  }
}

if (violations === 0) ok('DEAD-REF');
process.exit(violations === 0 ? 0 : 1);
