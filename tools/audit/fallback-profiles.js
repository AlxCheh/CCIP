#!/usr/bin/env node
'use strict';
// RFC R8 — validates that every fallback profile's domain_anchors resolve to real files.
const fs = require('fs');
const path = require('path');
const { gitRoot } = require('./_lib/git-root');
const root = gitRoot();
const FILE = process.env.CCIP_FALLBACK_PROFILES_FILE
  || path.join(root, '.claude/runtime/fallback-profiles.json');

function fail(msg) { console.log(`[FALLBACK-PROFILES] FAIL: ${msg}`); process.exit(1); }

let profiles;
try { profiles = JSON.parse(fs.readFileSync(FILE, 'utf-8')); }
catch (e) { fail(`cannot read ${FILE}: ${e.message}`); }

for (const [agent, p] of Object.entries(profiles)) {
  for (const anchor of (p.domain_anchors || [])) {
    const file = String(anchor).split('#')[0];
    if (!fs.existsSync(path.join(root, file)))
      fail(`${agent}: domain_anchor file missing — ${file}`);
  }
}
console.log('[FALLBACK-PROFILES] OK');
process.exit(0);
