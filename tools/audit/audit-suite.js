#!/usr/bin/env node
'use strict';
// Запускает все audits в фиксированном порядке. Exit 0 если все green, 1 иначе.
// Каждая фаза — массив скриптов; фаза падает целиком если любой скрипт упал,
// но остальные фазы всё равно выполняются (full report > fast exit).

const path = require('node:path');
const cp = require('node:child_process');

const PHASES = {
  '§10.1 Contract integrity': [
    'path-canonical.js',
    'section-anchors.js',
    'dead-refs.js',
    'agent-name-presence.js',
    'state-contract-section.js',
    'phantom-section-refs.js',
  ],
  '§10.2 Schema integrity': [
    'agent-frontmatter.js',
    'session-state.js',
    'adr-anchors.js',
    'rbac-vs-schema.js',
    'audit-rules.js',
  ],
  '§10.5 Security posture': [
    'allowlist-literal.js',
    'pen-test-smoke.js',
  ],
  '§10.6 Governance': [
    'adr-immutability.js',
    'changelog-presence.js',
  ],
  '§10.7 Documentation truth': [
    'orphan-adrs.js',
    'orphan-dirs.js',
    'delivery-paths.js',
    'memory-fs-sync.js',
  ],
};

const HERE = __dirname;
let failed = 0;
let total = 0;

for (const [phase, scripts] of Object.entries(PHASES)) {
  process.stdout.write(`\n=== ${phase} ===\n`);
  for (const script of scripts) {
    total++;
    const full = path.join(HERE, script);
    const res = cp.spawnSync(process.execPath, [full, ...process.argv.slice(2)], {
      stdio: 'inherit',
    });
    if (res.status !== 0) {
      failed++;
      process.stderr.write(`[audit-suite] FAIL: ${script}\n`);
    }
  }
}

process.stdout.write(`\n=== Summary: ${total - failed}/${total} passed ===\n`);
process.exit(failed === 0 ? 0 : 1);
