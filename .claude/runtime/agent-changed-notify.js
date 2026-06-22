#!/usr/bin/env node
'use strict';
/**
 * UserPromptSubmit hook — fires on every user message.
 * Checks .claude/runtime/agents-changed.flag written by agent-file-watcher.js.
 *
 * If flag exists:
 *   1. Reads agent name + timestamp from flag
 *   2. Deletes flag (one-shot — notifies once, not on every message)
 *   3. Writes structured stderr marker → Claude sees it as hook additional context
 *      and calls PushNotification
 *
 * Fail-open: any error → exit 0, never blocks the session.
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const FLAG = path.join(ROOT, '.claude/runtime/agents-changed.flag');

if (require.main === module) {
  try {
    if (!fs.existsSync(FLAG)) process.exit(0);

    const data     = JSON.parse(fs.readFileSync(FLAG, 'utf-8'));
    const agentName = data.file || 'unknown agent';
    const ts        = data.ts   ? ` (${data.ts.slice(0, 16).replace('T', ' ')})` : '';

    // Consume flag before writing output — prevent double-notify on rapid turns
    fs.unlinkSync(FLAG);

    // Marker read by Claude Code → appears as "UserPromptSubmit hook additional context"
    // Claude MUST call PushNotification upon seeing [PUSH-NOTIFY] tag.
    process.stderr.write(
      `[agent-changed-notify] [PUSH-NOTIFY] Файл агента изменён: ${agentName}${ts}\n` +
      `Сообщение для PushNotification: "Agent changed: ${agentName} → run ccip-claude-md-auditor"\n`
    );
  } catch (_) {
    // fail-open
  }
  process.exit(0);
}

module.exports = { FLAG };
