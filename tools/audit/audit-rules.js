#!/usr/bin/env node
'use strict';
/**
 * audit-rules.js — целостность rule-файлов token-efficiency-auditor (ADR-016, Phase B).
 *
 * CI-сеть безопасности для self-learning: ловит порчу `.claude/audit/rules/*.yaml`
 * от мутаций (или ручных правок). Проверяет:
 *   G1  — baseline.yaml неизменён: SHA-256 (нормализованный по line-endings) == baseline.lock
 *   ID  — каждый rule.id матчит ^R-\d{3}$ и имеет status
 *   MEM — каждый id в active/quarantine/deprecated существует в baseline
 *   G4  — рабочие наборы не пересекаются (active ∩ quarantine ∩ deprecated = ∅)
 *   PART— каждое baseline-правило лежит ровно в одном рабочем наборе (ничего не потеряно)
 *
 * Bootstrap lock: `node tools/audit/audit-rules.js --write-lock` (однократно).
 * Exit 0 — OK; 1 — нарушения.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const matter = require('gray-matter');
const { gitRoot } = require('./_lib/git-root');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
const RULES    = path.join(root, '.claude/audit/rules');
const BASELINE = path.join(RULES, 'baseline.yaml');
const LOCK     = path.join(RULES, 'baseline.lock');

/** Parse a plain YAML file by wrapping it as gray-matter frontmatter (uses bundled js-yaml). */
function parseYaml(p) {
  return matter('---\n' + fs.readFileSync(p, 'utf-8') + '\n---\n').data;
}

/** Hash with normalized line endings — stable across LF/CRLF checkouts. */
function normHash(content) {
  return crypto.createHash('sha256').update(content.replace(/\r\n/g, '\n')).digest('hex');
}
function baselineHash() {
  return normHash(fs.readFileSync(BASELINE, 'utf-8'));
}

// ── bootstrap mode ──────────────────────────────────────────────────────────
if (process.argv.includes('--write-lock')) {
  fs.writeFileSync(LOCK, baselineHash() + '\n');
  process.stdout.write('[RULES] baseline.lock written\n');
  process.exit(0);
}

// ── validation ──────────────────────────────────────────────────────────────
let violations = 0;
const v = (msg, ctx) => { violations++; fail('RULES', msg, ctx || {}); };

let baseline, active, quarantine, deprecated;
try {
  baseline    = parseYaml(BASELINE);
  active      = parseYaml(path.join(RULES, 'active.yaml'));
  quarantine  = parseYaml(path.join(RULES, 'quarantine.yaml'));
  deprecated  = parseYaml(path.join(RULES, 'deprecated.yaml'));
} catch (e) {
  fail('RULES', 'rule file parse error: ' + e.message, {});
  process.exit(1);
}

const baselineIds = new Set((baseline.rules || []).map(r => r && r.id));
const activeList  = active.active || [];
const quarList    = quarantine.quarantine || [];
const deprList    = deprecated.deprecated || [];

// G1 — baseline immutable
if (!fs.existsSync(LOCK)) {
  v('baseline.lock missing — run `node tools/audit/audit-rules.js --write-lock`', { file: 'baseline.lock' });
} else {
  const want = fs.readFileSync(LOCK, 'utf-8').trim();
  const got  = baselineHash();
  if (want !== got) {
    v(`baseline.yaml hash mismatch (lock=${want.slice(0, 12)}… file=${got.slice(0, 12)}…) — baseline неизменяем`, { file: 'baseline.yaml' });
  }
}

// ID + status + membership
const ID = /^R-\d{3}$/;
function checkEntries(list, name) {
  for (const e of list) {
    if (!e || !ID.test(e.id || '')) { v(`bad rule id in ${name}: ${JSON.stringify(e)}`, { file: name }); continue; }
    if (!e.status) v(`rule ${e.id} in ${name} missing status`, { file: name });
    if (!baselineIds.has(e.id)) v(`rule ${e.id} in ${name} not in baseline`, { file: name });
  }
}
checkEntries(activeList, 'active.yaml');
checkEntries(quarList, 'quarantine.yaml');
checkEntries(deprList, 'deprecated.yaml');

// G4 — disjoint working sets
const aIds = new Set(activeList.map(e => e && e.id));
const qIds = new Set(quarList.map(e => e && e.id));
const dIds = new Set(deprList.map(e => e && e.id));
for (const id of aIds) if (qIds.has(id)) v(`rule ${id} in both active and quarantine`, { file: 'active/quarantine' });
for (const id of aIds) if (dIds.has(id)) v(`rule ${id} in both active and deprecated`, { file: 'active/deprecated' });
for (const id of qIds) if (dIds.has(id)) v(`rule ${id} in both quarantine and deprecated`, { file: 'quarantine/deprecated' });

// PART — completeness: every baseline rule placed in exactly one working set
for (const id of baselineIds) {
  const count = (aIds.has(id) ? 1 : 0) + (qIds.has(id) ? 1 : 0) + (dIds.has(id) ? 1 : 0);
  if (count === 0) v(`baseline rule ${id} not placed in any working set (active/quarantine/deprecated)`, { file: 'rules' });
}

if (violations === 0) ok('RULES');
process.exit(violations === 0 ? 0 : 1);
