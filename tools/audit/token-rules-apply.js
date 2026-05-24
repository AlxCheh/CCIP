#!/usr/bin/env node
'use strict';
/**
 * token-rules-apply.js — применяет предложенные lifecycle-изменения (ADR-016, Phase B3).
 *
 * Читает rules-delta.json (от token-rules-propose.js), применяет promote/deprecate
 * к active/quarantine/deprecated, логирует в rules-changelog.jsonl, удаляет delta.
 * Шаг propose-confirm: запускается человеком (команда /token-rules-apply).
 *
 * Эмит и транзакционность (snapshot → write → audit-rules → rollback) — из _lib/rules-io.
 * baseline.yaml неприкосновенен (G1).
 *
 * Usage: node tools/audit/token-rules-apply.js [--dry-run]
 */
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const {
  parseYaml, num, header, emitActive, emitQuarantine, emitDeprecated, commitFiles,
} = require('./_lib/rules-io');

const root = gitRoot();
const RULES     = path.join(root, '.claude/audit/rules');
const ACTIVE    = path.join(RULES, 'active.yaml');
const QUAR      = path.join(RULES, 'quarantine.yaml');
const DEPR      = path.join(RULES, 'deprecated.yaml');
const DELTA     = path.join(RULES, 'rules-delta.json');
const CHANGELOG = path.join(root, '.claude/audit/metrics/rules-changelog.jsonl');
const TODAY     = new Date().toISOString().slice(0, 10);

function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (!fs.existsSync(DELTA)) { console.log(JSON.stringify({ status: 'no-delta' })); return; }
  const delta = JSON.parse(fs.readFileSync(DELTA, 'utf-8'));
  const promote = delta.promote || [];
  const deprecate = delta.deprecate || [];
  if (promote.length + deprecate.length === 0) { console.log(JSON.stringify({ status: 'empty-delta' })); return; }

  const aRaw = fs.readFileSync(ACTIVE, 'utf-8');
  const qRaw = fs.readFileSync(QUAR, 'utf-8');
  const dRaw = fs.readFileSync(DEPR, 'utf-8');
  const aDoc = parseYaml(ACTIVE);
  const active = aDoc.active || [];
  const quar   = parseYaml(QUAR).quarantine || [];
  const depr   = parseYaml(DEPR).deprecated || [];
  const synced = aDoc.synced_from_baseline || TODAY;
  const byId = (list, id) => list.find(e => e && e.id === id);

  // ── semantic validation (G3 at apply time) ──
  const errs = [];
  const seen = new Set();
  for (const p of promote) {
    if (seen.has(p.id)) errs.push(`duplicate id ${p.id} in delta`); seen.add(p.id);
    const q = byId(quar, p.id);
    if (!q) errs.push(`promote ${p.id}: not in quarantine`);
    else if (q.requires_transcript_access === true) errs.push(`promote ${p.id}: requires_transcript_access (G5)`);
  }
  for (const d of deprecate) {
    if (seen.has(d.id)) errs.push(`duplicate id ${d.id} in delta`); seen.add(d.id);
    if (!byId(active, d.id)) errs.push(`deprecate ${d.id}: not in active`);
  }
  if (errs.length) { console.error('[apply] delta invalid:\n - ' + errs.join('\n - ')); process.exit(1); }

  // ── compute new sets (carry tp/fp on promote) ──
  const promoteIds = new Set(promote.map(p => p.id));
  const deprecateIds = new Set(deprecate.map(d => d.id));

  const newActive = active.filter(e => !deprecateIds.has(e.id))
    .concat(promote.map(p => {
      const q = byId(quar, p.id);
      return { id: p.id, status: 'active', hit_count: num(q.hit_count), tp: num(q.tp), fp: num(q.fp), precision: q.precision ?? null, sessions_observed: 0 };
    }));
  const newQuar = quar.filter(e => !promoteIds.has(e.id));
  const newDepr = depr.concat(deprecate.map(d => ({
    id: d.id, status: 'deprecated', reason: d.reason || '', deprecated_at: new Date().toISOString(),
  })));

  const outA = emitActive(header(aRaw), newActive, synced);
  const outQ = emitQuarantine(header(qRaw), newQuar);
  const outD = emitDeprecated(header(dRaw), newDepr);

  if (dryRun) {
    console.log(JSON.stringify({ status: 'dry-run', promote: promote.map(p => p.id), deprecate: deprecate.map(d => d.id) }, null, 2));
    return;
  }

  const res = commitFiles(root, [[ACTIVE, outA], [QUAR, outQ], [DEPR, outD]]);
  if (!res.ok) {
    console.error('[apply] post-apply audit-rules FAILED — rolled back:\n' + res.error);
    process.exit(1);
  }

  // ── changelog (G7) + clear delta ──
  const ts = new Date().toISOString();
  const lines = [
    ...promote.map(p => ({ ts, action: 'promote', id: p.id, from: 'quarantine', to: 'active', reason: p.reason, metrics: p.metrics })),
    ...deprecate.map(d => ({ ts, action: 'deprecate', id: d.id, from: 'active', to: 'deprecated', reason: d.reason, metrics: d.metrics })),
  ];
  fs.appendFileSync(CHANGELOG, lines.map(l => JSON.stringify(l)).join('\n') + '\n');
  try { fs.unlinkSync(DELTA); } catch {}

  console.log(JSON.stringify({ status: 'applied', promote: promote.map(p => p.id), deprecate: deprecate.map(d => d.id) }));
}

if (require.main === module) {
  try { main(); }
  catch (e) { console.error('[apply] FAIL: ' + e.message); process.exit(1); }
}
