'use strict';
/**
 * dag-journal.js — append-only NDJSON journal для DAG-прогонов (§XII.3, ADR-023).
 *
 * Журнал переживает рестарт сессии: хранится независимо от session-state.json.
 * Resume читает журнал по (run_id, dag_hash), восстанавливая done-шаги без
 * повторного выполнения. TTL (дефолт 7 дней) прунит старые записи при старте.
 */
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../..');
const DEFAULT_JOURNAL = process.env.CCIP_DAG_JOURNAL_FILE
  || path.join(ROOT, '.claude/runtime/dag-journal.jsonl');
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Уникальный идентификатор прогона DAG (hex-random, достаточно для логов). */
function newRunId() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Хэш структуры DAG (step/agent/depends_on) — отличает разные DAG-определения.
 * Изменение агента или зависимостей → новый hash → старые журналы не резюмируются.
 */
function hashDAG(dag) {
  const canonical = (dag || []).map(s => ({
    step:       s.step,
    agent:      s.agent,
    depends_on: (s.depends_on || []).slice().sort(),
  }));
  return crypto.createHash('sha1').update(JSON.stringify(canonical)).digest('hex').slice(0, 8);
}

/** Append one entry to the journal file (atomic enough for append-only NDJSON). */
function appendEntry(entry, journalFile = DEFAULT_JOURNAL) {
  try {
    fs.mkdirSync(path.dirname(journalFile), { recursive: true });
    fs.appendFileSync(journalFile, JSON.stringify(entry) + '\n', 'utf-8');
  } catch (e) {
    process.stderr.write(`[dag-journal] append failed: ${e.message}\n`);
  }
}

/** Load all entries from journal (returns [] on missing/corrupt file). */
function loadEntries(journalFile = DEFAULT_JOURNAL) {
  try {
    return fs.readFileSync(journalFile, 'utf-8')
      .split('\n').filter(Boolean)
      .map(line => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

/** Номера шагов (числа), помеченных step_done для данного run_id. */
function getDoneSteps(runId, journalFile = DEFAULT_JOURNAL) {
  return loadEntries(journalFile)
    .filter(e => e.run_id === runId && e.event === 'step_done' && e.step != null)
    .map(e => Number(e.step));
}

/**
 * Найти последний незавершённый прогон с совпадающим dag_hash.
 * Возвращает entry run_start или null.
 * «Незавершённый» = нет записи run_done / run_blocked для этого run_id.
 */
function findResumableRun(dagHash, journalFile = DEFAULT_JOURNAL) {
  const entries = loadEntries(journalFile);
  const closed = new Set(
    entries.filter(e => e.event === 'run_done' || e.event === 'run_blocked').map(e => e.run_id)
  );
  const starts = entries
    .filter(e => e.event === 'run_start' && e.dag_hash === dagHash && !closed.has(e.run_id));
  // Берём последний (самый новый) незакрытый прогон
  return starts.length ? starts[starts.length - 1] : null;
}

/**
 * Удалить записи с ts старше ttlMs (реписывает файл). No-op на отсутствующем файле.
 */
function prune(ttlMs = DEFAULT_TTL_MS, journalFile = DEFAULT_JOURNAL) {
  const entries = loadEntries(journalFile);
  if (!entries.length) return;
  const cutoff = Date.now() - ttlMs;
  const kept = entries.filter(e => {
    if (!e.ts) return true; // нет ts → оставляем на всякий случай
    return new Date(e.ts).getTime() >= cutoff;
  });
  if (kept.length === entries.length) return;
  const tmp = journalFile + '.tmp.' + process.pid;
  try {
    fs.writeFileSync(tmp, kept.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf-8');
    fs.renameSync(tmp, journalFile);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch {}
    process.stderr.write(`[dag-journal] prune failed: ${e.message}\n`);
  }
}

module.exports = { newRunId, hashDAG, appendEntry, loadEntries, getDoneSteps, findResumableRun, prune, DEFAULT_JOURNAL, DEFAULT_TTL_MS };
