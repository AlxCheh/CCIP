// Node test runner (built-in node:test). Запускается через `node --test tools/audit/__tests__`.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { gitRoot } = require('../_lib/git-root');
const { walk } = require('../_lib/walk');
const { atomicWriteJson } = require('../_lib/atomic-fs');
const { fail, ok } = require('../_lib/report');

test('gitRoot returns repo root containing CLAUDE.md', () => {
  const root = gitRoot();
  assert.ok(fs.existsSync(path.join(root, 'CLAUDE.md')), `expected CLAUDE.md at ${root}`);
});

test('walk respects .gitignore (no node_modules)', () => {
  const root = gitRoot();
  const files = walk(root, ['**/*.md']);
  const offenders = files.filter(f => f.includes('node_modules'));
  assert.deepEqual(offenders, [], 'walk must skip node_modules');
});

test('atomicWriteJson writes tmp→rename and fsyncs', () => {
  const root = gitRoot();
  const tmpPath = path.join(root, 'tools/audit/__fixtures__/_atomic-test.json');
  atomicWriteJson(tmpPath, { a: 1 });
  const content = JSON.parse(fs.readFileSync(tmpPath, 'utf-8'));
  assert.deepEqual(content, { a: 1 });
  fs.unlinkSync(tmpPath);
});

test('report.fail formats stderr line', () => {
  const out = fail('TEST-01', 'sample message', { path: 'foo' });
  assert.match(out, /TEST-01/);
  assert.match(out, /sample message/);
});

test('report.ok returns true', () => {
  assert.equal(ok('TEST-01'), true);
});
