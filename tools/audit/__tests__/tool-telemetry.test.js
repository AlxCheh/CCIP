'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const HOOK = path.join(root, '.claude/runtime/tool-telemetry.js');
const { extractTarget, isFullRead, buildEvent } = require(HOOK);

test('isFullRead true when Read has no offset/limit', () => {
  assert.strictEqual(isFullRead({ tool_name: 'Read', tool_input: { file_path: 'a.md' } }), true);
  assert.strictEqual(isFullRead({ tool_name: 'Read', tool_input: { file_path: 'a.md', limit: 10 } }), false);
  assert.strictEqual(isFullRead({ tool_name: 'Read', tool_input: { file_path: 'a.md', offset: 5 } }), false);
  assert.strictEqual(isFullRead({ tool_name: 'Bash', tool_input: { command: 'ls' } }), false);
});

test('extractTarget returns file path or command head', () => {
  assert.strictEqual(extractTarget({ tool_name: 'Read', tool_input: { file_path: '/x/a.md' } }), '/x/a.md');
  assert.match(extractTarget({ tool_name: 'Bash', tool_input: { command: 'node foo.js --bar' } }), /^node foo\.js/);
  assert.match(extractTarget({ tool_name: 'Grep', tool_input: { pattern: 'needle' } }), /needle/);
});

test('buildEvent shape conforms to schema fields', () => {
  const ev = buildEvent({ tool_name: 'Read', tool_input: { file_path: 'a.md' },
    tool_response: { content: 'x' } }, 'sess-1');
  for (const k of ['ts', 'session', 'tool', 'target', 'bytes', 'full_read', 'outcome'])
    assert.ok(k in ev, `event missing ${k}`);
  assert.strictEqual(ev.session, 'sess-1');
  assert.strictEqual(ev.tool, 'Read');
  assert.strictEqual(ev.full_read, true);
  assert.strictEqual(ev.outcome, 'ok');
});

test('buildEvent marks error outcome on tool error', () => {
  const ev = buildEvent({ tool_name: 'Bash', tool_input: { command: 'false' },
    tool_response: { is_error: true } }, 'sess-1');
  assert.strictEqual(ev.outcome, 'error');
});

test('event schema validates a built event', () => {
  const Ajv2020 = require('ajv/dist/2020');
  const addFormats = require('ajv-formats');
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const schema = JSON.parse(fs.readFileSync(
    path.join(root, 'docs/schemas/event.schema.json'), 'utf-8'));
  const validate = ajv.compile(schema);
  const ev = buildEvent({ tool_name: 'Read', tool_input: { file_path: 'a.md' },
    tool_response: { content: 'x' } }, 'sess-1');
  assert.equal(validate(ev), true, JSON.stringify(validate.errors));
});
