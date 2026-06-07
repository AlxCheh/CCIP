'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');
const root = gitRoot();

test('audit-suite registers rgs.js', () => {
  const src = fs.readFileSync(path.join(root, 'tools/audit/audit-suite.js'), 'utf-8');
  assert.match(src, /rgs\.js/);
});
