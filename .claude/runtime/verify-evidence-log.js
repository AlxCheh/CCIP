#!/usr/bin/env node
/**
 * PostToolUse hook — verify-evidence-log.js (Wave 1 hardened)
 *
 * Срабатывает после Agent tool call с subagent_type === "ccip-session-optimizer".
 *
 * Layered verification:
 *   L1 (syntactic)  — manifest parsed, sentinel present, cardinality declared.
 *   L1b (firewall)  — bootstrap не содержит self-attestation лексем, ≤300 слов.
 *   L2 (semantic)   — каждая Evidence row substring-check против source_file.
 *   L3 (composit.)  — parsed evidence_rows == declared evidence_rows == bootstrap_claims.
 *
 * Violations пишутся в:
 *   docs/errors/sessions/<UTC-iso>-<git-short>.md  (per-session артефакт)
 *   docs/errors/session-opt-index.md               (index row)
 *   docs/errors/errors_log.md                      (видим следующей сессии)
 *
 * Hook не блокирует ответ (PostToolUse semantics), но violations видимы.
 * Любая ошибка хука — в stderr, exit 0 (родительская сессия не падает).
 *
 * SKILL-EXTRACTION MARKERS (added 2026-05-16; preparation for future skill extraction)
 *   // @skill: portable        — переезжает в skill runtime как есть
 *   // @skill: config:<KEY>    — параметризовать; значение в project config
 *   // @skill: project:<WHAT>  — project-bound; остаётся в CCIP или станет plugin'ом
 * Markers — метаданные для рефакторинга, не влияют на исполнение.
 * При extract'е: grep `@skill: portable` = skill core, grep `@skill: config` = config schema,
 * grep `@skill: project` = CCIP-side adapter / plugin.
 */

const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');
const crypto = require('crypto');

// @skill: portable — repo-root resolution pattern
const ROOT = path.resolve(__dirname, '../..');
// @skill: project:archive-layout — `docs/errors/sessions/`, `session-opt-index.md`, `errors_log.md` are CCIP layout
// @skill: portable — env-overridable persistence paths is good pattern (already plugin-friendly)
// Persistence paths overridable via env (used by smoke tests for isolation).
const SESSIONS_DIR = process.env.OPT_SESSIONS_DIR || path.join(ROOT, 'docs/errors/sessions');
const INDEX_FILE   = process.env.OPT_INDEX_FILE   || path.join(ROOT, 'docs/errors/session-opt-index.md');
const ERRORS_LOG   = process.env.OPT_ERRORS_LOG   || path.join(ROOT, 'docs/errors/errors_log.md');
// @skill: config:lock-path — `.claude/runtime/optimizer.lock`; per-project, env-overridable
const LOCK_FILE    = process.env.OPT_LOCK_FILE    || path.join(ROOT, '.claude/runtime/optimizer.lock');

// @skill: config:self-attestation-lexemes — language-specific vocabulary (ru+en here)
const BANNED_LEXEMES = /\b(verified|проверено|self[- ]?test|self[- ]?check|confirmed|validated|cross[- ]?checked|ensured|guaranteed)\b|[✔✅]/i;
// @skill: config:budget-numbers — bootstrap word limit + pre-flight token/call caps; per-project tunable
const BOOTSTRAP_WORD_LIMIT = 300;
const PREFLIGHT_TOKEN_LIMIT = 3000;
const PREFLIGHT_CALL_LIMIT = 6;
// @skill: config:source-prefix-vocabulary — each prefix needs a registered resolver (see verifyRowSource)
const ALLOWED_SOURCE_PREFIXES = ['repo:', 'git:', 'state-memory:'];

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
  } catch { return 'nogit'; }
}

function utcStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, 'Z');
}

function countWords(s) {
  return (s.match(/\S+/g) || []).length;
}

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
}

