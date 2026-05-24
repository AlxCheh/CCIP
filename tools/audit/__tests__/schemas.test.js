const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const matter = require('gray-matter');
const { gitRoot } = require('../_lib/git-root');

function makeAjv() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  return ajv;
}

test('agent-frontmatter schema is valid Draft 2020-12', () => {
  const ajv = makeAjv();
  const root = gitRoot();
  const schema = JSON.parse(fs.readFileSync(
    path.join(root, 'docs/schemas/agent-frontmatter.schema.json'), 'utf-8'));
  const compile = () => ajv.compile(schema);
  assert.doesNotThrow(compile);
});

test('agent-frontmatter schema validates ccip-architect.md', () => {
  const ajv = makeAjv();
  const root = gitRoot();
  const schema = JSON.parse(fs.readFileSync(
    path.join(root, 'docs/schemas/agent-frontmatter.schema.json'), 'utf-8'));
  const validate = ajv.compile(schema);
  const fm = matter(fs.readFileSync(
    path.join(root, '.claude/agents/ccip-architect.md'), 'utf-8')).data;
  assert.equal(validate(fm), true, JSON.stringify(validate.errors));
});

test('session-state schema validates the empty skeleton', () => {
  const ajv = makeAjv();
  const root = gitRoot();
  const schema = JSON.parse(fs.readFileSync(
    path.join(root, 'docs/schemas/session-state.schema.json'), 'utf-8'));
  const intentsSchema = JSON.parse(fs.readFileSync(
    path.join(root, 'docs/schemas/intents.json'), 'utf-8'));
  ajv.addSchema(intentsSchema, 'intents.json');
  const validate = ajv.compile(schema);
  const state = JSON.parse(fs.readFileSync(
    path.join(root, '.claude/runtime/session-state.json'), 'utf-8'));
  assert.equal(validate(state), true, JSON.stringify(validate.errors));
});
