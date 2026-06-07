#!/usr/bin/env node
'use strict';
// RFC R9 — Runtime Governance Score (advisory). Deterministic governance sub-metrics
// from the manifest: EC (enforcement coverage) + TI (trigger integrity). Always exit 0;
// hard-fail on threshold is a separate Breaking Change.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { gitRoot } = require('./_lib/git-root');
const root = gitRoot();

function computeEC(manifest) {
  const inv = manifest.invariants || [];
  if (inv.length === 0) return 1;
  const enforced = inv.filter(i => i.kind === 'block' || i.kind === 'signal').length;
  return Number((enforced / inv.length).toFixed(2));
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(
    path.join(root, '.claude/runtime/governance-manifest.json'), 'utf-8'));
  const ec = computeEC(manifest);
  const ti = cp.spawnSync(process.execPath, [path.join(root, 'tools/audit/trigger-integrity.js')],
    { cwd: root }).status === 0 ? 1 : 0;
  // Composite of the two deterministic governance axes (equal weight).
  const rgs = Number(((ec + ti) / 2).toFixed(2));
  console.log(`[RGS] governance-static=${rgs} (EC=${ec} TI=${ti}) — advisory`);
  process.exit(0);
}

if (require.main === module) main();
module.exports = { computeEC };
