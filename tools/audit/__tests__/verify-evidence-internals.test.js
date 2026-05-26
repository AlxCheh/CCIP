const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

const mod = require(path.join(gitRoot(), '.claude/runtime/verify-evidence-log.js'));

test('hook exports internals for unit testing', () => {
  for (const fn of ['extractManifestBlock', 'parseManifest', 'parseEvidenceRows', 'verifyRowSource', 'bootstrapFirewall']) {
    assert.strictEqual(typeof mod[fn], 'function', `${fn} must be exported`);
  }
});

test('anchorWindow: heading window bounds the slice to the section', () => {
  const content = [
    '# Top', 'intro line',
    '## Section A', 'alpha body', 'NEEDLE-A',
    '## Section B', 'beta body', 'NEEDLE-B',
  ].join('\n');
  const winA = mod.anchorWindow(content, '## Section A');
  assert.ok(winA.includes('NEEDLE-A'), 'window A contains its own needle');
  assert.ok(!winA.includes('NEEDLE-B'), 'window A must NOT leak into Section B');
});

test('anchorWindow: literal locator falls back to ±window', () => {
  const content = 'x'.repeat(500) + ' LOCATOR ' + 'y'.repeat(500);
  const win = mod.anchorWindow(content, 'LOCATOR');
  assert.ok(win.includes('LOCATOR'));
  assert.ok(win.length < content.length, 'literal window is narrower than whole file');
});

test('anchorWindow: unknown anchor returns null', () => {
  assert.strictEqual(mod.anchorWindow('## Real\nbody', 'no-such-anchor-xyz'), null);
});
