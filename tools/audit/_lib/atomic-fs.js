'use strict';
const fs = require('node:fs');

/** Atomic write: tmp file → fsync → rename → fsync directory. */
function atomicWriteJson(targetPath, obj) {
  const tmpPath = targetPath + '.tmp.' + process.pid;
  const data = JSON.stringify(obj, null, 2) + '\n';
  const fd = fs.openSync(tmpPath, 'w');
  try {
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmpPath, targetPath);
  // Best-effort directory fsync (Windows может вернуть EPERM — игнорируем там).
  try {
    const dirFd = fs.openSync(require('node:path').dirname(targetPath), 'r');
    fs.fsyncSync(dirFd);
    fs.closeSync(dirFd);
  } catch (e) {
    if (e.code !== 'EPERM' && e.code !== 'EISDIR' && e.code !== 'EACCES') throw e;
  }
}
module.exports = { atomicWriteJson };
