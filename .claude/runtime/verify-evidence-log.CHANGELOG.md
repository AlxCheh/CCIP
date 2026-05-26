# verify-evidence-log.js — CHANGELOG / enforcement history

Археология правил верификатора. Вынесено из agent-промпта (`ccip-session-optimizer.md`)
и из inline-комментариев хука, чтобы снизить context-window pressure (finding M-8).
Промпт несёт только активные правила; «почему» и «когда» — здесь.

## Wave history

| Wave | Что добавлено | Где enforced |
|---|---|---|
| Wave 1 | Layered verification L1 (manifest/sentinel/cardinality), L1b (firewall: self-attest lexemes, wordcount), L2 (per-row substring), L3 (count drift, ≤25 cap). Non-blocking, exit 0, violations → `docs/errors/`. | `run()` L1–L3 |
| Wave 2 | (fix #2) escaped-pipe `\|` un-escape перед substring-check; (fix #3) длина цитаты в UTF-8 байтах (`Buffer.byteLength`), не code units. | `parseEvidenceRows`, `verifyRowSource` |
| Wave 3 | Legacy `## Bootstrap` fallback убран; только `## Next-Session Bootstrap` (h2) + `### Evidence Log` (h3). `extractSection` дополнительно tolerant к `### Артефакт N — <header>` (defense-in-depth), но canonical emit — без префикса. | `extractSection` |
| Wave 4 | `Branch: <name>` в bootstrap верифицируется против `git rev-parse --abbrev-ref HEAD`. Mismatch → `FIREWALL_BRANCH_DRIFT`. | `bootstrapFirewall` |
| Wave 5 | `[sha:NNNNNNN]` (4–40 hex) верифицируется через `git cat-file -e`. Несуществующий объект → `FIREWALL_SHA_NOT_FOUND`. | `bootstrapFirewall` |
| Wave 7 | Evidence row с `source_file: repo:docs/errors/sessions/...` запрещён (`source_is_session_artifact`) — anti-telephone-game (hook-генерируемые артефакты не первичный источник). | `verifyRowSource` |

## Hardening wave (2026-05-25/26) — findings C-1..C-5, M-1..M-10

| Finding | Что | Где / reason |
|---|---|---|
| C-1 | PostToolUse feedback-loop: на content-violations хук эмитит `decision: block` + reason. Внутренние сбои — VERIFIER_ERROR-маяк, без block. | `run()`, `main()` catch |
| C-2 | Anchor-bound entailment: цитата обязана лежать в окне anchor'а. `anchor_required` / `anchor_not_found` / `quote_not_in_anchor_window`. | `anchorWindow`, `checkInWindow` |
| C-3 | git-source через `execFileSync` (argv, без shell) + reject опасных путей (`git_path_invalid`). | `verifyRowSource` git-ветка |
| C-4 | PreToolUse single-flight gate (`optimizer-gate.js`) — реальный re-entrancy enforcement. | `optimizer-gate.js` |
| C-5 | `VERIFIER_ERROR`-маяк в INDEX/ERRORS при внутренней ошибке (exit 0 сохраняется). | `main()` catch |
| M-1 | Path-confinement repo/state-memory под ROOT (+`OPT_MEMORY_ROOTS`). `path_escape`. | `verifyRowSource` fs-ветка |
| M-3/M-10 | Manifest v2 trust-split: `verified` (machine) vs `self_declared` (honor-system). | `parseManifest` |
| M-4 | Manifest через `js-yaml` (вместо hand-rolled flat-парсера). | `parseManifest` |
| M-5 | Минимальная энтропия цитаты (`MIN_QUOTE_BYTES`=12 + low-signal stop-list). `quote_too_short` / `quote_low_signal`. | `verifyRowSource` |
| M-6 | `timeout: 5000` на всех git-вызовах. | `gitShortHash`, `bootstrapFirewall`, `verifyRowSource` |
| M-9 | malformed (<5 col) evidence rows → `L3_MALFORMED_EVIDENCE_ROWS`, не молчаливый skip. | `parseEvidenceRows`, `run()` |

## FIREWALL / violation reason codes

- `L1_MANIFEST_MISSING`, `L1_CARDINALITY_FIELDS_MISSING`, `L1_CARDINALITY_MISMATCH`, `L1_UNVERIFIED_PRESENT`, `L1_PREFLIGHT_BUDGET_EXCEEDED`, `L1_PREFLIGHT_CALLS_EXCEEDED`
- `FIREWALL_BOOTSTRAP_MISSING`, `FIREWALL_SELF_ATTEST`, `FIREWALL_WORDCOUNT`, `FIREWALL_BRANCH_DRIFT`, `FIREWALL_SHA_NOT_FOUND`
- `L2_EVIDENCE_ROW_<n>`: `source_prefix_invalid`, `source_is_session_artifact`, `quote_empty`, `quote_too_long`, `quote_too_short`, `quote_low_signal`, `git_source_format`, `git_path_invalid`, `git_show_fail`, `path_escape`, `source_file_missing`, `source_read_fail`, `anchor_required`, `anchor_not_found`, `quote_not_in_anchor_window`
- `L3_EVIDENCE_COUNT_DRIFT`, `L3_EVIDENCE_OVERFLOW`, `L3_MALFORMED_EVIDENCE_ROWS`
- `VERIFIER_ERROR` (internal fault beacon — не блокирует родителя)
