'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');
const root = gitRoot();

let yaml;
try { yaml = require('js-yaml'); } catch { yaml = null; }

const { incrementQuarantineCounters } = require(path.join(root, '.claude/runtime/quarantine-increment.js'));

function writeTmpYaml(doc) {
  if (!yaml) return null;
  const file = path.join(os.tmpdir(), `quarantine-${Date.now()}.yaml`);
  fs.writeFileSync(file, yaml.dump(doc), 'utf-8');
  return file;
}

test('increments sessions_in_quarantine for eligible rules', { skip: !yaml }, () => {
  const doc = {
    version: 1,
    quarantine: [
      { id: 'R-TEST-1', status: 'quarantine', requires_transcript_access: false,
        sessions_in_quarantine: 2, hit_count: 1, precision: 0.8 },
      { id: 'R-TEST-2', status: 'quarantine', requires_transcript_access: true,
        sessions_in_quarantine: 0, hit_count: 0, precision: null },
    ]
  };
  const file = writeTmpYaml(doc);
  try {
    const ok = incrementQuarantineCounters(file);
    assert.ok(ok, 'should return true when changed');
    const after = yaml.load(fs.readFileSync(file, 'utf-8'));
    assert.strictEqual(after.quarantine[0].sessions_in_quarantine, 3, 'eligible rule incremented');
    assert.strictEqual(after.quarantine[1].sessions_in_quarantine, 0, 'transcript-blocked rule unchanged');
  } finally { fs.rmSync(file, { force: true }); }
});

test('returns false and does not crash when js-yaml absent', () => {
  assert.doesNotThrow(() => {
    require(path.join(root, '.claude/runtime/quarantine-increment.js'));
  });
});
