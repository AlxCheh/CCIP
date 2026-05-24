#!/usr/bin/env node
'use strict';
/**
 * token-rules-count.js — обновление счётчиков правил по итогам сессии (ADR-016, Phase B).
 *
 * «Топливо» для token-rules-propose.js. Это AUTO-часть propose-confirm (Q1): счётчики
 * безопасны — они не меняют активное поведение (правило остаётся в своём наборе).
 *
 * Аудитор (LLM) на T-02 передаёт per-rule статистику сессии:
 *   --session '{"R-001":{"hits":3,"tp":2,"fp":1}, ...}'
 * Для каждого правила в active/quarantine:
 *   sessions_observed / sessions_in_quarantine += 1   (правило наблюдалось в этой сессии)
 *   hit_count += hits;  tp += tp;  fp += fp
 *   precision = tp/(tp+fp)  (детерминированно, не freehand)
 *
 * Эмит и транзакционность — из _lib/rules-io. baseline.yaml не трогается.
 *
 * Usage: node tools/audit/token-rules-count.js --session '<json>' [--dry-run]
 */
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const {
  parseYaml, num, header, emitActive, emitQuarantine, derivePrecision, commitFiles,
} = require('./_lib/rules-io');

const root = gitRoot();
const RULES  = path.join(root, '.claude/audit/rules');
const ACTIVE = path.join(RULES, 'active.yaml');
const QUAR   = path.join(RULES, 'quarantine.yaml');

function parseArgs(argv) {
  const out = { session: {}, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') out.dryRun = true;
    else if (argv[i] === '--session') {
      try { out.session = JSON.parse(argv[++i] || '{}'); }
      catch (e) { throw new Error('invalid --session JSON: ' + e.message); }
    }
  }
  return out;
}

/** Apply this session's stats to a rule entry, bumping its session counter. */
function applyStats(entry, stat, sessionField) {
  const s = stat || {};
  const tp = num(entry.tp) + num(s.tp);
  const fp = num(entry.fp) + num(s.fp);
  return {
    ...entry,
    [sessionField]: num(entry[sessionField]) + 1,
    hit_count: num(entry.hit_count) + num(s.hits),
    tp, fp,
    precision: derivePrecision(tp, fp),
  };
}

function main() {
  const { session, dryRun } = parseArgs(process.argv.slice(2));

  const aRaw = fs.readFileSync(ACTIVE, 'utf-8');
  const qRaw = fs.readFileSync(QUAR, 'utf-8');
  const aDoc = parseYaml(ACTIVE);
  const qDoc = parseYaml(QUAR);
  const synced = aDoc.synced_from_baseline || new Date().toISOString().slice(0, 10);

  const newActive = (aDoc.active || []).map(e => applyStats(e, session[e.id], 'sessions_observed'));
  const newQuar   = (qDoc.quarantine || []).map(e => applyStats(e, session[e.id], 'sessions_in_quarantine'));

  const outA = emitActive(header(aRaw), newActive, synced);
  const outQ = emitQuarantine(header(qRaw), newQuar);

  if (dryRun) {
    console.log(JSON.stringify({ status: 'dry-run', active: newActive.length, quarantine: newQuar.length }, null, 2));
    return;
  }

  const res = commitFiles(root, [[ACTIVE, outA], [QUAR, outQ]]);
  if (!res.ok) {
    console.error('[count] post-write audit-rules FAILED — rolled back:\n' + res.error);
    process.exit(1);
  }
  console.log(JSON.stringify({ status: 'counted', active: newActive.length, quarantine: newQuar.length, rules_with_stats: Object.keys(session).length }));
}

if (require.main === module) {
  try { main(); }
  catch (e) { console.error('[count] FAIL: ' + e.message); process.exit(1); }
}

module.exports = { applyStats };
