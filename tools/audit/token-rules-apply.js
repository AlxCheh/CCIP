#!/usr/bin/env node
'use strict';
/**
 * token-rules-apply.js — применяет предложенные lifecycle-изменения (ADR-016, Phase B3).
 *
 * Читает rules-delta.json (от token-rules-propose.js), применяет promote/deprecate
 * к active/quarantine/deprecated, логирует в rules-changelog.jsonl, удаляет delta.
 * Это шаг propose-confirm: запускается человеком (команда /token-rules-apply).
 *
 * ТРАНЗАКЦИОННОСТЬ (качество): перед записью снимается snapshot трёх рабочих файлов;
 * после записи прогоняется audit-rules.js; при провале — откат snapshot, delta сохраняется.
 * baseline.yaml неприкосновенен (G1). Все записи атомарны (tmp+fsync+rename).
 *
 * Usage: node tools/audit/token-rules-apply.js [--dry-run]
 */
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const matter = require('gray-matter');
const { gitRoot } = require('./_lib/git-root');

const root = gitRoot();
const RULES     = path.join(root, '.claude/audit/rules');
const ACTIVE    = path.join(RULES, 'active.yaml');
const QUAR      = path.join(RULES, 'quarantine.yaml');
const DEPR      = path.join(RULES, 'deprecated.yaml');
const DELTA     = path.join(RULES, 'rules-delta.json');
const CHANGELOG = path.join(root, '.claude/audit/metrics/rules-changelog.jsonl');
const AUDIT     = path.join(root, 'tools/audit/audit-rules.js');
const TODAY     = new Date().toISOString().slice(0, 10);

function parseYaml(p) { return matter('---\n' + fs.readFileSync(p, 'utf-8') + '\n---\n').data; }
function atomicWrite(file, data) {
  const tmp = file + '.tmp.' + process.pid;
  const fd = fs.openSync(tmp, 'w');
  try { fs.writeSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try { fs.renameSync(tmp, file); } catch (e) { try { fs.unlinkSync(tmp); } catch {} throw e; }
}
function header(raw) {
  const out = [];
  for (const l of raw.split('\n')) {
    if (l.trim() === '' || l.trimStart().startsWith('#')) out.push(l);
    else break;
  }
  const h = out.join('\n');
  return h ? h.replace(/\n*$/, '') + '\n' : '';
}
const num = (x) => (Number.isFinite(x) ? x : 0);
const numOrNull = (x) => (typeof x === 'number' ? x : 'null');

function emitActive(hdr, entries) {
  const body = entries.map(e =>
    `  - { id: ${e.id}, status: active, hit_count: ${num(e.hit_count)}, precision: ${numOrNull(e.precision)}, sessions_observed: ${num(e.sessions_observed)} }`
  ).join('\n');
  return `${hdr}version: 1\nsynced_from_baseline: ${TODAY}\nactive:\n${body}\n`;
}
function emitQuarantine(hdr, entries) {
  if (!entries.length) return `${hdr}version: 1\nquarantine: []\n`;
  const body = entries.map(e => [
    `  - id: ${e.id}`,
    `    status: quarantine`,
    `    requires_transcript_access: ${e.requires_transcript_access === true}`,
    e.blocked_reason ? `    blocked_reason: ${JSON.stringify(e.blocked_reason)}` : null,
    `    sessions_in_quarantine: ${num(e.sessions_in_quarantine)}`,
    `    hit_count: ${num(e.hit_count)}`,
    `    precision: ${numOrNull(e.precision)}`,
  ].filter(Boolean).join('\n')).join('\n\n');
  return `${hdr}version: 1\nquarantine:\n${body}\n`;
}
function emitDeprecated(hdr, entries) {
  if (!entries.length) return `${hdr}version: 1\ndeprecated: []\n`;
  const body = entries.map(e => [
    `  - id: ${e.id}`,
    `    status: deprecated`,
    `    reason: ${JSON.stringify(e.reason || '')}`,
    `    deprecated_at: ${JSON.stringify(e.deprecated_at || new Date().toISOString())}`,
  ].join('\n')).join('\n\n');
  return `${hdr}version: 1\ndeprecated:\n${body}\n`;
}

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
  const active = parseYaml(ACTIVE).active || [];
  const quar   = parseYaml(QUAR).quarantine || [];
  const depr   = parseYaml(DEPR).deprecated || [];

  const byId = (list, id) => list.find(e => e && e.id === id);

  // ── validate delta semantically (G3 at apply time) ──
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

  // ── compute new sets ──
  const promoteIds = new Set(promote.map(p => p.id));
  const deprecateIds = new Set(deprecate.map(d => d.id));

  const newActive = active.filter(e => !deprecateIds.has(e.id))
    .concat(promote.map(p => {
      const q = byId(quar, p.id);
      return { id: p.id, status: 'active', hit_count: num(q.hit_count), precision: q.precision ?? null, sessions_observed: 0 };
    }));
  const newQuar = quar.filter(e => !promoteIds.has(e.id));
  const newDepr = depr.concat(deprecate.map(d => ({
    id: d.id, status: 'deprecated', reason: d.reason || '', deprecated_at: new Date().toISOString(),
  })));

  const outA = emitActive(header(aRaw), newActive);
  const outQ = emitQuarantine(header(qRaw), newQuar);
  const outD = emitDeprecated(header(dRaw), newDepr);

  if (dryRun) {
    console.log(JSON.stringify({ status: 'dry-run', promote: promote.map(p => p.id), deprecate: deprecate.map(d => d.id) }, null, 2));
    return;
  }

  // ── transactional write: snapshot → write → validate → rollback on failure ──
  const snapshot = [[ACTIVE, aRaw], [QUAR, qRaw], [DEPR, dRaw]];
  atomicWrite(ACTIVE, outA);
  atomicWrite(QUAR, outQ);
  atomicWrite(DEPR, outD);

  const check = cp.spawnSync(process.execPath, [AUDIT], { encoding: 'utf-8' });
  if (check.status !== 0) {
    for (const [f, v] of snapshot) atomicWrite(f, v); // rollback
    console.error('[apply] post-apply audit-rules FAILED — rolled back:\n' + (check.stdout || '') + (check.stderr || ''));
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

try { main(); }
catch (e) { console.error('[apply] FAIL: ' + e.message); process.exit(1); }
