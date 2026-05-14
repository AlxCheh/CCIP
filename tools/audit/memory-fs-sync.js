#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
const userMemoryDir = process.env.CCIP_USER_MEMORY_DIR;

const candidates = [
  path.join(root, 'MEMORY.md'),
  userMemoryDir ? path.join(userMemoryDir, 'MEMORY.md') : null,
].filter(Boolean);

let violations = 0;
let checked = 0;
const linkPat = /\[[^\]]+\]\(([^)]+\.md)\)/g;

for (const memFile of candidates) {
  if (!fs.existsSync(memFile)) continue;
  checked++;
  const memDir = path.dirname(memFile);
  const c = fs.readFileSync(memFile, 'utf-8');
  let m;
  while ((m = linkPat.exec(c))) {
    const ref = m[1];
    const abs = path.isAbsolute(ref) ? ref : path.join(memDir, ref);
    if (!fs.existsSync(abs)) {
      fail('MEMORY-FS', `${ref} referenced but missing`, { file: memFile });
      violations++;
    }
  }
}

if (checked === 0) {
  ok('MEMORY-FS (skipped — no MEMORY.md in scan scope)');
  process.exit(0);
}

if (violations === 0) ok('MEMORY-FS');
process.exit(violations === 0 ? 0 : 1);
