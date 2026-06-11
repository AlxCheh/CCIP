const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { gitRoot } = require('../_lib/git-root');

const { readStateRaw, writeStateAtomic, updateStateLocked } =
  require(path.join(gitRoot(), '.claude/runtime/state-io.js'));

const tmpState = (s) => path.join(os.tmpdir(), `ccip-state-io-test-${process.pid}-${s}.json`);

test('writeStateAtomic round-trips and leaves no .tmp', () => {
  const f = tmpState('rt');
  writeStateAtomic({ session_id: 'x', observations: [] }, f);
  assert.deepEqual(readStateRaw(f).session_id, 'x');
  const residue = fs.readdirSync(path.dirname(f)).filter(n => n.startsWith(path.basename(f)) && n.includes('.tmp'));
  assert.deepEqual(residue, []);
  fs.unlinkSync(f); try { fs.unlinkSync(f + '.bak'); } catch {}
});

test('readStateRaw recovers from .bak when main is corrupt (R-1 parity)', () => {
  const f = tmpState('bak');
  fs.writeFileSync(f + '.bak', JSON.stringify({ session_id: 'from-bak', governance_alerts: [] }));
  fs.writeFileSync(f, '{ this is : not json');
  const s = readStateRaw(f);
  assert.strictEqual(s.session_id, 'from-bak');
  assert.ok(s.governance_alerts.some(a => a.kind === 'state_recovered_from_backup'),
    'recovery must leave a visible governance_alert (R-1)');
  fs.unlinkSync(f); fs.unlinkSync(f + '.bak');
});

test('updateStateLocked applies mutator and persists', () => {
  const f = tmpState('upd');
  writeStateAtomic({ session_id: 's', observations: [] }, f);
  updateStateLocked(f, (st) => { st.observations.push({ n: 1 }); });
  assert.strictEqual(readStateRaw(f).observations.length, 1);
  fs.unlinkSync(f); try { fs.unlinkSync(f + '.bak'); } catch {}
});
