#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
const md = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf-8');

// Принимаем оба варианта: "## §15" или "## 15."
const headOk = /^##\s+(?:§15\b|15\.)/m.test(md);
if (!headOk) {
  fail('STATE-CONTRACT', '§15 State Contract section missing in CLAUDE.md');
  process.exit(1);
}

// Внутри §15 должны быть: упоминание session-state.json и блока "## State Update"
const sectionStart = md.search(/^##\s+(?:§15\b|15\.)/m);
const sectionEnd = md.indexOf('\n## ', sectionStart + 1);
const section = md.slice(sectionStart, sectionEnd > 0 ? sectionEnd : md.length);

const required = [
  { pat: /session-state\.json/i,        why: 'reference to session-state.json' },
  { pat: /State\s*Update/i,             why: 'mention of "## State Update" block' },
  { pat: /session-state\.schema\.json/i, why: 'reference to session-state.schema.json' },
];

let violations = 0;
for (const r of required) {
  if (!r.pat.test(section)) {
    violations++;
    fail('STATE-CONTRACT', `§15 missing: ${r.why}`);
  }
}

if (violations === 0) ok('STATE-CONTRACT');
process.exit(violations === 0 ? 0 : 1);
