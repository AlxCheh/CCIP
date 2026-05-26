'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { gitRoot } = require('./git-root');

const ROOT = gitRoot();
const HOOK = path.join(ROOT, '.claude/runtime/verify-evidence-log.js');

function setupTmp() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccip-opt-'));
  const sessions = path.join(root, 'sessions');
  fs.mkdirSync(sessions);
  return { root, sessions, index: path.join(root, 'index.md'), errors: path.join(root, 'errors.md'), lock: path.join(root, 'optimizer.lock') };
}
function teardown(tmp) { try { fs.rmSync(tmp.root, { recursive: true, force: true }); } catch {} }

function runHook(agentOutput, tmp, extraEnv = {}) {
  const payload = { tool_name: 'Agent', tool_input: { subagent_type: 'ccip-session-optimizer' }, tool_response: { content: agentOutput } };
  return cp.spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload), encoding: 'utf8',
    env: { ...process.env, OPT_SESSIONS_DIR: tmp.sessions, OPT_INDEX_FILE: tmp.index, OPT_ERRORS_LOG: tmp.errors, OPT_LOCK_FILE: tmp.lock, ...extraEnv },
  });
}
function latestSession(tmp) {
  const files = fs.readdirSync(tmp.sessions).filter(f => f.endsWith('.md')).sort();
  return files.length ? fs.readFileSync(path.join(tmp.sessions, files[files.length - 1]), 'utf-8') : null;
}
module.exports = { ROOT, HOOK, setupTmp, teardown, runHook, latestSession };
