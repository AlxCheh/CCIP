#!/usr/bin/env node
'use strict';
/**
 * token-session-record.js — детерминированный recorder для T-02 (ADR-016, Phase A).
 *
 * Считает то, что можно посчитать ТОЧНО из session-state.json, дописывает строку
 * в metrics/history.jsonl и пересчитывает metrics/rolling-30.json. Математику и
 * NDJSON-операции делает скрипт (не LLM) — это гарантия качества.
 *
 * LLM-аудитор передаёт оценочные поля (T_useful, IDC, E_resp) через --estimates
 * '<json>' опционально; при отсутствии они пишутся как null.
 *
 * Идемпотентность: если последняя строка history.jsonl имеет тот же session_key —
 * запись пропускается (повторный T-02 в той же сессии не дублирует историю).
 *
 * Skip-логика (Q4): нет agent_outputs ИЛИ T_total < MIN_TOKENS → строку не писать,
 * инкремент sessions_skipped в rolling-30.
 *
 * Все записи атомарны (tmp + fsync + rename). Fail-loud: ненулевой exit при ошибке
 * (это CLI-инструмент, не hook) — кроме «нечего записывать», что не ошибка.
 *
 * Usage:
 *   node tools/audit/token-session-record.js [--estimates '{"T_useful":1234,...}'] [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const ROOT    = path.resolve(__dirname, '../..');
const SSTATE  = path.join(ROOT, '.claude/runtime/session-state.json');
const TSTATE  = path.join(ROOT, '.claude/audit/trigger-state.json');
const HISTORY = path.join(ROOT, '.claude/audit/metrics/history.jsonl');
const ROLLING = path.join(ROOT, '.claude/audit/metrics/rolling-30.json');

const MIN_TOKENS    = 500; // ниже порога — тривиальная сессия, не пишем (Q4)
const ROLLING_N     = 30;

// ── io helpers ────────────────────────────────────────────────────────────────

function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch { return fallback; }
}

function atomicWrite(file, data) {
  const tmp = file + '.tmp.' + process.pid;
  const fd = fs.openSync(tmp, 'w');
  try { fs.writeSync(fd, data); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  try { fs.renameSync(tmp, file); }
  catch (e) { try { fs.unlinkSync(tmp); } catch {} throw e; }
}

/** Parse NDJSON, skipping blank/corrupt lines (history must survive partial writes). */
function readHistory() {
  let raw;
  try { raw = fs.readFileSync(HISTORY, 'utf-8'); } catch { return []; }
  const rows = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { rows.push(JSON.parse(t)); } catch { /* skip corrupt line */ }
  }
  return rows;
}

// ── metrics (deterministic part) ────────────────────────────────────────────

function sessionKey(tstate, sstate) {
  if (tstate && tstate.session_key) return tstate.session_key;
  if (sstate && sstate.started_at)  return 'started-' + sstate.started_at;
  return 'unknown-' + new Date().toISOString().slice(0, 10);
}

function computeDeterministic(sstate) {
  const obs = Array.isArray(sstate.observations) ? sstate.observations : [];
  const agentOutputs = sstate.agent_outputs && typeof sstate.agent_outputs === 'object'
    ? sstate.agent_outputs : {};
  const T_total = obs.reduce((s, o) => s + (Number(o.context_tokens) || 0), 0);
  const outcomes = obs.reduce((m, o) => { m[o.outcome] = (m[o.outcome] || 0) + 1; return m; }, {});
  return {
    agents:       Object.keys(agentOutputs).length,
    observations: obs.length,
    T_total,
    outcomes,
  };
}

function recomputeRolling(rows, skippedTotal) {
  const window = rows.slice(-ROLLING_N);
  const n = window.length;
  const mean = (sel) => {
    const vals = window.map(sel).filter(v => typeof v === 'number' && !Number.isNaN(v));
    return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(4) : null;
  };
  return {
    window: ROLLING_N,
    sessions_count: n,
    sessions_skipped: skippedTotal,
    updated_at: new Date().toISOString(),
    aggregates: {
      T_total_mean: mean(r => r.T_total),
      IDC_mean:     mean(r => r.IDC),
      R_dup_mean:   mean(r => r.R_dup),
      E_resp_mean:  mean(r => r.E_resp),
      delta_T_trend: (() => {
        const xs = window.map(r => r.T_total).filter(v => typeof v === 'number');
        if (xs.length < 2) return null;
        return +(((xs[xs.length - 1] - xs[0]) / (xs[0] || 1)) * 100).toFixed(2);
      })(),
    },
  };
}

// ── main ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { estimates: {}, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') out.dryRun = true;
    else if (argv[i] === '--estimates') {
      try { out.estimates = JSON.parse(argv[++i] || '{}'); }
      catch (e) { throw new Error('invalid --estimates JSON: ' + e.message); }
    }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const sstate = readJSON(SSTATE, null);
  if (!sstate) { console.error('[record] session-state.json missing/unparseable'); process.exit(1); }
  const tstate = readJSON(TSTATE, null);

  const key = sessionKey(tstate, sstate);
  const det = computeDeterministic(sstate);

  // Skip-логика (Q4): тривиальная/пустая сессия — не пишем строку, считаем skipped.
  const trivial = det.agents === 0 || det.T_total < MIN_TOKENS;

  const rows = readHistory();
  const last = rows[rows.length - 1];

  // Идемпотентность: тот же session_key в последней строке → ничего не делаем.
  if (last && last.session_key === key) {
    console.log(JSON.stringify({ status: 'idempotent-skip', session_key: key }));
    return;
  }

  const prevRolling = readJSON(ROLLING, { sessions_skipped: 0 });
  const prevSkipped = Number(prevRolling.sessions_skipped) || 0;

  if (trivial) {
    const rolling = recomputeRolling(rows, prevSkipped + 1);
    if (!args.dryRun) atomicWrite(ROLLING, JSON.stringify(rolling, null, 2) + '\n');
    console.log(JSON.stringify({ status: 'trivial-skip', session_key: key, T_total: det.T_total, agents: det.agents }));
    return;
  }

  const e = args.estimates || {};
  const row = {
    session_key: key,
    recorded_at: new Date().toISOString(),
    agents:       det.agents,
    observations: det.observations,
    T_total:      det.T_total,
    outcomes:     det.outcomes,
    // estimated (LLM-derived, may be null) — помечены как оценочные в самом контракте
    T_useful: typeof e.T_useful === 'number' ? e.T_useful : null,
    IDC:      typeof e.IDC === 'number' ? e.IDC : null,
    R_dup:    typeof e.R_dup === 'number' ? e.R_dup : null,
    E_resp:   typeof e.E_resp === 'number' ? e.E_resp : null,
    estimated_fields_present: ['T_useful', 'IDC', 'R_dup', 'E_resp'].some(k => typeof e[k] === 'number'),
  };

  const newRows = rows.concat(row);
  const rolling = recomputeRolling(newRows, prevSkipped);

  if (args.dryRun) {
    console.log(JSON.stringify({ status: 'dry-run', row, rolling }, null, 2));
    return;
  }

  // append history (atomic full rewrite — NDJSON, bounded by session count)
  atomicWrite(HISTORY, newRows.map(r => JSON.stringify(r)).join('\n') + '\n');
  atomicWrite(ROLLING, JSON.stringify(rolling, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'recorded', session_key: key, T_total: det.T_total, sessions_count: rolling.sessions_count }));
}

try { main(); }
catch (e) { console.error('[record] FAIL: ' + e.message); process.exit(1); }
