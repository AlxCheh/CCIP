#!/usr/bin/env node
'use strict';
/**
 * audit-write-sanitize.js — защита `.claude/audit/` от двух LLM-bug'ов token-efficiency-auditor:
 *   1. PreToolUse: блокирует Write/Edit с file_path вида `.claude/audit/reports<X>` или
 *      `.claude/audit/evidence<X>` без `/` — конкатенация dir+filename без сепаратора.
 *   2. PostToolUse: стрипает UTF-8 BOM (EF BB BF) с начала `.claude/audit/rules/*.yaml`,
 *      т.к. parseYaml/audit-suite не толерируют BOM (см. reference_token_audit_bom_bug).
 *
 * Fail-open: любая внутренняя ошибка → pass-through (никогда не ломаем легитимную запись).
 */
const fs = require('fs');
const path = require('path');

function denyPre(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
}

/** Возвращает { type, badSuffix } если путь вида `.../audit/reports<X>` без `/` после reports/evidence. */
function detectMalformedAuditPath(p) {
  if (typeof p !== 'string' || !p) return null;
  const norm = p.replace(/\\/g, '/');
  const m = norm.match(/(?:^|\/)\.claude\/audit\/(reports|evidence)([^/].*)?$/);
  if (m && m[2]) return { type: m[1], badSuffix: m[2] };
  return null;
}

/** Путь, который должен быть санитизирован от BOM (только активные rule-файлы). */
function isAuditRulesYaml(p) {
  if (typeof p !== 'string' || !p) return false;
  const norm = p.replace(/\\/g, '/');
  return /(?:^|\/)\.claude\/audit\/rules\/[^/]+\.yaml$/.test(norm);
}

function stripBomAtomic(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 3 || buf[0] !== 0xEF || buf[1] !== 0xBB || buf[2] !== 0xBF) return false;
  const tmp = file + '.tmp.' + process.pid;
  const fd = fs.openSync(tmp, 'w');
  try { fs.writeSync(fd, buf.slice(3)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try { fs.renameSync(tmp, file); }
  catch (e) { try { fs.unlinkSync(tmp); } catch {} throw e; }
  return true;
}

// stdin-driven hook logic runs ONLY when invoked as a script.
// On `require` (unit tests import the exported helpers) we must NOT attach
// stdin listeners — they keep the importing process alive forever (stdin never
// EOFs under the test runner), hanging the suite until the 6h CI timeout.
if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', c => { raw += c; });
  process.stdin.on('end', () => {
    try {
      const p = JSON.parse(raw || '{}');
      const tool = p.tool_name;
      if (tool !== 'Write' && tool !== 'Edit') return process.exit(0);

      const filePath = p.tool_input && p.tool_input.file_path;
      const event = p.hook_event_name;

      if (event === 'PreToolUse') {
        const bad = detectMalformedAuditPath(filePath);
        if (bad) {
          const ext = bad.type === 'reports' ? '.md' : '.json';
          denyPre(
            `Malformed audit path '${filePath}': missing separator between '${bad.type}' and filename. ` +
            `Use '.claude/audit/${bad.type}/<session-id>${ext}' (with '/').`
          );
          return process.exit(0);
        }
        return process.exit(0);
      }

      if (event === 'PostToolUse') {
        if (!isAuditRulesYaml(filePath)) return process.exit(0);
        try {
          if (stripBomAtomic(filePath)) {
            process.stderr.write(`[audit-write-sanitize] stripped UTF-8 BOM from ${filePath}\n`);
          }
        } catch (e) {
          process.stderr.write(`[audit-write-sanitize] BOM strip failed for ${filePath}: ${e.message}\n`);
        }
        return process.exit(0);
      }
    } catch (e) {
      process.stderr.write(`[audit-write-sanitize] ${e.message}\n`);
    }
    process.exit(0);
  });
}

module.exports = { detectMalformedAuditPath, isAuditRulesYaml, stripBomAtomic };
