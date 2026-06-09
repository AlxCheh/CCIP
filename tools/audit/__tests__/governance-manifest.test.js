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
  path.join(root, 'docs/schemas/governance-manifest.schema.json'), 'utf-8'));
const manifest = JSON.parse(fs.readFileSync(
  path.join(root, '.claude/runtime/governance-manifest.json'), 'utf-8'));

function makeAjv() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  return ajv;
}

test('manifest schema requires id/claim/doc_anchor/enforcement/kind/status', () => {
  const req = schema.properties.invariants.items.required;
  for (const f of ['id', 'claim', 'doc_anchor', 'enforcement', 'kind', 'status'])
    assert.ok(req.includes(f), `${f} must be required`);
});

test('manifest schema is valid Draft 2020-12', () => {
  const ajv = makeAjv();
  assert.doesNotThrow(() => ajv.compile(schema));
});

test('seed manifest validates against schema', () => {
  const ajv = makeAjv();
  const validate = ajv.compile(schema);
  assert.equal(validate(manifest), true, JSON.stringify(validate.errors));
  assert.ok(manifest.invariants.length >= 1, 'seed must have at least one invariant');
  for (const inv of manifest.invariants)
    assert.match(inv.enforcement, /^[\w.-]+#[\w-]+$/, `enforcement = file#MARKER, got ${inv.enforcement}`);
});

test('each enforcement anchor exists as [MARKER] comment in the target runtime file', () => {
  const runtimeDir = path.join(root, '.claude/runtime');
  for (const inv of manifest.invariants) {
    const [file, marker] = inv.enforcement.split('#');
    if (!file || !marker) continue;
    const filePath = path.join(runtimeDir, file);
    assert.ok(
      fs.existsSync(filePath),
      `enforcement file missing: .claude/runtime/${file} (invariant ${inv.id})`
    );
    const content = fs.readFileSync(filePath, 'utf-8');
    assert.ok(
      content.includes(`[${marker}]`),
      `${file} does not contain marker [${marker}] required by invariant ${inv.id}`
    );
  }
});
