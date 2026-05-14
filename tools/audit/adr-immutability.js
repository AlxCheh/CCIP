#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const matter = require('gray-matter');
const { gitRoot } = require('./_lib/git-root');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
const BASE = process.env.GITHUB_BASE_REF
  || process.env.ADR_IMMUT_BASE
  || 'origin/main';

function listChangedAdrs() {
  try {
    const out = cp.execFileSync(
      'git',
      ['diff', '--name-only', `${BASE}...HEAD`, '--', 'docs/decisions/ADR-*.md'],
      { cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    return out.split('\n').filter(Boolean);
  } catch {
    return null;
  }
}

const changed = listChangedAdrs();
if (changed === null) {
  process.stdout.write(`[ADR-IMMUT] SKIP — base ref ${BASE} not available\n`);
  process.exit(0);
}

let violations = 0;
for (const file of changed) {
  let baseContent;
  try {
    baseContent = cp.execFileSync('git', ['show', `${BASE}:${file}`], {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    continue;
  }

  const headPath = path.join(root, file);
  if (!fs.existsSync(headPath)) continue;
  const headContent = fs.readFileSync(headPath, 'utf-8');

  if (baseContent === headContent) continue;

  const baseFm = matter(baseContent).data || {};
  const headFm = matter(headContent).data || {};

  if (!baseFm.status || !/Принято/.test(baseFm.status)) continue;

  if (baseFm.status === headFm.status) {
    fail('ADR-IMMUT', `${file} modified without status bump (was "${baseFm.status}")`, { file });
    violations++;
  }
}

if (violations === 0) ok('ADR-IMMUT');
process.exit(violations === 0 ? 0 : 1);
