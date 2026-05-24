'use strict';
/**
 * rules-io.js — единый ввод/вывод rule-файлов token-efficiency-auditor (ADR-016).
 *
 * Один источник истины для парсинга и эмита YAML рабочих наборов, чтобы
 * token-rules-apply.js и token-rules-count.js не разошлись в формате (и не теряли
 * поля вроде tp/fp). Строки квотируются через JSON.stringify (безопасно для кириллицы).
 *
 * commitFiles() — транзакционная запись: snapshot → write → audit-rules.js → rollback
 * при провале. baseline.yaml сюда не пишется никогда (G1).
 */
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const matter = require('gray-matter');

function parseYaml(p) {
  return matter('---\n' + fs.readFileSync(p, 'utf-8') + '\n---\n').data;
}

function atomicWrite(file, data) {
  const tmp = file + '.tmp.' + process.pid;
  const fd = fs.openSync(tmp, 'w');
  try { fs.writeSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try { fs.renameSync(tmp, file); }
  catch (e) { try { fs.unlinkSync(tmp); } catch {} throw e; }
}

/** Leading comment/blank block of a file, preserved across regeneration. */
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

/** precision = tp/(tp+fp), 4 dp; null when no observations yet. */
function derivePrecision(tp, fp) {
  const t = num(tp), f = num(fp);
  return (t + f) > 0 ? +(t / (t + f)).toFixed(4) : null;
}

function emitActive(hdr, entries, syncedDate) {
  const body = entries.map(e =>
    `  - { id: ${e.id}, status: active, hit_count: ${num(e.hit_count)}, tp: ${num(e.tp)}, fp: ${num(e.fp)}, precision: ${numOrNull(e.precision)}, sessions_observed: ${num(e.sessions_observed)} }`
  ).join('\n');
  return `${hdr}version: 1\nsynced_from_baseline: ${syncedDate}\nactive:\n${body}\n`;
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
    `    tp: ${num(e.tp)}`,
    `    fp: ${num(e.fp)}`,
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

/**
 * Transactional write: snapshot the target files, write them, run audit-rules.js;
 * on validation failure restore the snapshot and return { ok:false, error }.
 * @param {string} root  git root
 * @param {Array<[string,string]>} writes  [path, content] pairs
 */
function commitFiles(root, writes) {
  const snap = writes.map(([f]) => [f, fs.existsSync(f) ? fs.readFileSync(f, 'utf-8') : null]);
  for (const [f, c] of writes) atomicWrite(f, c);
  const audit = path.join(root, 'tools/audit/audit-rules.js');
  const r = cp.spawnSync(process.execPath, [audit], { encoding: 'utf-8' });
  if (r.status !== 0) {
    for (const [f, c] of snap) {
      if (c === null) { try { fs.unlinkSync(f); } catch {} }
      else atomicWrite(f, c);
    }
    return { ok: false, error: (r.stdout || '') + (r.stderr || '') };
  }
  return { ok: true };
}

module.exports = {
  parseYaml, atomicWrite, header, num, numOrNull, derivePrecision,
  emitActive, emitQuarantine, emitDeprecated, commitFiles,
};
