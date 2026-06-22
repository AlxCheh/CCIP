'use strict';
/**
 * contract-exempt.js — агенты, освобождённые от INV-STATE-CONTRACT (## State Update).
 *
 * Обоснование (FPR→0): ccip-session-optimizer по жёсткому правилу CLAUDE.md релеит свой
 * Next-Session Bootstrap ДОСЛОВНО и НЕ эмитит ## State Update — это by design, а не нарушение.
 * До этого реестра он был единственным хроническим missing_state_update в feedback-loop §5,
 * т.е. ~100% false-positive. Освобождение делает INV-STATE-CONTRACT пригодным к enforce.
 *
 * Реестр ЯВНЫЙ (без wildcard) — каждое исключение обосновано здесь.
 */
const CONTRACT_EXEMPT = [
  'ccip-session-optimizer', // relay verbatim, no State Update by design (CLAUDE.md relay rule)
];

function isContractExempt(agent) {
  return CONTRACT_EXEMPT.includes(String(agent || ''));
}

module.exports = { isContractExempt, CONTRACT_EXEMPT };
