#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
const hookFile = path.join(root, '.claude/runtime/post-agent-hook.js');
const hookSrc = fs.readFileSync(hookFile, 'utf-8');

const agents = fs
  .readdirSync(path.join(root, '.claude/agents'))
  .filter(f => f.endsWith('.md'))
  .map(f => f.replace(/\.md$/, ''));

// Extract named alternates from the resolver regex literal — anything of shape
// `.match(/\b(...)\b/...)`. Skip family-pattern fragments containing brackets / quantifiers.
const resolverMatch = hookSrc.match(/match\(\/\\b\(([^)]+)\)\\b\//);
let violations = 0;
if (!resolverMatch) {
  // Acceptable: tightened resolver no longer uses a literal regex (e.g. iterates fs.readdir).
  // In that case we still require explicit reference to .claude/agents path below.
} else {
  const literals = resolverMatch[1]
    .split('|')
    .map(s => s.trim())
    .filter(s => !s.includes('[') && !s.includes('+') && !s.includes('\\w'));

  for (const lit of literals) {
    if (!agents.includes(lit)) {
      fail('HOOK-RESOLVER', `phantom agent name in resolver: "${lit}"`);
      violations++;
    }
  }
}

// Tightened resolver must validate the resolved name against the real agents directory.
if (!hookSrc.includes('.claude/agents')) {
  fail('HOOK-RESOLVER', 'hook does not validate resolved name against .claude/agents');
  violations++;
}

if (violations === 0) ok('HOOK-RESOLVER');
process.exit(violations === 0 ? 0 : 1);
