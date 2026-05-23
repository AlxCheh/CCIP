#!/usr/bin/env node
'use strict';
/**
 * token-rules-propose.js — детерминированный пропоузер lifecycle-изменений (ADR-016, Phase B2).
 *
 * Читает active/quarantine + rolling-30, вычисляет кандидатов на promote/deprecate по
 * критериям G8/G9 и пишет ПРЕДЛОЖЕНИЕ в .claude/audit/rules/rules-delta.json.
 * НЕ трогает active.yaml/quarantine.yaml — применение только через /token-rules-apply
 * (propose-confirm, Q1). Поведение системы без человека не меняется.
 *
 * Критерии:
 *   PROMOTE quarantine→active (все):
 *     requires_transcript_access != true        (G5)
 *     sessions_in_quarantine >= 3                (G8)
 *     precision != null && precision >= 0.7      (G8)
 *     rolling.delta_T_trend <= -5 (экономия ≥5%) (G8, ΔT)
 *     rolling.E_resp_mean == null || >= 0.6      (G8, ΔQ — estimated, не блокирует если unknown)
 *   DEPRECATE active→deprecated (любое):
 *     sessions_observed >= 20 && hit_count == 0  (G9)
 *     precision != null && precision < 0.4       (G9)
 *
 * Замечание по качеству: ΔQ строится на estimated E_resp — каждое promote-предложение
 * помечается q_estimated:true; финальное решение — человек через /token-rules-apply.
 *
 * Usage: node tools/audit/token-rules-propose.js [--dry-run]
 */
const fs = require('node:fs');
const path = require('node:path');
const matter = require('gray-matter');
const { gitRoot } = require('./_lib/git-root');

const root = gitRoot();
const RULES   = path.join(root, '.claude/audit/rules');
const ROLLING = path.join(root, '.claude/audit/metrics/rolling-30.json');
const DELTA   = path.join(RULES, 'rules-delta.json');

const PROMOTE_MIN_SESSIONS = 3;
const PROMOTE_MIN_PRECISION = 0.7;
const PROMOTE_MIN_SAVINGS_PCT = 5;   // экономия ≥5% ⇒ delta_T_trend ≤ -5
const PROMOTE_MIN_E_RESP = 0.6;
const DEPRECATE_NOHIT_SESSIONS = 20;
const DEPRECATE_MAX_PRECISION = 0.4;

function parseYaml(p) {
  return matter('---\n' + fs.readFileSync(p, 'utf-8') + '\n---\n').data;
}
function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return fallback; }
}
function atomicWrite(file, data) {
  const tmp = file + '.tmp.' + process.pid;
  const fd = fs.openSync(tmp, 'w');
  try { fs.writeSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try { fs.renameSync(tmp, file); }
  catch (e) { try { fs.unlinkSync(tmp); } catch {} throw e; }
}

function computeProposals(active, quarantine, rolling) {
  const agg = (rolling && rolling.aggregates) || {};
  const deltaT = typeof agg.delta_T_trend === 'number' ? agg.delta_T_trend : null;
  const eResp  = typeof agg.E_resp_mean === 'number' ? agg.E_resp_mean : null;

  const savingsGate = deltaT !== null && deltaT <= -PROMOTE_MIN_SAVINGS_PCT;
  const qualityGate = eResp === null || eResp >= PROMOTE_MIN_E_RESP;

  const promote = [];
  for (const r of (quarantine.quarantine || [])) {
    if (!r || r.requires_transcript_access === true) continue;
    const seasoned = (Number(r.sessions_in_quarantine) || 0) >= PROMOTE_MIN_SESSIONS;
    const precise  = typeof r.precision === 'number' && r.precision >= PROMOTE_MIN_PRECISION;
    if (seasoned && precise && savingsGate && qualityGate) {
      promote.push({
        id: r.id, from: 'quarantine', to: 'active',
        reason: 'G8: seasoned + precise + global savings trend',
        metrics: { sessions_in_quarantine: r.sessions_in_quarantine, precision: r.precision, delta_T_trend: deltaT, E_resp_mean: eResp },
        q_estimated: true,
      });
    }
  }

  const deprecate = [];
  for (const r of (active.active || [])) {
    if (!r) continue;
    const noHit = (Number(r.sessions_observed) || 0) >= DEPRECATE_NOHIT_SESSIONS && (Number(r.hit_count) || 0) === 0;
    const lowPrec = typeof r.precision === 'number' && r.precision < DEPRECATE_MAX_PRECISION;
    if (noHit || lowPrec) {
      deprecate.push({
        id: r.id, from: 'active', to: 'deprecated',
        reason: noHit ? `G9: hit_count==0 за ${r.sessions_observed} сессий` : `G9: precision ${r.precision} < ${DEPRECATE_MAX_PRECISION}`,
        metrics: { sessions_observed: r.sessions_observed, hit_count: r.hit_count, precision: r.precision },
      });
    }
  }
  return { promote, deprecate, gates: { savingsGate, qualityGate, delta_T_trend: deltaT, E_resp_mean: eResp } };
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const active     = parseYaml(path.join(RULES, 'active.yaml'));
  const quarantine = parseYaml(path.join(RULES, 'quarantine.yaml'));
  const rolling    = readJSON(ROLLING, {});

  const p = computeProposals(active, quarantine, rolling);
  const delta = {
    generated_at: new Date().toISOString(),
    status: 'proposed',
    based_on: { rolling_sessions: rolling.sessions_count ?? null, gates: p.gates },
    promote: p.promote,
    deprecate: p.deprecate,
  };

  const total = p.promote.length + p.deprecate.length;
  if (dryRun) {
    console.log(JSON.stringify({ status: 'dry-run', promote: p.promote.length, deprecate: p.deprecate.length, delta }, null, 2));
    return;
  }
  if (total === 0) {
    // Ничего не предлагаем — снять устаревшую delta, если была.
    try { fs.unlinkSync(DELTA); } catch {}
    console.log(JSON.stringify({ status: 'no-proposals', promote: 0, deprecate: 0 }));
    return;
  }
  atomicWrite(DELTA, JSON.stringify(delta, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'proposed', promote: p.promote.length, deprecate: p.deprecate.length, file: '.claude/audit/rules/rules-delta.json' }));
}

try { main(); }
catch (e) { console.error('[propose] FAIL: ' + e.message); process.exit(1); }

module.exports = { computeProposals };