/** atomic-ish append: single writeSync < 4KB, fsync */
function atomicAppend(filePath, line) {
  if (!line.endsWith('\n')) line += '\n';
  if (Buffer.byteLength(line, 'utf-8') > 4000) {
    line = line.slice(0, 3990) + '...\n';
  }
  let fd;
  try {
    fd = fs.openSync(filePath, 'a');
    fs.writeSync(fd, line);
    fs.fsyncSync(fd);
  } catch (e) {
    process.stderr.write(`[verify-evidence-log] append fail ${filePath}: ${e.message}\n`);
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch {} }
  }
}

// ── extractors ───────────────────────────────────────────────────────────────

/** Require explicit sentinel `manifest=invariants-v1` after ```yaml */
function extractManifestBlock(text) {
  const re = /```yaml\s+manifest=invariants-v1\s*\n([\s\S]*?)\n```/;
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

/**
 * Extract section by header text. Level-aware termination:
 * h2 (`## `) section terminates at next h1/h2 (h3 subsections allowed inside);
 * h3 (`### `) section terminates at next h1/h2/h3.
 * Header is regex-escaped before substitution.
 */
function extractSection(text, header) {
  const esc = header.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  // Defense-in-depth (Wave 3): tolerate optional `Артефакт N — ` prefix from
  // the spec's structural template. Canonical emit form stays `## <header>`,
  // but the hook still captures the section if the agent drifts to the
  // template-labeled `### Артефакт N — <header>` form.
  const startRe = new RegExp(
    `^(#{2,3})\\s+(?:Артефакт\\s+\\d+\\s+[—-]\\s+)?${esc}\\b`, 'mi');
  const startMatch = text.match(startRe);
  if (!startMatch) return null;
  const level = startMatch[1].length; // 2 or 3
  const startIdx = startMatch.index;
  const boundaryRe = new RegExp(`\\n#{1,${level}}\\s`, 'g');
  boundaryRe.lastIndex = startIdx + startMatch[0].length;
  const b = boundaryRe.exec(text);
  return text.slice(startIdx, b ? b.index : text.length).trim();
}

// ── manifest parser (minimal YAML subset, no deps) ───────────────────────────

/**
 * Supports flat key:value pairs (numbers, strings with quotes, inline lists).
 * Ignores wrapper key like `invariants:` with no value.
 */
function parseManifest(yamlText) {
  if (!yamlText) return null;
  const obj = {};
  const lines = yamlText.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+#[^"']*$/, ''); // strip trailing comment (not inside quotes)
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const m = line.match(/^\s*([a-z_]+)\s*:\s*(.*?)\s*$/i);
    if (!m) continue;
    const key = m[1];
    const rawVal = m[2];
    if (!rawVal) continue; // wrapper key (e.g. `invariants:` line by itself)
    obj[key] = parseValue(rawVal);
  }
  return obj;
}

function parseValue(v) {
  v = v.trim();
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^\[.*\]$/.test(v)) {
    return v.slice(1, -1).split(',')
      .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }
  if (/^'.*'$/.test(v) || /^".*"$/.test(v)) return v.slice(1, -1);
  return v;
}

// ── evidence parser ──────────────────────────────────────────────────────────

/**
 * Parse markdown table rows from Evidence Log section.
 * Expects 5-column format: | # | claim | source_file | anchor | exact_substring |
 * Tolerates extra pipes in exact_substring by merging trailing cells.
 */
function parseEvidenceRows(evidenceSection) {
  const rows = [];
  if (!evidenceSection) return rows;
  const lines = evidenceSection.split(/\r?\n/);
  let inBody = false;
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim().startsWith('|')) {
      if (inBody) break; // table ended
      continue;
    }
    if (/^\|\s*[-:]+\s*\|/.test(line)) { inBody = true; continue; } // separator → body starts next row
    if (!inBody && /^\|\s*#\s*\|/i.test(line)) continue; // header row, wait for separator
    if (!inBody) continue;

    // Split on un-escaped `|` only; un-escape `\|` → `|` per cell so the
    // agent can quote source text containing literal pipes (Wave 2 fix #2).
    const cells = line.split(/(?<!\\)\|/)
      .map(c => c.trim().replace(/\\\|/g, '|'));
    if (cells[0] === '') cells.shift();
    if (cells[cells.length - 1] === '') cells.pop();
    if (cells.length < 5) continue;

    let [n, claim, source_file, anchor, ...rest] = cells;
    // Skip placeholder rows: agent uses "—" / "-" / "" in n-column to mean
    // "no claims this session" (legacy v2 behavior). Canonical empty Evidence
    // Log is header+separator only, but the parser tolerates the placeholder
    // form so a 0-claim bootstrap stays at 0 violations.
    if (n === '—' || n === '-' || n === '') continue;
    const exact_substring = rest.join('|').replace(/^`|`$/g, '').trim();

    rows.push({ n, claim, source_file, anchor, quote: exact_substring });
  }
  return rows;
}

