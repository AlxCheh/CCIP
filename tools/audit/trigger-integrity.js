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

// Terminal fail for setup errors (manifest/CLAUDE.md unreadable — nothing to iterate).
function failFast(msg) {
  console.log(`[TRIGGER-INTEGRITY] FAIL: ${msg}`);
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf-8'));
} catch (e) {
  failFast(`cannot read manifest ${MANIFEST}: ${e.message}`);
}

let claudeMd;
try {
  claudeMd = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf-8');
} catch (e) {
  failFast(`cannot read CLAUDE.md: ${e.message}`);
}

const failures = [];
for (const inv of manifest.invariants || []) {
  // (a) doc_anchor must appear in CLAUDE.md
  if (!claudeMd.includes(inv.doc_anchor)) {
    failures.push(`${inv.id}: doc_anchor "${inv.doc_anchor}" not found in CLAUDE.md`);
    continue;
  }

  // (b)+(c) enforcement = file#MARKER — file exists in runtime, marker present in it
  const [file, marker] = String(inv.enforcement).split('#');
  const p = path.join(RUNTIME, file);
  if (!fs.existsSync(p)) {
    failures.push(`${inv.id}: enforcement file missing — .claude/runtime/${file}`);
    continue;
  }
  try {
    const content = fs.readFileSync(p, 'utf-8');
    if (!content.includes(marker))
      failures.push(`${inv.id}: enforcement marker "${marker}" not found in ${file}`);
  } catch (e) {
    failures.push(`${inv.id}: enforcement file unreadable: ${e.message}`);
  }
}

if (failures.length) {
  for (const m of failures) console.log(`[TRIGGER-INTEGRITY] FAIL: ${m}`);
  process.exit(1);
}
console.log('[TRIGGER-INTEGRITY] OK');
process.exit(0);
