const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const PROMPT = path.join(root, '.claude/agents/ccip-session-optimizer.md');
const MAP = path.join(root, '.claude/runtime/ccip-session-optimizer.extraction-map.md');

test('token-economy: prompt carries no inline skill-extraction markers', () => {
  const src = fs.readFileSync(PROMPT, 'utf-8');
  const markers = src.match(/<!--\s*(portable|config|project)[\s:]/g) || [];
  assert.strictEqual(markers.length, 0, `found ${markers.length} inline markers; move them to the extraction-map`);
});

test('token-economy: extraction-map side-car exists', () => {
  assert.ok(fs.existsSync(MAP), 'extraction-map.md must capture marker boundaries');
});
