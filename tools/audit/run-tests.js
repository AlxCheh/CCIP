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
run({ files, concurrency: false })
  .on('test:fail', () => { failed++; })
  .compose(spec)
  .pipe(process.stdout)
  .on('finish', () => {
    process.exit(failed === 0 ? 0 : 1);
  });
