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

// ── quote length: char-aware specificity + byte ceiling (anti-bloat) ────────────
// verifyRowSource checks length BEFORE resolving the source file, so a non-existent
// repo: path isolates the length gate (it returns source_file_missing only AFTER
// passing length). Cyrillic corpus must not be penalised by raw byte counting.

test('Cyrillic quote ~100B but <80 chars passes the length gate (not quote_too_long)', () => {
  const quote = 'я'.repeat(50); // 50 chars, 100 bytes
  const res = mod.verifyRowSource({ source_file: 'repo:__no_such_file__.md', anchor: '## X', quote });
  assert.doesNotMatch(res.reason || '', /quote_too_long/, 'Cyrillic ≤80 chars must clear the length gate');
  assert.strictEqual(res.reason, 'source_file_missing', 'proceeds past length to file resolution');
});

test('quote over the char cap is rejected as quote_too_long(Nc)', () => {
  const quote = 'x'.repeat(81); // 81 chars, 81 bytes
  const res = mod.verifyRowSource({ source_file: 'repo:__no_such_file__.md', anchor: '## X', quote });
  assert.match(res.reason || '', /quote_too_long\(81c\)/, 'char overflow reported in chars');
});

test('quote over the byte ceiling (but <=char cap) is rejected as quote_too_long(NB)', () => {
  const quote = '😀'.repeat(41); // 41 code points, 164 bytes — under char cap, over byte ceiling
  const res = mod.verifyRowSource({ source_file: 'repo:__no_such_file__.md', anchor: '## X', quote });
  assert.match(res.reason || '', /quote_too_long\(164B\)/, 'byte ceiling reported in bytes');
});
