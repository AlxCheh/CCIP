'use strict';
/**
 * state-lock.js — blocking cross-process advisory lock вокруг мутаций session-state.json.
 *
 * Модель взята из проверенного tools/audit/_lib/serial-guard.js (атомарный fs.openSync 'wx'
 * + PID-stale-reclaim), но вместо throw-on-held делает BLOCKING acquire с backoff — потому
 * что hook-writer'ы должны дождаться своей очереди, а не падать. Закрывает HA-2 / E-2:
 * read-modify-write становится атомарным МЕЖДУ процессами, не только внутри одного.
 *
 * Stale-safety двойная: (1) PID мёртв → лок переиспользуется; (2) лок старше TTL → тоже
 * (защита от зависшего живого процесса). При таймауте acquire — наблюдаемый fail-open:
 * fn выполняется БЕЗ лока (write не теряется), а вызывающий помечает state_lock_failed_open.
 */
const fs = require('fs');

const LOCK_TTL_MS     = parseInt(process.env.CCIP_STATE_LOCK_TTL_MS     || '5000', 10);
const ACQUIRE_TIMEOUT = parseInt(process.env.CCIP_STATE_LOCK_TIMEOUT_MS || '4000', 10);
const RETRY_MS        = 25;

function pidAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code === 'EPERM'; }
}

/** Synchronous sleep without deps (hooks are short-lived sync scripts). */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Захватывает лок на `${stateFile}.lock`, выполняет fn(), освобождает лок.
 * @param {string} stateFile  путь к state-файлу (лок = stateFile + '.lock')
 * @param {Function} fn  синхронная критическая секция; её результат возвращается
 * @param {object} [opts]  { onFailOpen?: (reason)=>void } вызывается, если лок не взят
 * @returns результат fn()
 */
function withStateLock(stateFile, fn, opts = {}) {
  const lockFile = stateFile + '.lock';
  const deadline = Date.now() + ACQUIRE_TIMEOUT;
  let acquired = false;

  while (!acquired) {
    try {
      const fd = fs.openSync(lockFile, 'wx');           // атомарный эксклюзивный create
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }));
      fs.closeSync(fd);
      acquired = true;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      // Holder может быть НЕЧИТАЕМ, если другой процесс только что сделал openSync('wx'),
      // но ещё не записал PID (файл существует пустым). Это НЕ stale — это лок в процессе
      // создания. Реклеймим ТОЛЬКО при позитивном доказательстве: мёртвый PID или истёкший
      // TTL. Пустой/битый holder → ждём и ретраимся (иначе race: двое в критической секции).
      let holder = null;
      try { holder = JSON.parse(fs.readFileSync(lockFile, 'utf-8')); } catch {}
      const stale = holder && (
        (holder.pid && !pidAlive(holder.pid)) ||
        (holder.at && Date.now() - holder.at > LOCK_TTL_MS)
      );
      if (stale) { try { fs.unlinkSync(lockFile); } catch {} continue; }
      if (Date.now() > deadline) {
        // Наблюдаемый fail-open: НЕ дедлочим writer'а — выполняем без лока, сигналим.
        if (typeof opts.onFailOpen === 'function') {
          try { opts.onFailOpen(`acquire timeout (holder pid ${holder.pid})`); } catch {}
        }
        return fn();
      }
      sleepSync(RETRY_MS);
    }
  }

  try { return fn(); }
  finally { try { fs.unlinkSync(lockFile); } catch {} }
}

module.exports = { withStateLock };
