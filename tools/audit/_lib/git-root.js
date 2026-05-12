'use strict';
const cp = require('node:child_process');

let cached = null;
function gitRoot() {
  if (cached) return cached;
  const out = cp.execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
  if (!out) throw new Error('not in a git repo');
  cached = out;
  return cached;
}
module.exports = { gitRoot };
