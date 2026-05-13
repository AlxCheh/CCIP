#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { walk } = require('./_lib/walk');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();

// adrId ('ADR-001') → absolute path of its own decision file.
// Filenames are `ADR-NNN-slug.md`, so extract the ADR-NNN prefix.
const adrs = new Map();
for (const f of walk(root, ['docs/decisions/ADR-*.md'])) {
  const m = path.basename(f, '.md').match(/^(ADR-\d{3})/);
  if (m) adrs.set(m[1], f);
}

const refFiles = [
  ...walk(root, ['.claude/agents/*.md']),
  ...walk(root, ['docs/architecture/*.md']),
  ...walk(root, ['docs/decisions/*.md']),
  ...walk(root, ['apps/api/src/**/*.ts']),
  ...walk(root, ['docs/delivery/*.md']),
];

const contents = new Map();
for (const f of refFiles) contents.set(f, fs.readFileSync(f, 'utf-8'));

let violations = 0;
for (const [adr, ownFile] of adrs) {
  const re = new RegExp(`\\b${adr}\\b`, 'g');
  let count = 0;
  for (const [f, body] of contents) {
    if (f === ownFile) continue;
    const m = body.match(re);
    if (m) count += m.length;
  }
  if (count < 1) {
    fail('ORPHAN-ADR', `${adr} not referenced outside its own file`);
    violations++;
  }
}

if (violations === 0) ok('ORPHAN-ADR');
process.exit(violations === 0 ? 0 : 1);
