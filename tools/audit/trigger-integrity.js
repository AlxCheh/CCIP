#!/usr/bin/env node
'use strict';
// Semantic audit (RFC R1): доказывает, что каждый инвариант governance-manifest.json
// имеет реальный enforcement-anchor в коде и doc_anchor в CLAUDE.md.
// Forward-валидация (manifest → код/доки). Reverse-направление (claim из CLAUDE.md
// без manifest) — вне scope этого audit, см. RFC Phase 3.

const fs = require('fs');
const path = require('path');
const { gitRoot } = require('./_lib/git-root');

const root = gitRoot();
const MANIFEST = process.env.CCIP_MANIFEST_FILE
  || path.join(root, '.claude/runtime/governance-manifest.json');
const RUNTIME = path.join(root, '.claude/runtime');

function fail(msg) {
  console.log(`[TRIGGER-INTEGRITY] FAIL: ${msg}`);
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf-8'));
} catch (e) {
  fail(`cannot read manifest ${MANIFEST}: ${e.message}`);
}

let claudeMd;
try {
  claudeMd = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf-8');
} catch (e) {
  fail(`cannot read CLAUDE.md: ${e.message}`);
}

for (const inv of manifest.invariants || []) {
  // (a) doc_anchor must appear in CLAUDE.md
  if (!claudeMd.includes(inv.doc_anchor))
    fail(`${inv.id}: doc_anchor "${inv.doc_anchor}" not found in CLAUDE.md`);

  // (b)+(c) enforcement = file#MARKER — file exists in runtime, marker present in it
  const [file, marker] = String(inv.enforcement).split('#');
  const p = path.join(RUNTIME, file);
  if (!fs.existsSync(p))
    fail(`${inv.id}: enforcement file missing — .claude/runtime/${file}`);
  if (!fs.readFileSync(p, 'utf-8').includes(marker))
    fail(`${inv.id}: enforcement marker "${marker}" not found in ${file}`);
}

console.log('[TRIGGER-INTEGRITY] OK');
process.exit(0);
