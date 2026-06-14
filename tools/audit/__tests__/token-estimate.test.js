'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { nonAsciiRatio, estimateTokens } = require('../_lib/token-estimate');

test('nonAsciiRatio: 0 for pure ASCII, ~1 for pure Cyrillic, half for mix', () => {
  assert.strictEqual(nonAsciiRatio('hello world'), 0);
  assert.strictEqual(nonAsciiRatio(''), 0);
  assert.strictEqual(nonAsciiRatio('абвг'), 1);
  assert.strictEqual(nonAsciiRatio('ab вг'), 0.4); // 2 non-ascii of 5 chars
});

test('estimateTokens: ASCII uses K_ASCII=4, zero bytes → 0', () => {
  assert.strictEqual(estimateTokens(0, 0), 0);
  assert.strictEqual(estimateTokens(4000, 0), 1000); // 4000 / 4
});

test('estimateTokens: Cyrillic packs more tokens per byte (smaller divisor)', () => {
  // r=1 → K_CYR=3 → 3000/3 = 1000; ASCII same bytes → 3000/4 = 750
  assert.strictEqual(estimateTokens(3000, 1), 1000);
  assert.ok(estimateTokens(3000, 1) > estimateTokens(3000, 0),
    'Cyrillic estimate must exceed ASCII for identical byte volume');
});

test('estimateTokens: ratio clamped to [0,1]; opts override divisors', () => {
  assert.strictEqual(estimateTokens(1000, 5), estimateTokens(1000, 1)); // clamp high
  assert.strictEqual(estimateTokens(1000, -3), estimateTokens(1000, 0)); // clamp low
  assert.strictEqual(estimateTokens(1000, 0, { kAscii: 2 }), 500);       // override
});
