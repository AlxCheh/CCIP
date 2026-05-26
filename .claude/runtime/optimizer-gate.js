#!/usr/bin/env node
/**
 * PreToolUse gate — single-flight для ccip-session-optimizer (finding C-4).
 * Deny при живом lock'е (ts < TTL, иной turn_id). Иначе пишет lock и allow.
 * Внутренняя ошибка → allow (fail-open: не ломаем легитимный запуск).
 *
 * Lock-path env-overridable (OPT_LOCK_FILE) для изоляции тестов; TTL — OPT_LOCK_TTL_MS.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const LOCK_FILE = process.env.OPT_LOCK_FILE || path.join(ROOT, '.claude/runtime/optimizer.lock');
const TTL_MS = parseInt(process.env.OPT_LOCK_TTL_MS || '300000', 10); // 5 min

function out(obj) { process.stdout.write(JSON.stringify(obj)); }
function allow() { /* пустой вывод = pass-through */ }
function deny(reason) {
  out({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });
}

let raw = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', c => { raw += c; });
process.stdin.on('end', () => {
  try {
    const p = JSON.parse(raw);
    if (p.tool_name !== 'Agent' || p.tool_input?.subagent_type !== 'ccip-session-optimizer') { allow(); return process.exit(0); }
    const turnId = String(p.turn_id ?? 'unknown');

    if (fs.existsSync(LOCK_FILE)) {
      try {
        const lock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf-8'));
        const age = Date.now() - new Date(lock.ts).getTime();
        if (age < TTL_MS && lock.turn_id !== turnId) {
          deny(`optimizer already ran this session (lock @ ${lock.ts}); skipping re-entry`);
          return process.exit(0);
        }
      } catch {
        deny('optimizer.lock corrupt — manual recovery required (see §R)');
        return process.exit(0);
      }
    }
    fs.writeFileSync(LOCK_FILE, JSON.stringify({ ts: new Date().toISOString(), turn_id: turnId }));
    allow();
  } catch (e) {
    process.stderr.write(`[optimizer-gate] ${e.message}\n`);
    allow(); // fail-open
  }
  process.exit(0);
});
