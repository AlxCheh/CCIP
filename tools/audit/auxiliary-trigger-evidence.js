#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gitRoot } = require('./_lib/git-root');
const { fail, ok } = require('./_lib/report');

const root = gitRoot();
const claudeMd = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf-8');
const settings = JSON.parse(fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf-8'));

const auxTable = (claudeMd.match(/## Auxiliary Agents[\s\S]*?(?=\n## )/) || [''])[0];
const rows = auxTable.split('\n')
  .filter(l => l.startsWith('|') && !l.startsWith('|--'))
  .map(l => l.split('|').map(s => s.trim()).filter(Boolean))
  .filter(r => r.length === 2 && !/^Agent$/i.test(r[0]));

const hookMatchers = new Set();
for (const phase of Object.values(settings.hooks || {})) {
  for (const block of phase) {
    if (block.matcher) hookMatchers.add(block.matcher);
    for (const h of block.hooks || []) hookMatchers.add(h.command || '');
  }
}

// Note: \b does not work across Cyrillic chars in JS regex, so use loose matches for RU words.
const PROMISES_SCHEDULE = /(расписан|schedule|cron|daily|periodic)/i;
const PROMISES_FILECHANGE = /(после.*(изменен|правок|edit)|after.*(edit|change|push)|изменения\s+CLAUDE)/i;

// Triggers that explicitly mark themselves manual are accepted without hook evidence.
const MANUAL_PREFIX = /(по запросу|manual|вручную|on demand|by request|PR.review)/i;

let violations = 0;
for (const [agent, trigger] of rows) {
  const clean = agent.replace(/`/g, '');
  if (MANUAL_PREFIX.test(trigger)) continue;
  if (PROMISES_SCHEDULE.test(trigger)) {
    const hasSchedule = [...hookMatchers].some(m => /schedule|cron/i.test(m));
    if (!hasSchedule) {
      violations++;
      fail('AUX-TRIGGER', `${clean}: claims schedule trigger ("${trigger}") but no scheduled hook in settings.json`);
    }
  }
  if (PROMISES_FILECHANGE.test(trigger)) {
    const hasPostEdit = [...hookMatchers].some(m => /post.*edit|post.*write|file_change/i.test(m));
    if (!hasPostEdit) {
      violations++;
      fail('AUX-TRIGGER', `${clean}: claims file-change trigger ("${trigger}") but no matching hook in settings.json`);
    }
  }
}

if (violations === 0) ok('AUX-TRIGGER');
process.exit(violations === 0 ? 0 : 1);
