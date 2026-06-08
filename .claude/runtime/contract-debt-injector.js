#!/usr/bin/env node
'use strict';
/**
 * UserPromptSubmit hook (RFC §5.2 Level-2 correct) — when contract_debt > 0,
 * injects a State Update reminder into the system context of the next turn.
 * This closes the live-session feedback loop for repeated missing ## State Update.
 * Fail-open: any error → exit 0 + empty stdout (no injection).
 *
 * [INV-CONTRACT-CORRECTION] RFC §5.2 Level 2 — re-inject ## State Update reminder
 * when contract_debt > 0.
 */

function buildInjection(state) {
  const debt = state && state.contract_debt ? Number(state.contract_debt) : 0;
  if (debt <= 0) return '';
  return `⚠️ GOVERNANCE REMINDER (contract_debt=${debt}): `
    + `All agents MUST end their output with a ## State Update block `
    + `(CLAUDE.md §15). ${debt} agent(s) this session omitted it. `
    + `Ensure the next agent response includes the block.`;
}

module.exports = { buildInjection };

// ── main (UserPromptSubmit entrypoint) ─────────────────────────────────────────
if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const ROOT = path.resolve(__dirname, '../..');
  const STATE_FILE = process.env.CCIP_STATE_FILE
    || path.join(ROOT, '.claude/runtime/session-state.json');

  let raw = '';
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', c => { raw += c; });
  process.stdin.on('end', () => {
    try {
      JSON.parse(raw); // validate stdin (UserPromptSubmit payload)
      const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      const msg = buildInjection(state);
      if (msg) {
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: { additionalSystemPrompt: msg },
        }));
      }
    } catch (e) {
      process.stderr.write(`[contract-debt-injector] ${e.message}\n`); // fail-open
    }
    process.exit(0);
  });
}
