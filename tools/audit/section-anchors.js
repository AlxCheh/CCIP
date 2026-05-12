#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { walk } = require('./_lib/walk');
const { fail, ok } = require('./_lib/report');

const REF_PAT = /\(§(\d+(?:\.\d+)*)\)/g;
// Заголовки вида "## 3. Foo", "### 5.2 Bar", "## §15 State Contract"
const HEAD_PAT = /^#{2,4}\s+(?:§)?(\d+(?:\.\d+)*)[\.\s§]/gm;

const args = process.argv.slice(2);
const targetIdx = args.indexOf('--target');
const targets = targetIdx >= 0 ? [args[targetIdx + 1]] : null;

const root = gitRoot();
const files = targets || walk(root, ['**/*.md']);

let violations = 0;
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const content = fs.readFileSync(file, 'utf-8');
  const refs = new Set();
  let m;
  REF_PAT.lastIndex = 0;
  while ((m = REF_PAT.exec(content))) refs.add(m[1]);

  const heads = new Set();
  HEAD_PAT.lastIndex = 0;
  while ((m = HEAD_PAT.exec(content))) heads.add(m[1]);

  for (const ref of refs) {
    if (!heads.has(ref)) {
      violations++;
      fail('SECTION-ANCHOR', `§${ref} referenced but not defined`, { file: rel });
    }
  }
}

if (violations === 0) ok('SECTION-ANCHOR');
process.exit(violations === 0 ? 0 : 1);
