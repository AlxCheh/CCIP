'use strict';
const path = require('node:path');
const fs = require('node:fs');
const cp = require('node:child_process');

/**
 * Возвращает абсолютные пути файлов, соответствующих glob-паттерну,
 * с учётом .gitignore. Использует git для дешёвой фильтрации (без fast-glob dep).
 *
 * tools/audit/__fixtures__/ исключается всегда: фикстуры по дизайну содержат
 * нарушения для тестов audit-скриптов и вызываются явно через --target.
 */
const FIXTURE_PREFIX = 'tools/audit/__fixtures__/';

function walk(root, patterns) {
  const args = ['ls-files', '-co', '--exclude-standard', '--', ...patterns];
  const out = cp.execFileSync('git', args, { cwd: root, encoding: 'utf-8' });
  return out
    .split('\n')
    .filter(Boolean)
    .filter(p => !p.replace(/\\/g, '/').startsWith(FIXTURE_PREFIX))
    .map(p => path.join(root, p));
}
module.exports = { walk };
