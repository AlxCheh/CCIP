#!/usr/bin/env node
'use strict';
/**
 * PostToolUse hook — watches writes to .claude/agents/*.md.
 *
 * When a Write or Edit touches an agent file:
 *   1. Writes .claude/runtime/agents-changed.flag (JSON, last-write-wins)
 *   2. Prints a visible stderr notification prompting to run ccip-claude-md-auditor
 *
 * Fail-open: any error → exit 0, never blocks the parent session.
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const FLAG = path.join(ROOT, '.claude/runtime/agents-changed.flag');

/** Normalise Windows backslashes for pattern matching. */
function normPath(p) {
  return typeof p === 'string' ? p.replace(/\\/g, '/') : '';
}

/** True when the path is an agent prompt file. */
function isAgentFile(p) {
  const n = normPath(p);
  return /(?:^|\/)\.claude\/agents\/[^/]+\.md$/.test(n);
}

/** Write the flag atomically (tmp-rename). */
function writeFlag(filePath) {
  const payload = JSON.stringify({
    ts:   new Date().toISOString(),
    file: path.basename(filePath),
    path: filePath,
    note: 'Run ccip-claude-md-auditor to sync CLAUDE.md routing',
  }, null, 2) + '\n';

  const tmp = FLAG + '.tmp.' + process.pid;
  const fd  = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, payload);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, FLAG);
}

if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', c => { raw += c; });
  process.stdin.on('end', () => {
    try {
      const p     = JSON.parse(raw || '{}');
      const event = p.hook_event_name;
      const tool  = p.tool_name;

      if (event !== 'PostToolUse') return process.exit(0);
      if (tool !== 'Write' && tool !== 'Edit') return process.exit(0);

      const filePath = p.tool_input && p.tool_input.file_path;
      if (!isAgentFile(filePath)) return process.exit(0);

      const agentName = path.basename(filePath, '.md');
      writeFlag(filePath);

      process.stderr.write(
        `\n[agent-file-watcher] Файл агента изменён: ${agentName}.md\n` +
        `  → Запустить ccip-claude-md-auditor для синхронизации CLAUDE.md\n\n`
      );
    } catch (_) {
      // fail-open: никогда не блокируем сессию
    }
    process.exit(0);
  });
}

module.exports = { isAgentFile, normPath };
