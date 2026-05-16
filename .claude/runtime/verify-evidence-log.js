#!/usr/bin/env node
/**
 * PostToolUse hook — срабатывает после любого Agent tool call.
 * Действует только если subagent_type === "ccip-session-optimizer".
 *
 * Задачи (детерминированная пост-обработка):
 *   1. Извлечь манифест инвариантов (```yaml ... ```) из вывода агента.
 *   2. Проверить кардинальность: bootstrap_claims == evidence_rows && unverified_rows == 0.
 *   3. Извлечь Артефакт 1 (Report) + Артефакт 3 (Evidence Log) и записать
 *      в docs/errors/sessions/<UTC-iso>-<git-short>.md.
 *   4. Дописать строку в docs/errors/session-opt-index.md.
 *   5. Дописать одну запись в docs/errors/errors_log.md → "Session Optimization".
 *   6. Снять lock .claude/runtime/optimizer.lock (если есть).
 *   7. Любая ошибка — в stderr, exit 0 (не ломаем родительскую сессию).
 *
 * Hook НЕ блокирует ответ агента (PostToolUse в Claude Code так устроен).
 * При нарушениях кардинальности — пишет VIOLATION в stderr и в session-opt-index.
 * Это видимый сигнал, что bootstrap нельзя автоматически доверять.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../..');
const SESSIONS_DIR = path.join(ROOT, 'docs/errors/sessions');
const INDEX_FILE = path.join(ROOT, 'docs/errors/session-opt-index.md');
const ERRORS_LOG = path.join(ROOT, 'docs/errors/errors_log.md');
const LOCK_FILE = path.join(ROOT, '.claude/runtime/optimizer.lock');

// ── helpers ──────────────────────────────────────────────────────────────────

function responseText(toolResponse) {
  if (!toolResponse) return '';
  if (typeof toolResponse === 'string') return toolResponse;
  const c = toolResponse.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map(x => x.text || x.content || '').join('\n');
  return JSON.stringify(toolResponse);
}

function gitShortHash() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
  } catch {
    return 'nogit';
  }
}

function utcStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, 'Z');
}

function extractYamlBlock(text, marker) {
  const re = new RegExp(`\`\`\`yaml\\s*([\\s\\S]*?${marker}[\\s\\S]*?)\`\`\``, 'i');
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

function parseInvariants(yamlText) {
  if (!yamlText) return null;
  const get = (key) => {
    const m = yamlText.match(new RegExp(`^\\s*${key}\\s*:\\s*(.+)$`, 'm'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
  };
  const num = (key) => {
    const v = get(key);
    if (v === null) return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  };
  return {
    bootstrap_claims: num('bootstrap_claims'),
    evidence_rows: num('evidence_rows'),
    unverified_rows: num('unverified_rows'),
    quarantined: num('quarantined'),
    preflight_tokens: num('preflight_tokens'),
    coverage: get('coverage'),
    trigger_match: get('trigger_match'),
  };
}

function extractSection(text, header) {
  const re = new RegExp(`(### ${header}[\\s\\S]*?)(?=\\n### |\\n## |$)`, 'i');
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

function appendFileSafe(filePath, content) {
  try { fs.appendFileSync(filePath, content); }
  catch (e) { process.stderr.write(`[verify-evidence-log] append fail ${filePath}: ${e.message}\n`); }
}

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
}

// ── main ─────────────────────────────────────────────────────────────────────

let raw = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  try { run(raw); }
  catch (e) { process.stderr.write(`[verify-evidence-log] FAIL: ${e.message}\n${e.stack || ''}\n`); }
  process.exit(0);
});

function run(raw) {
  let payload;
  try { payload = JSON.parse(raw); }
  catch (e) { process.stderr.write(`[verify-evidence-log] malformed payload: ${e.message}\n`); return; }

  if (payload.tool_name !== 'Agent') return;

  const subagent = payload.tool_input?.subagent_type
    || (payload.tool_input?.description || '').match(/ccip-session-optimizer/i)?.[0];
  if (!subagent || !/ccip-session-optimizer/i.test(subagent)) return;

  const text = responseText(payload.tool_response);
  if (!text || text.length < 50) {
    process.stderr.write('[verify-evidence-log] empty/short response — skip\n');
    return;
  }

  const yamlBlock = extractYamlBlock(text, 'invariants');
  const inv = parseInvariants(yamlBlock);
  const report = extractSection(text, 'Session Optimization Report') || extractSection(text, 'Отчёт оптимизации') || '';
  const evidence = extractSection(text, 'Evidence Log') || extractSection(text, 'Журнал доказательств') || '';
  const bootstrap = extractSection(text, 'Bootstrap') || '';

  const violations = [];
  if (!inv) {
    violations.push('MANIFEST_MISSING: блок ```yaml invariants: ... ``` не найден');
  } else {
    if (inv.bootstrap_claims === null || inv.evidence_rows === null) {
      violations.push('CARDINALITY_FIELDS_MISSING: bootstrap_claims или evidence_rows отсутствуют');
    } else if (inv.bootstrap_claims !== inv.evidence_rows) {
      violations.push(`CARDINALITY_MISMATCH: bootstrap_claims=${inv.bootstrap_claims} != evidence_rows=${inv.evidence_rows}`);
    }
    if (inv.unverified_rows !== null && inv.unverified_rows > 0) {
      violations.push(`UNVERIFIED_PRESENT: unverified_rows=${inv.unverified_rows} (должно быть 0)`);
    }
    if (inv.preflight_tokens !== null && inv.preflight_tokens > 3000) {
      violations.push(`PREFLIGHT_BUDGET_EXCEEDED: ${inv.preflight_tokens} > 3000`);
    }
  }

  const stamp = utcStamp();
  const sha = gitShortHash();
  const sessionFile = `${stamp}-${sha}.md`;
  const sessionPath = path.join(SESSIONS_DIR, sessionFile);

  ensureDir(SESSIONS_DIR);

  const sessionBody = [
    `# Session Optimizer artifacts — ${stamp}`,
    `git: ${sha}`,
    `verified-by: verify-evidence-log.js`,
    '',
    violations.length ? `## VIOLATIONS\n\n${violations.map(v => `- ${v}`).join('\n')}\n` : '## VIOLATIONS\n\n_none_\n',
    '## Invariants',
    '',
    '```yaml',
    yamlBlock || '# manifest missing',
    '```',
    '',
    report ? report : '_Report section not found in agent output._',
    '',
    evidence ? evidence : '_Evidence Log section not found in agent output._',
    '',
    '## Bootstrap content hash',
    '',
    `sha256: ${crypto.createHash('sha256').update(bootstrap, 'utf8').digest('hex')}`,
    '',
  ].join('\n');

  try {
    fs.writeFileSync(sessionPath, sessionBody);
  } catch (e) {
    process.stderr.write(`[verify-evidence-log] write session fail: ${e.message}\n`);
  }

  const indexLine = `| ${stamp} | ${sessionFile} | ${inv?.bootstrap_claims ?? '?'} | ${inv?.evidence_rows ?? '?'} | ${inv?.coverage ?? '?'} | ${inv?.trigger_match ?? '?'} | ${violations.length || 0} |\n`;
  appendFileSafe(INDEX_FILE, indexLine);

  if (violations.length) {
    const errLine = `\n### ${stamp} — VIOLATIONS detected\n\nfile: \`docs/errors/sessions/${sessionFile}\`\n\n${violations.map(v => `- ${v}`).join('\n')}\n`;
    appendFileSafe(ERRORS_LOG, errLine);
    process.stderr.write(`[verify-evidence-log] ${violations.length} violation(s); see ${sessionFile}\n`);
  }

  try { if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE); } catch {}
}
