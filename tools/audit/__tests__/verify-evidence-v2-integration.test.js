const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { setupTmp, teardown, runHook, latestSession } = require('../_lib/run-evidence-hook');

function fixture(name) { return fs.readFileSync(path.join(__dirname, '..', '__fixtures__', name), 'utf-8'); }

// End-to-end coverage for the canonical v2 manifest (trust-split). The prompt
// now mandates manifest=invariants-v2; this guards the full run() path, not just
// the parseManifest unit test.
test('v2 manifest: verifies 1/1, no violations, surfaces self_declared keys', () => {
  const tmp = setupTmp();
  try {
    runHook(fixture('optimizer-output-v2-manifest.md'), tmp);
    const session = latestSession(tmp);
    assert.match(session, /evidence_rows_verified: 1\/1/);
    assert.match(session, /## VIOLATIONS\n\n_none_/);
    assert.match(session, /_self_declared \(NOT verified by hook\): .*preflight_tokens/);
    // D1 regression: bootstrap prose mentions the v2 schema keys
    // (machine_checked / self_declared) — must NOT trip the self-attest firewall.
    assert.doesNotMatch(session, /FIREWALL_SELF_ATTEST/);
  } finally { teardown(tmp); }
});
