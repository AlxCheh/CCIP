#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { walk } = require('./_lib/walk');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
const claudeMd = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf-8');
const agents = walk(root, ['.claude/agents/*.md']).map(f => path.basename(f, '.md'));

let violations = 0;
for (const name of agents) {
  // Считаем вхождения как литерал в backticks или просто как слово в Intent table.
  const re = new RegExp(`\\b${name.replace(/-/g, '\\-')}\\b`, 'g');
  const count = (claudeMd.match(re) || []).length;
  if (count === 0) {
    violations++;
    fail('AGENT-PRESENCE', `${name} not referenced in CLAUDE.md`, { agent: name });
  }
}

if (violations === 0) ok('AGENT-PRESENCE');
process.exit(violations === 0 ? 0 : 1);
