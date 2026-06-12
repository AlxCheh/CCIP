const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');
const { isContractExempt, CONTRACT_EXEMPT } = require(path.join(gitRoot(), '.claude/runtime/contract-exempt.js'));

test('relay agents are exempt from INV-STATE-CONTRACT', () => {
  assert.ok(isContractExempt('ccip-session-optimizer'), 'session-optimizer relays verbatim, emits no State Update by design');
});

test('regular agents are NOT exempt', () => {
  assert.ok(!isContractExempt('ccip-backend-core'));
  assert.ok(!isContractExempt('red-team-auditor'));
});

test('exempt list is explicit and documented (no silent wildcard)', () => {
  assert.ok(Array.isArray(CONTRACT_EXEMPT) && CONTRACT_EXEMPT.length >= 1);
  assert.ok(CONTRACT_EXEMPT.every(e => typeof e === 'string'));
});
