'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const { sanitizeHandoff } = require(path.join(root, '.claude/runtime/execute-dag.js'));

test('sanitizeHandoff still exported after context-warn changes', () => {
  assert.strictEqual(typeof sanitizeHandoff, 'function');
});
