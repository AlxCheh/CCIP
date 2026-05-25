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
