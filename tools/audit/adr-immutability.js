#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const matter = require('gray-matter');
const { gitRoot } = require('./_lib/git-root');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();

// --staged mode must be dispatched before CI-mode code which may process.exit early
if (require.main === module && process.argv[2] === '--staged') {
  checkStagedADRs();
}

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

// ---------------------------------------------------------------------------
// --staged mode: pre-commit gate (compares HEAD vs staging area)
// ---------------------------------------------------------------------------

function checkStagedADRs() {
  let stagedFiles;
  try {
    stagedFiles = cp.execFileSync(
      'git', ['diff', '--staged', '--name-only'],
      { cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).split('\n').filter(f => /docs\/decisions\/ADR-[^/]+\.md$/.test(f));
  } catch {
    process.exit(0);
  }
  if (stagedFiles.length === 0) process.exit(0);

  let blocked = 0;
  for (const file of stagedFiles) {
    let headContent;
    try {
      headContent = cp.execFileSync('git', ['show', `HEAD:${file}`], {
        cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      continue; // new file — OK
    }

    const headFm = matter(headContent).data || {};
    if (!headFm.status || !/Принято/.test(headFm.status)) continue;

    // Read staged content from index
    let stagedContent;
    try {
      stagedContent = cp.execFileSync('git', ['show', `:0:${file}`], {
        cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      // fallback to working tree
      const abs = path.join(root, file);
      if (!fs.existsSync(abs)) continue;
      stagedContent = fs.readFileSync(abs, 'utf-8');
    }

    const stagedFm = matter(stagedContent).data || {};
    if (headFm.status === stagedFm.status) {
      process.stderr.write(`[adr-immutability] BLOCK: modifying accepted ADR without status bump: ${file}\n`);
      process.stderr.write(`  Status was "${headFm.status}" — increment revision or create a superseding ADR.\n`);
      blocked++;
    }
  }

  process.exit(blocked === 0 ? 0 : 1);
}

if (require.main === module && process.argv[2] === '--staged') {
  checkStagedADRs();
}

module.exports = { checkStagedADRs };
