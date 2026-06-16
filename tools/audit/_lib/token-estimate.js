'use strict';
/**
 * token-estimate.js — эвристическая оценка токенов из объёма tool-I/O.
 *
 * ADR-016 / ADR-020: raw transcript и reasoning-токены главного агента хукам
 * НЕДОСТУПНЫ. Это ЧАСТИЧНАЯ атрибуция объёма РЕЗУЛЬТАТОВ инструментов (что Read/
 * Bash/Grep вернули в контекст), не точный биллинг и не полные токены сессии.
 *
 * Модель: tokens ≈ bytes / K(r), r = доля не-ASCII символов. Кириллица токен-дороже
 * (меньше байт на токен) → меньший делитель → больше токенов. Калибровка через env
 * CCIP_TOK_K_ASCII / CCIP_TOK_K_CYR или per-call opts.
 */
// K_ASCII=4: Claude tokenizes ~4 bytes/token for ASCII (public heuristic; not API-validated).
// K_CYR=3: Cyrillic UTF-8 encodes 2 bytes/char but spans 1+ tokens → smaller divisor.
// These defaults are empirical; calibrate via env vars if real tokenizer counts are available.
const K_ASCII = Number(process.env.CCIP_TOK_K_ASCII || 4);
const K_CYR   = Number(process.env.CCIP_TOK_K_CYR   || 3);

/** Доля символов с codepoint > 127 (грубый сигнал кириллицы/мультибайта). */
function nonAsciiRatio(text) {
  if (!text) return 0;
  let nonAscii = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) > 127) nonAscii++;
  return text.length ? Number((nonAscii / text.length).toFixed(3)) : 0;
}

/** bytes + non-ASCII ratio → оценка токенов (целое, ≥0). */
function estimateTokens(bytes, ratio, opts = {}) {
  const b  = Math.max(0, Number(bytes) || 0);
  const r  = Math.max(0, Math.min(1, Number(ratio) || 0));
  const kA = opts.kAscii != null ? Number(opts.kAscii) : K_ASCII;
  const kC = opts.kCyr   != null ? Number(opts.kCyr)   : K_CYR;
  const k  = kA - (kA - kC) * r; // r=0 → kA, r=1 → kC
  return Math.round(b / k);
}

module.exports = { nonAsciiRatio, estimateTokens };
