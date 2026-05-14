#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { walk } = require('./_lib/walk');
const { fail, ok } = require('./_lib/report');

const PATH_PAT = /apps\/(?:api|web|mobile)\/src\/[A-Za-z0-9_\/.\-]+/g;

function stripCodeBlocks(md) {
  return md.replace(/```[\s\S]*?```/g, '');
}

const root = gitRoot();
const files = [
  ...walk(root, ['docs/delivery/*.md']),
  ...walk(root, ['docs/delivery_plan_v1_0.md']),
];

let violations = 0;
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const c = stripCodeBlocks(fs.readFileSync(file, 'utf-8'));
  let m;
  while ((m = PATH_PAT.exec(c))) {
    const ref = m[0].replace(/[.,;)]+$/, '');
    if (!fs.existsSync(path.join(root, ref))) {
      fail('DELIVERY-PATH', ref, { file: rel });
      violations++;
    }
  }
}

if (violations === 0) ok('DELIVERY-PATH');
process.exit(violations === 0 ? 0 : 1);
