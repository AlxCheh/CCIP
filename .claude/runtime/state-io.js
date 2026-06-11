'use strict';
/**
 * state-io.js — единый атомарный read-modify-write для session-state.json под cross-process
 * локом (state-lock.js). Семантика readState/.bak-recovery скопирована дословно из
 * post-agent-hook.js (R-1: видимое восстановление) — теперь это единственный путь записи.
 */
const fs = require('fs');
const path = require('path');
const { withStateLock } = require('./state-lock');

const ROOT = path.resolve(__dirname, '../..');
const DEFAULT_STATE = process.env.CCIP_STATE_FILE
  || path.join(ROOT, '.claude/runtime/session-state.json');

/** Read state, recovering visibly from .bak on corruption (R-1 parity with post-agent-hook). */
function readStateRaw(stateFile = DEFAULT_STATE) {
  const BAK = stateFile + '.bak';
  if (fs.existsSync(stateFile)) {
    try { return JSON.parse(fs.readFileSync(stateFile, 'utf-8')); }
    catch {
      if (fs.existsSync(BAK)) {
        try {
          const recovered = JSON.parse(fs.readFileSync(BAK, 'utf-8'));
          process.stderr.write('[state-io] ⚠ recovered state from .bak (main corrupt) — R-1\n');
          if (!Array.isArray(recovered.governance_alerts)) recovered.governance_alerts = [];
          recovered.governance_alerts.push({
            kind: 'state_recovered_from_backup',
            at: new Date().toISOString(),
            session: recovered.session_id || '',
          });
          return recovered;
        } catch {}
      }
      return null;
    }
  }
  if (fs.existsSync(BAK)) {
    try { return JSON.parse(fs.readFileSync(BAK, 'utf-8')); } catch {}
  }
  return null;
}

/** Atomic write: backup → tmp(fsync) → rename → dir fsync. Copied from post-agent-hook. */
function writeStateAtomic(state, stateFile = DEFAULT_STATE) {
  const BAK = stateFile + '.bak';
  if (fs.existsSync(stateFile)) { try { fs.copyFileSync(stateFile, BAK); } catch {} }
  const tmp = stateFile + '.tmp.' + process.pid;
  const data = JSON.stringify(state, null, 2) + '\n';
  const fd = fs.openSync(tmp, 'w');
  try { fs.writeSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try { fs.renameSync(tmp, stateFile); }
  catch (e) { try { fs.unlinkSync(tmp); } catch {} throw e; }
  try {
    const dirFd = fs.openSync(path.dirname(stateFile), 'r');
    fs.fsyncSync(dirFd); fs.closeSync(dirFd);
  } catch (e) {
    if (e.code !== 'EPERM' && e.code !== 'EISDIR' && e.code !== 'EACCES') throw e;
  }
}

/**
 * Атомарный read-modify-write под локом. mutator(state) мутирует объект на месте;
 * если readStateRaw вернул null (нет валидного state), mutator НЕ вызывается, возвращается null.
 * `opts.onFailOpen` пробрасывается в лок (наблюдаемый fail-open при таймауте).
 */
function updateStateLocked(stateFile, mutator, opts = {}) {
  const target = stateFile || DEFAULT_STATE;
  return withStateLock(target, () => {
    const state = readStateRaw(target);
    if (!state) return null;
    const r = mutator(state);
    writeStateAtomic(state, target);
    return r === undefined ? state : r;
  }, opts);
}

module.exports = { readStateRaw, writeStateAtomic, updateStateLocked, DEFAULT_STATE };
