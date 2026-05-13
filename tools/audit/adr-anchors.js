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
  path.join(root, 'docs/schemas/adr-frontmatter.schema.json'), 'utf-8'));
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

const adrs = walk(root, ['docs/decisions/ADR-*.md']);

let violations = 0;
for (const file of adrs) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const fm = matter(fs.readFileSync(file, 'utf-8')).data;
  if (!validate(fm)) {
    fail('ADR-SCHEMA', `frontmatter invalid: ${JSON.stringify(validate.errors)}`, { file: rel });
    violations++;
    continue;
  }
  for (const anchor of fm.impl_anchors) {
    const clean = anchor.endsWith('/') ? anchor.slice(0, -1) : anchor;
    const abs = path.join(root, clean);
    if (!fs.existsSync(abs)) {
      fail('ADR-ANCHOR', `${anchor} does not exist`, { file: rel });
      violations++;
    }
  }
}

if (violations === 0) ok('ADR-ANCHOR');
process.exit(violations === 0 ? 0 : 1);
