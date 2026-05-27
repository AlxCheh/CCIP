#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { fail, ok } = require('./_lib/report');

const args = process.argv.slice(2);
const sIdx = args.indexOf('--settings');
const explicit = sIdx >= 0;
const settingsPath = explicit
  ? args[sIdx + 1]
  : (process.env.CCIP_SETTINGS_LOCAL_PATH || path.join(gitRoot(), '.claude/settings.local.json'));

// settings.local.json — per-machine (gitignored с 3d1003c). На чистом checkout
// файла нет → нечего валидировать → skip-with-ok. Явный --settings обязан существовать.
if (!explicit && !fs.existsSync(settingsPath)) {
  process.stdout.write('[ALLOWLIST] OK (settings.local.json absent — per-machine, nothing to check)\n');
  process.exit(0);
}

const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
const allow = settings.permissions?.allow || [];

// Catch wildcard suffix inside Bash(...) — e.g. "Bash(git add *)", "Bash(... ' *)" —
// and the pure catch-all "Bash(*)". Whitespace + "*)" at end is the generic shell-glob marker.
const SUFFIX_GLOB = /\s\*\)$/;
const PURE_GLOB = /^Bash\(\*\)$/;

let violations = 0;
for (const pattern of allow) {
  if (SUFFIX_GLOB.test(pattern) || PURE_GLOB.test(pattern)) {
    fail('ALLOWLIST', `wildcard suffix: ${pattern}`);
    violations++;
  }
}

if (violations === 0) ok('ALLOWLIST');
process.exit(violations === 0 ? 0 : 1);
