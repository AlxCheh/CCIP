#!/usr/bin/env node
'use strict';
/**
 * Increments sessions_in_quarantine for eligible quarantine rules (D-17).
 * Called from audit-session-reset.js at SessionStart.
 * Eligible = status:'quarantine' AND requires_transcript_access != true.
 * Uses js-yaml if available; graceful no-op if not.
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_QUARANTINE = path.join(__dirname, '../../.claude/audit/rules/quarantine.yaml');

function incrementQuarantineCounters(quarantineFile) {
  const file = quarantineFile || DEFAULT_QUARANTINE;
  let yaml;
  try { yaml = require('js-yaml'); } catch {
    process.stderr.write('[quarantine-increment] js-yaml not found — skipping counter increment\n');
    return false;
  }
  let raw;
  try { raw = fs.readFileSync(file, 'utf-8'); } catch (e) {
    process.stderr.write(`[quarantine-increment] cannot read ${file}: ${e.message}\n`);
    return false;
  }
  let doc;
  try { doc = yaml.load(raw); } catch (e) {
    process.stderr.write(`[quarantine-increment] YAML parse error: ${e.message}\n`);
    return false;
  }
  if (!doc || !Array.isArray(doc.quarantine)) return false;

  let changed = false;
  for (const rule of doc.quarantine) {
    if (rule.status === 'quarantine' && rule.requires_transcript_access !== true) {
      rule.sessions_in_quarantine = (rule.sessions_in_quarantine || 0) + 1;
      changed = true;
    }
  }
  if (!changed) return false;

  try {
    const tmp = file + '.tmp.' + process.pid;
    fs.writeFileSync(tmp, yaml.dump(doc), 'utf-8');
    fs.renameSync(tmp, file);
    return true;
  } catch (e) {
    process.stderr.write(`[quarantine-increment] write error: ${e.message}\n`);
    return false;
  }
}

module.exports = { incrementQuarantineCounters };

if (require.main === module) {
  const ok = incrementQuarantineCounters();
  if (ok) process.stdout.write('[quarantine-increment] counters updated\n');
  process.exit(0);
}
