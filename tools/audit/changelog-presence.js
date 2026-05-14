#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { gitRoot } = require('./_lib/git-root');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
const BASE = process.env.GITHUB_BASE_REF
  || process.env.CHANGELOG_BASE
  || 'origin/main';

function listCommits() {
  try {
    const out = cp.execFileSync(
      'git',
      ['log', `${BASE}..HEAD`, '--pretty=%H %s'],
      { cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    return out.split('\n').filter(Boolean);
  } catch {
    return null;
  }
}

const commits = listCommits();
if (commits === null) {
  process.stdout.write(`[CHANGELOG] SKIP — base ref ${BASE} not available\n`);
  process.exit(0);
}

const changelogPath = path.join(root, 'CHANGELOG.md');
const changelog = fs.existsSync(changelogPath)
  ? fs.readFileSync(changelogPath, 'utf-8')
  : '';

let violations = 0;
const CLOSES_RE = /closes\s+([FCRX]-\d{3})/gi;
const SEVERITY_RE = /\b(BLOCKER|CRITICAL)\b/;

for (const line of commits) {
  const sha = line.slice(0, 40);
  const subject = line.slice(41);

  let m;
  CLOSES_RE.lastIndex = 0;
  while ((m = CLOSES_RE.exec(subject))) {
    const id = m[1].toUpperCase();
    if (!changelog.includes(id)) {
      fail('CHANGELOG', `commit ${sha.slice(0, 7)} closes ${id} but CHANGELOG.md does not mention it`, { sha: sha.slice(0, 7) });
      violations++;
    }
  }
  if (SEVERITY_RE.test(subject) && !/##\s*\[Unreleased\]/i.test(changelog)) {
    fail('CHANGELOG', `commit ${sha.slice(0, 7)} marked BLOCKER/CRITICAL but [Unreleased] section missing`, { sha: sha.slice(0, 7) });
    violations++;
  }
}

if (violations === 0) ok('CHANGELOG');
process.exit(violations === 0 ? 0 : 1);
