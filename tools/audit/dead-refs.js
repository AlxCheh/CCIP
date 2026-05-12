#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { walk } = require('./_lib/walk');
const { fail, ok } = require('./_lib/report');

const PATH_PAT = /(?:^|[\s\(\[`>])((?:\.claude|docs|apps|packages|infra|tools)\/[A-Za-z0-9_./\-]+)/g;

function stripCodeBlocks(md) {
  return md
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]*`/g, '');
}

const args = process.argv.slice(2);
const targetIdx = args.indexOf('--target');
const targets = targetIdx >= 0 ? [args[targetIdx + 1]] : null;

const root = gitRoot();
const files = targets || walk(root, ['**/*.md']);

let violations = 0;
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const content = stripCodeBlocks(fs.readFileSync(file, 'utf-8'));
  let m;
  PATH_PAT.lastIndex = 0;
  while ((m = PATH_PAT.exec(content))) {
    let ref = m[1].replace(/[.,;:)\]]+$/, '');
    // Поддержка glob-паттернов: .../* считаем за каталог
    let check = ref;
    if (check.endsWith('/*')) check = check.slice(0, -2);
    const abs = path.join(root, check);
    if (!fs.existsSync(abs)) {
      violations++;
      fail('DEAD-REF', ref, { file: rel });
    }
  }
}

if (violations === 0) ok('DEAD-REF');
process.exit(violations === 0 ? 0 : 1);
