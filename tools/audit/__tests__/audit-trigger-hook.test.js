'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const { validateTriggerState, defaultState } = require('../../../.claude/runtime/audit-trigger-hook');

test('SPOF-3: validateTriggerState returns state unchanged when all required fields present', () => {
  const st = {
    session_id: 'test-session',
    total_calls: 5,
    turn_index: 2,
    tool_calls_this_turn: 1,
  };
  const result = validateTriggerState(st, 'test-session');
  assert.strictEqual(result, st, 'should return the same state object reference');
});

test('SPOF-3: validateTriggerState returns defaultState and logs to stderr when required fields are missing', () => {
  const corrupt = { session_id: 'test-session' }; // missing total_calls, turn_index, tool_calls_this_turn
  const chunks = [];
  const orig = process.stderr.write.bind(process.stderr);
  process.stderr.write = (c) => { chunks.push(String(c)); return true; };
  let result;
  try {
    result = validateTriggerState(corrupt, 'test-session');
  } finally {
    process.stderr.write = orig;
  }
  assert.ok(chunks.some(c => c.includes('missing fields')), 'should log missing fields to stderr');
  assert.ok('total_calls' in result, 'defaultState must have total_calls');
  assert.ok('turn_index' in result, 'defaultState must have turn_index');
  assert.ok('tool_calls_this_turn' in result, 'defaultState must have tool_calls_this_turn');
});
