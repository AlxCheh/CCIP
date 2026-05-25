'use strict';
/**
 * serial-guard.js — cross-process advisory lock для integration-тестов, которые
 * мутируют ОБЩИЕ реальные файлы (`.claude/audit/rules/*.yaml`).
 *
 * Почему: token-rules-count / -apply / -propose тесты пишут в один и тот же
 * реальный rule-set и гоняют реальный валидатор audit-rules.js. Они serial-by-design.
 * Канонический раннер `tools/audit/run-tests.js` запускает файлы с `concurrency:false`
 * (по одному) → лок всегда свободен. А сырой параллельный `node --test <glob>` стартует
 * файлы одновременно → гонка на ФС давала МОЛЧАЛИВЫЙ fixture-diff.
 *
 * Этот guard превращает гонку в БЫСТРЫЙ и ПОНЯТНЫЙ отказ: второй процесс не получает
 * лок и падает на загрузке файла с указанием на поддерживаемую команду.
 *
 * Stale-safety: лок несёт PID владельца. Если предыдущий процесс упал, не сняв лок,
 * следующий запуск проверяет живость PID (`process.kill(pid, 0)`) и переиспользует
 * мёртвый лок — иначе serial-прогон навсегда блокировался бы протухшим файлом.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const DEFAULT_LOCK = path.join(os.tmpdir(), 'ccip-audit-rules-tests.lock');

function guardError(name) {
  return new Error(
    `[serial-guard] ${name}: общий fixture-лок занят другим audit-тестом.\n` +
    `Эти тесты мутируют реальные .claude/audit/rules/*.yaml и ДОЛЖНЫ идти последовательно.\n` +
    `Запускай их через:  npm run test:audit   (node tools/audit/run-tests.js, concurrency:false)\n` +
    `Не запускай сырым параллельным \`node --test <glob>\`.`
  );
}

function pidAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; }       // существует и доступен
  catch (e) { return e.code === 'EPERM'; }          // существует, но нет прав → жив
}

/**
 * Захватывает serial-лок. Возвращает идемпотентную release-функцию.
 * Бросает понятную ошибку, если лок держит ЖИВОЙ процесс (= параллельный запуск).
 * @param {string} name  имя теста для сообщения
 * @param {string} [lockFile]  путь к lock-файлу (для тестов самого guard)
 */
function acquireSerialGuard(name, lockFile = DEFAULT_LOCK) {
  let fd;
  try {
    fd = fs.openSync(lockFile, 'wx');               // атомарный эксклюзивный create
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const holder = Number(String(fs.readFileSync(lockFile, 'utf-8')).trim()) || 0;
    if (pidAlive(holder)) throw guardError(name);    // живой владелец → реальная параллель
    try { fs.unlinkSync(lockFile); } catch {}        // протухший лок → переиспользуем
    fd = fs.openSync(lockFile, 'wx');
  }
  fs.writeSync(fd, String(process.pid));
  fs.closeSync(fd);

  const release = () => {
    process.removeListener('exit', release);
    try { fs.unlinkSync(lockFile); } catch {}
  };
  process.on('exit', release);
  return release;
}

module.exports = { acquireSerialGuard, DEFAULT_LOCK };
