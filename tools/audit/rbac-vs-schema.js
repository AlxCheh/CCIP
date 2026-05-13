#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { walk } = require('./_lib/walk');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
const schema = fs.readFileSync(path.join(root, 'packages/database/prisma/schema.prisma'), 'utf-8');

const enumMatch = schema.match(/enum\s+UserRole\s*\{([^}]+)\}/);
if (!enumMatch) {
  fail('RBAC-SCHEMA', 'enum UserRole not found in schema.prisma');
  process.exit(1);
}
const validRoles = new Set(
  enumMatch[1]
    .split('\n')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('@@') && !s.startsWith('//'))
);

const SUSPECTS = ['supervisor', 'contractor', 'manager', 'operator', 'owner'];

const files = [
  ...walk(root, ['.claude/agents/*.md']),
  ...walk(root, ['docs/decisions/ADR-*.md']),
  ...walk(root, ['docs/architecture/*.md']),
  ...walk(root, ['apps/api/src/**/*.ts']),
];

let violations = 0;
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const raw = fs.readFileSync(file, 'utf-8');
  // Strip YAML frontmatter from markdown to avoid matching agent-name slugs
  const c = file.endsWith('.md')
    ? raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
    : raw;
  for (const sus of SUSPECTS) {
    if (validRoles.has(sus)) continue;
    const re = new RegExp(`\\b${sus}\\b`, 'g');
    const m = c.match(re);
    if (m) {
      violations += m.length;
      fail('RBAC-SCHEMA', `phantom role "${sus}" (not in UserRole enum)`, { file: rel, count: m.length });
    }
  }
}

if (violations === 0) ok('RBAC-SCHEMA');
process.exit(violations === 0 ? 0 : 1);
