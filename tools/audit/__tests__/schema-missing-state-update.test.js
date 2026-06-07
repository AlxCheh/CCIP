'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const schema = require(path.join(root, 'docs/schemas/session-state.schema.json'));

test('observation schema sanctions optional missing_state_update:boolean', () => {
  const props = schema.properties.observations.items.properties;
  assert.ok(props.missing_state_update, 'field must be declared in schema');
  assert.strictEqual(props.missing_state_update.type, 'boolean');
  // Field must be optional (not in required) for backward compatibility.
  const required = schema.properties.observations.items.required || [];
  assert.ok(!required.includes('missing_state_update'), 'field must be optional');
  // additionalProperties:false → field MUST be declared or observations would fail.
  assert.strictEqual(schema.properties.observations.items.additionalProperties, false);
});
