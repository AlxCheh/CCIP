#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const { gitRoot } = require('./_lib/git-root');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
const schema = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/schemas/session-state.schema.json'), 'utf-8'));
const intentsSchema = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/schemas/intents.json'), 'utf-8'));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
// Register intents.json under its $id AND under the relative path used by $ref.
ajv.addSchema(intentsSchema, 'intents.json');
const validate = ajv.compile(schema);

const stateFile = path.join(root, '.claude/runtime/session-state.json');
if (!fs.existsSync(stateFile)) {
  fail('SESSION-STATE', 'session-state.json missing');
  process.exit(1);
}

let state;
try {
  state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
} catch (e) {
  fail('SESSION-STATE', `invalid JSON: ${e.message}`);
  process.exit(1);
}

if (!validate(state)) {
  fail('SESSION-STATE', `schema: ${JSON.stringify(validate.errors)}`);
  process.exit(1);
}

// Fixture regression — guarantees the schema discriminates known-good vs known-bad.
const fixtures = [
  ['session-state-good.json', true],
  ['session-state-bad.json', false],
];
for (const [name, mustPass] of fixtures) {
  const f = path.join(root, 'tools/audit/__fixtures__', name);
  const obj = JSON.parse(fs.readFileSync(f, 'utf-8'));
  const valid = validate(obj);
  if (valid !== mustPass) {
    fail('SESSION-STATE', `fixture ${name}: expected valid=${mustPass}, got ${valid} (errors=${JSON.stringify(validate.errors)})`);
    process.exit(1);
  }
}

ok('SESSION-STATE');
process.exit(0);
