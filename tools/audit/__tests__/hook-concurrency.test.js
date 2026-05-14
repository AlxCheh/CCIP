const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { gitRoot } = require('../_lib/git-root');

const root = gitRoot();
const HOOK = path.join(root, '.claude/runtime/post-agent-hook.js');
const STATE = path.join(root, '.claude/runtime/session-state.json');

test('20-way concurrent hook produces valid JSON and leaves no .tmp residue', async () => {
  const original = fs.readFileSync(STATE, 'utf-8');
  try {
    fs.writeFileSync(STATE, JSON.stringify({
      session_id: '2026-05-12-test', task: 'concurrency', intents: [], risk: 'LOW',
      confidence: 'HIGH', routing: 'direct', dag: [
        { step: 1, agent: 'ccip-architect', status: 'pending', depends_on: [] }
      ], current_step: 0, agent_outputs: {}, status: 'executing',
      started_at: '', observations: []
    }), 'utf-8');

    const procs = [];
    for (let i = 0; i < 20; i++) {
      const payload = JSON.stringify({
        tool_name: 'Agent',
        tool_input: { subagent_type: 'ccip-architect', description: `run ${i}` },
        tool_response: { content: `## State Update\n\`\`\`json\n{"summary":"r${i}","artifacts":[],"handoff_notes":""}\n\`\`\`` }
      });
      procs.push(new Promise(resolve => {
        const p = cp.spawn(process.execPath, [HOOK]);
        p.stdin.write(payload);
        p.stdin.end();
        p.on('exit', () => resolve());
      }));
    }
    await Promise.all(procs);

    const finalRaw = fs.readFileSync(STATE, 'utf-8');
    assert.doesNotThrow(() => { JSON.parse(finalRaw); }, 'state.json must remain valid JSON');

    const tmps = fs.readdirSync(path.dirname(STATE)).filter(f => f.includes('.tmp'));
    assert.deepEqual(tmps, [], 'no .tmp file should remain after concurrent writers settle');
  } finally {
    fs.writeFileSync(STATE, original, 'utf-8');
  }
});
