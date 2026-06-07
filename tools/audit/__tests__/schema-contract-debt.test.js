'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const schema = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/schemas/session-state.schema.json'), 'utf-8'));

test('schema declares optional contract_debt:integer and governance_alerts:array', () => {
  const props = schema.properties;
  assert.strictEqual(props.contract_debt.type, 'integer');
  assert.strictEqual(props.governance_alerts.type, 'array');
  const req = schema.required || [];
  assert.ok(!req.includes('contract_debt'), 'contract_debt must be optional');
  assert.ok(!req.includes('governance_alerts'), 'governance_alerts must be optional');
});

test('schema validates a state carrying contract_debt + an alert', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  ajv.addSchema(JSON.parse(fs.readFileSync(
    path.join(root, 'docs/schemas/intents.json'), 'utf-8')), 'intents.json');
  const validate = ajv.compile(schema);
  const state = {
    session_id: '2026-01-01-1200', task: 't', intents: [], risk: 'LOW',
    confidence: 'HIGH', routing: 'direct', status: 'executing', started_at: '',
    contract_debt: 2,
    governance_alerts: [{ kind: 'state_contract_degraded', at: '2026-01-01T12:00:00.000Z', debt: 2, agent: 'ccip-architect' }],
  };
  assert.equal(validate(state), true, JSON.stringify(validate.errors));
});
