'use strict';
const path = require('node:path');
const fs = require('node:fs');
const cp = require('node:child_process');

/**
 * Возвращает абсолютные пути файлов, соответствующих glob-паттерну,
 * с учётом .gitignore. Использует git для дешёвой фильтрации (без fast-glob dep).
 */
function walk(root, patterns) {
  const args = ['ls-files', '-co', '--exclude-standard', '--', ...patterns];
  const out = cp.execFileSync('git', args, { cwd: root, encoding: 'utf-8' });
  return out.split('\n').filter(Boolean).map(p => path.join(root, p));
}
module.exports = { walk };