// ── source verification ──────────────────────────────────────────────────────

function verifyRowSource(row) {
  const src = row.source_file;
  if (!src || !ALLOWED_SOURCE_PREFIXES.some(p => src.startsWith(p))) {
    return { ok: false, reason: 'source_prefix_invalid' };
  }
  // Wave 7: anti-telephone-game. Hook writes its own session artifacts under
  // docs/errors/sessions/; citing them as Evidence recycles prior bootstrap
  // content as if it were primary source. Reject before existence/substring.
  if (src.startsWith('repo:docs/errors/sessions/')) {
    return { ok: false, reason: 'source_is_session_artifact' };
  }
  if (!row.quote) return { ok: false, reason: 'quote_empty' };
  // Spec line 179: ≤ 80 bytes (UTF-8). Code units (.length) would under-count
  // multi-byte chars and let Cyrillic-heavy quotes slip past (Wave 2 fix #3).
  const quoteBytes = Buffer.byteLength(row.quote, 'utf-8');
  if (quoteBytes > 80) return { ok: false, reason: `quote_too_long(${quoteBytes}B)` };

  const colon = src.indexOf(':');
  const kind = src.slice(0, colon);
  let rest = src.slice(colon + 1);

  if (kind === 'git') {
    // git:<SHA>:<path> — verify via `git show <SHA>:<path>`
    const m = rest.match(/^([0-9a-f]{4,40}):(.+)$/i);
    if (!m) return { ok: false, reason: 'git_source_format' };
    const [, sha, gitPath] = m;
    // Reject paths that could be mis-parsed as git options or contain NUL.
    if (gitPath.startsWith('-') || gitPath.includes(' ')) {
      return { ok: false, reason: 'git_path_invalid' };
    }
    let content;
    try {
      content = execFileSync('git', ['show', `${sha}:${gitPath}`],
        { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).toString();
    } catch (e) {
      return { ok: false, reason: `git_show_fail(${sha}:${gitPath})` };
    }
    return content.includes(row.quote) ? { ok: true } : { ok: false, reason: 'quote_not_in_source' };
  }

  // repo: и state-memory: — оба resolve относительно ROOT
  const abs = path.isAbsolute(rest) ? rest : path.resolve(ROOT, rest);
  if (!fs.existsSync(abs)) return { ok: false, reason: 'source_file_missing' };
  let content;
  try { content = fs.readFileSync(abs, 'utf-8'); }
  catch (e) { return { ok: false, reason: `source_read_fail(${e.code || 'unknown'})` }; }

  return content.includes(row.quote)
    ? { ok: true }
    : { ok: false, reason: 'quote_not_in_source' };
}

// ── bootstrap firewall ───────────────────────────────────────────────────────

function bootstrapFirewall(bootstrap) {
  const v = [];
  if (!bootstrap) {
    v.push('FIREWALL_BOOTSTRAP_MISSING');
    return v;
  }
  const lex = bootstrap.match(BANNED_LEXEMES);
  if (lex) v.push(`FIREWALL_SELF_ATTEST: "${lex[0]}" найдена в bootstrap`);

  const wc = countWords(bootstrap);
  if (wc > BOOTSTRAP_WORD_LIMIT) v.push(`FIREWALL_WORDCOUNT: ${wc} > ${BOOTSTRAP_WORD_LIMIT}`);

  // Wave 4: branch claim verification. If bootstrap names a `Branch: <name>`,
  // it MUST match `git rev-parse --abbrev-ref HEAD`. Stale claims (e.g. copied
  // from a prior session) drift silently otherwise — see Wave 2 driver where
  // bootstrap claimed feat/t22-auditlog-partman while HEAD was on main.
  const branchClaim = bootstrap.match(/^Branch:\s+(\S+)/im);
  if (branchClaim) {
    let actual = null;
    try {
      actual = execSync('git rev-parse --abbrev-ref HEAD',
        { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {}
    if (actual && branchClaim[1] !== actual) {
      v.push(`FIREWALL_BRANCH_DRIFT: claimed=${branchClaim[1]} actual=${actual}`);
    }
  }

  // Wave 5: SHA token verification. `[sha:NNNNNNN]` literals reference git
  // objects; missing ones (e.g. fabricated or copied from prior session
  // bootstrap) leak stale state. Hex capture is safe to interpolate into
  // git cat-file because the regex only admits [0-9a-f]{4,40}.
  for (const m of bootstrap.matchAll(/\[sha:([0-9a-f]{4,40})\]/gi)) {
    try {
      execSync(`git cat-file -e ${m[1]}`, { cwd: ROOT, stdio: 'ignore' });
    } catch {
      v.push(`FIREWALL_SHA_NOT_FOUND: ${m[1]}`);
    }
  }

  return v;
}

// ── main ─────────────────────────────────────────────────────────────────────

function main() {
  let raw = '';
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', chunk => { raw += chunk; });
  process.stdin.on('end', () => {
    try { run(raw); }
    catch (e) {
      process.stderr.write(`[verify-evidence-log] FAIL: ${e.message}\n${e.stack || ''}\n`);
    }
    process.exit(0);
  });
}

if (require.main === module) main();

function run(raw) {
  let payload;
  try { payload = JSON.parse(raw); }
  catch (e) { process.stderr.write(`[verify-evidence-log] malformed payload: ${e.message}\n`); return; }

  if (payload.tool_name !== 'Agent') return;
  const subagent = payload.tool_input?.subagent_type;
  if (subagent !== 'ccip-session-optimizer') return;

  const text = responseText(payload.tool_response);
  if (!text || text.length < 50) {
    process.stderr.write('[verify-evidence-log] empty/short response — skip\n');
    return;
  }

  const violations = [];

  // ── L1 syntactic: manifest ─────────────────────────────────────────────────
  const yamlBlock = extractManifestBlock(text);
  const inv = parseManifest(yamlBlock);
  if (!inv) {
    violations.push('L1_MANIFEST_MISSING: блок ```yaml manifest=invariants-v1 ... ``` не найден');
  } else {
    if (inv.bootstrap_claims == null || inv.evidence_rows == null) {
      violations.push('L1_CARDINALITY_FIELDS_MISSING: bootstrap_claims или evidence_rows отсутствуют');
    } else if (inv.bootstrap_claims !== inv.evidence_rows) {
      violations.push(`L1_CARDINALITY_MISMATCH: bootstrap_claims=${inv.bootstrap_claims} != evidence_rows=${inv.evidence_rows}`);
    }
    if (inv.unverified_rows != null && inv.unverified_rows > 0) {
      violations.push(`L1_UNVERIFIED_PRESENT: ${inv.unverified_rows}`);
    }
    if (inv.preflight_tokens != null && inv.preflight_tokens > PREFLIGHT_TOKEN_LIMIT && inv.coverage !== 'partial') {
      violations.push(`L1_PREFLIGHT_BUDGET_EXCEEDED: tokens=${inv.preflight_tokens} > ${PREFLIGHT_TOKEN_LIMIT} без coverage:partial`);
    }
    if (inv.preflight_calls != null && inv.preflight_calls > PREFLIGHT_CALL_LIMIT && inv.coverage !== 'partial') {
      violations.push(`L1_PREFLIGHT_CALLS_EXCEEDED: calls=${inv.preflight_calls} > ${PREFLIGHT_CALL_LIMIT} без coverage:partial`);
    }
  }

  // ── extract artifacts ──────────────────────────────────────────────────────
  const report = extractSection(text, 'Session Optimization Report') || '';
  const evidenceSec = extractSection(text, 'Evidence Log') || '';
  const bootstrap = extractSection(text, 'Next-Session Bootstrap') || '';

  // ── L1b firewall: bootstrap ────────────────────────────────────────────────
  violations.push(...bootstrapFirewall(bootstrap));

  // ── L2 semantic: each evidence row ─────────────────────────────────────────
  const rows = parseEvidenceRows(evidenceSec);
  let verifiedCount = 0;
  for (const row of rows) {
    const res = verifyRowSource(row);
    if (!res.ok) {
      violations.push(`L2_EVIDENCE_ROW_${row.n}: ${res.reason} [source=${row.source_file}]`);
    } else {
      verifiedCount++;
    }
  }

  // ── L3 compositional: parsed count == declared count ──────────────────────
  if (inv?.evidence_rows != null && rows.length !== inv.evidence_rows) {
    violations.push(`L3_EVIDENCE_COUNT_DRIFT: declared=${inv.evidence_rows} parsed=${rows.length}`);
  }
  if (rows.length > 25) {
    violations.push(`L3_EVIDENCE_OVERFLOW: ${rows.length} rows > 25 limit`);
  }

  // ── persist ────────────────────────────────────────────────────────────────
  const stamp = utcStamp();
  const sha = gitShortHash();
  const sessionFile = `${stamp}-${sha}.md`;
  const sessionPath = path.join(SESSIONS_DIR, sessionFile);

  ensureDir(SESSIONS_DIR);

  const sessionBody = [
    `# Session Optimizer artifacts — ${stamp}`,
    `git: ${sha}`,
    `verified-by: verify-evidence-log.js (Wave 1 hardened)`,
    `evidence_rows_verified: ${verifiedCount}/${rows.length}`,
    '',
    violations.length
      ? `## VIOLATIONS (${violations.length})\n\n${violations.map(v => `- ${v}`).join('\n')}\n`
      : '## VIOLATIONS\n\n_none_\n',
    '## Manifest',
    '',
    '```yaml',
    yamlBlock || '# manifest missing',
    '```',
    '',
    report || '_Report section not found in agent output._',
    '',
    evidenceSec || '_Evidence Log section not found in agent output._',
    '',
    '## Bootstrap content hash',
    '',
    `sha256: ${crypto.createHash('sha256').update(bootstrap || '', 'utf8').digest('hex')}`,
    `wordcount: ${countWords(bootstrap)}`,
    '',
  ].join('\n');

  try { fs.writeFileSync(sessionPath, sessionBody); }
  catch (e) { process.stderr.write(`[verify-evidence-log] write session fail: ${e.message}\n`); }

  // index row (atomic-ish append)
  const indexLine = `| ${stamp} | ${sessionFile} | ${inv?.bootstrap_claims ?? '?'} | ${inv?.evidence_rows ?? '?'} | ${verifiedCount}/${rows.length} | ${inv?.coverage ?? '?'} | ${inv?.trigger_match ?? '?'} | ${violations.length} |`;
  atomicAppend(INDEX_FILE, indexLine);

  if (violations.length) {
    const errLine = `\n### ${stamp} — VIOLATIONS detected (${violations.length})\n\nfile: \`docs/errors/sessions/${sessionFile}\`\n\n${violations.map(v => `- ${v}`).join('\n')}\n`;
    atomicAppend(ERRORS_LOG, errLine);
    process.stderr.write(`[verify-evidence-log] ${violations.length} violation(s); see ${sessionFile}\n`);
  }

  try { if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE); } catch {}
}

module.exports = {
  extractManifestBlock, parseManifest, parseValue, parseEvidenceRows,
  verifyRowSource, bootstrapFirewall, run,
};
