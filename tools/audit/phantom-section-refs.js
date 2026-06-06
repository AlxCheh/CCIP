#!/usr/bin/env node
'use strict';
/**
 * Checks that .claude/agents/*.md don't reference nonexistent CLAUDE.md §N.N
 * sections. Specifically looks for CLAUDE.md-context references (where CLAUDE.md
 * is explicitly mentioned or implied to be the target).
 *
 * Exclusions:
 * - Agent-internal sections (defined with ### §N within same file)
 * - References to other files (e.g., docs/concept_oks_v1_5.md §7)
 *
 * Audit C-02 (T-16).
 */
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
const AGENTS_DIR = path.join(root, '.claude/agents');
const CLAUDE_MD  = path.join(root, 'CLAUDE.md');

const claudeMd = fs.readFileSync(CLAUDE_MD, 'utf-8');

// Extract all explicitly declared §N sections from CLAUDE.md
// Matches "## §15 State Contract", "## §16 Reading Discipline", etc.
const declaredSections = new Set(
  [...claudeMd.matchAll(/^##\s+§(\d+[\.\d]*)/gm)].map(m => m[1])
);

let violations = 0;

// For each agent file, check which §N sections it DEFINES locally (with ### or ##)
const agentLocalSections = new Map();
for (const file of fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith('.md'))) {
  const filePath = path.join(AGENTS_DIR, file);
  const content = fs.readFileSync(filePath, 'utf-8');
  const localDefs = new Set(
    [...content.matchAll(/^#{2,3}\s+§(\d+[\.\d]*)/gm)].map(m => m[1])
  );
  agentLocalSections.set(file, localDefs);
}

// Check references that explicitly mention CLAUDE.md or are in description
for (const file of fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith('.md'))) {
  const filePath = path.join(AGENTS_DIR, file);
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const localDefs = agentLocalSections.get(file);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Pattern 1: Explicit "CLAUDE.md §N" (with or without dash/context)
    for (const m of line.matchAll(/CLAUDE\.md\s+§(\d+[\.\d]+)/g)) {
      const ref = m[1];
      if (!declaredSections.has(ref)) {
        fail('PHANTOM-REF', `CLAUDE.md §${ref} does not exist`, { file, line: i + 1 });
        violations++;
      }
    }

    // Pattern 2: In frontmatter description, "CLAUDE.md §N–§M" (range syntax)
    if (i <= 10) { // Only check frontmatter (first 10 lines)
      for (const m of line.matchAll(/CLAUDE\.md\s+§([\d\.]+)–§([\d\.]+)/g)) {
        const start = m[1];
        const end = m[2];
        if (!declaredSections.has(start)) {
          fail('PHANTOM-REF', `CLAUDE.md §${start}–§${end}: start not found`, { file, line: i + 1 });
          violations++;
        }
        if (!declaredSections.has(end)) {
          fail('PHANTOM-REF', `CLAUDE.md §${start}–§${end}: end not found`, { file, line: i + 1 });
          violations++;
        }
      }
    }
  }
}

if (violations === 0) ok('PHANTOM-REF');
process.exit(violations === 0 ? 0 : 1);
