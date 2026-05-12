'use strict';

function fail(code, msg, context = {}) {
  const ctxStr = Object.keys(context).length
    ? ' ' + Object.entries(context).map(([k, v]) => `${k}=${v}`).join(' ')
    : '';
  const line = `[${code}] ${msg}${ctxStr}\n`;
  process.stderr.write(line);
  return line;
}

function ok(code) {
  process.stdout.write(`[${code}] OK\n`);
  return true;
}

module.exports = { fail, ok };
