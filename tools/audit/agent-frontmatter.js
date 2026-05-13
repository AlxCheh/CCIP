#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const matter = require('gray-matter');
const Ajv2020 = require('ajv/dist/2020');
const { gitRoot } = require('./_lib/git-root');
const { walk } = require('./_lib/walk');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
const schema = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/schemas/agent-frontmatter.schema.json'), 'utf-8'));
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

const files = walk(root, ['.claude/agents/*.md']);
let violations = 0;
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const fm = matter(fs.readFileSync(file, 'utf-8')).data;
  const expectedName = path.basename(file, '.md');
  if (fm.name !== expectedName) {
    fail('AGENT-FM', `name mismatch: fm.name=${fm.name} expected=${expectedName}`, { file: rel });
    violations++;
  }
  if (!validate(fm)) {
    fail('AGENT-FM', `schema: ${JSON.stringify(validate.errors)}`, { file: rel });
    violations++;
  }
}

if (violations === 0) ok('AGENT-FM');
process.exit(violations === 0 ? 0 : 1);
