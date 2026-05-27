#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
let violations = 0;

// settings.local.json — per-machine (gitignored с 3d1003c). На CI его нет —
// нечего проверять, проверка execute-dag.js ниже всё равно выполняется.
const settingsPath = process.env.CCIP_SETTINGS_LOCAL_PATH
  || path.join(root, '.claude/settings.local.json');
if (fs.existsSync(settingsPath)) {
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  const allow = settings.permissions?.allow || [];
  for (const p of allow) {
    if (/rm\s+-rf|chmod\s+777|sudo\b/.test(p)) {
      fail('PEN-SMOKE', `dangerous pattern in allowlist: ${p}`);
      violations++;
    }
  }
}

const dagPath = path.join(root, '.claude/runtime/execute-dag.js');
const dag = fs.readFileSync(dagPath, 'utf-8');
if (!/sanitizeHandoff\s*\(/.test(dag)) {
  fail('PEN-SMOKE', 'sanitizeHandoff() not found in execute-dag.js');
  violations++;
}

if (violations === 0) ok('PEN-SMOKE');
process.exit(violations === 0 ? 0 : 1);
