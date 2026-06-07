'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const { gitRoot } = require('../_lib/git-root');
const root = gitRoot();
const { buildFallbackContext } = require(path.join(root, '.claude/runtime/fallback-context.js'));
const profiles = require(path.join(root, '.claude/runtime/fallback-profiles.json'));

test('buildFallbackContext injects invariants + anchors for a known agent', () => {
  const ctx = buildFallbackContext('ccip-backend-core', profiles);
  assert.match(ctx, /Domain Bootstrap \(fallback for ccip-backend-core\)/);
  assert.match(ctx, /Invariants you MUST preserve/);
  assert.ok(ctx.length > 0);
});

test('buildFallbackContext returns empty string for an unknown agent', () => {
  assert.strictEqual(buildFallbackContext('no-such-agent', profiles), '');
  assert.strictEqual(buildFallbackContext(undefined, profiles), '');
});

test('each profile entry has invariants[] and domain_anchors[]', () => {
  for (const [agent, p] of Object.entries(profiles)) {
    assert.ok(Array.isArray(p.invariants) && p.invariants.length > 0, `${agent}.invariants`);
    assert.ok(Array.isArray(p.domain_anchors), `${agent}.domain_anchors`);
  }
});

test('dag schema accepts an optional fallback_for on a step', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const schema = JSON.parse(fs.readFileSync(path.join(root, 'docs/schemas/session-state.schema.json'), 'utf-8'));
  ajv.addSchema(JSON.parse(fs.readFileSync(path.join(root, 'docs/schemas/intents.json'), 'utf-8')), 'intents.json');
  const validate = ajv.compile(schema);
  const state = { session_id: '2026-01-01-1200', task: 't', intents: [], risk: 'LOW',
    confidence: 'HIGH', routing: 'planner', status: 'executing', started_at: '',
    dag: [{ step: 1, agent: 'general-purpose', status: 'pending', fallback_for: 'ccip-backend-core' }] };
  assert.equal(validate(state), true, JSON.stringify(validate.errors));
});
