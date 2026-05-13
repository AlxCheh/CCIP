#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
const ORPHANS = [
  { p: 'frontend',               id: 'F-020' },
  { p: 'the roles of subagents', id: 'F-021' },
  { p: '.agents',                id: 'F-022' },
];

let violations = 0;
for (const o of ORPHANS) {
  if (fs.existsSync(path.join(root, o.p))) {
    fail('ORPHAN-DIR', `${o.p} exists (${o.id} unresolved)`);
    violations++;
  }
}

if (violations === 0) ok('ORPHAN-DIR');
process.exit(violations === 0 ? 0 : 1);
