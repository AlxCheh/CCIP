#!/usr/bin/env node
'use strict';
// Кросс-OS runner для audit-lib тестов: enumerates *.test.js в __tests__/
// и передаёт явный список в node:test. Не зависит от glob-поддержки в CLI
// (Node 20 не разворачивает `**/*.test.js`, Node 24 трактует <dir> как module).

const fs = require('node:fs');
const path = require('node:path');
const { run } = require('node:test');
const { spec } = require('node:test/reporters');

const dir = path.join(__dirname, '__tests__');
const files = fs.readdirSync(dir)
  .filter(f => f.endsWith('.test.js'))
  .map(f => path.join(dir, f));

let failed = 0;
// M-1: `concurrency: false` is LOAD-BEARING, not a perf knob. Several hook tests share
// singleton fixtures (.claude/runtime/session-state.json, trigger-state.json, audit/rules/*)
// via backup/restore; running files in parallel makes them clobber each other → non-
// deterministic green. Do NOT flip this to true without first isolating every test that
// writes a shared runtime file to a tmp path (CCIP_STATE_FILE et al.). Guarded by
// run-tests-guard.test.js. See cert 2026-06-10 §IX (M-1).
run({ files, concurrency: false })
  .on('test:fail', () => { failed++; })
  .compose(spec)
  .pipe(process.stdout)
  .on('finish', () => {
    process.exit(failed === 0 ? 0 : 1);
  });
