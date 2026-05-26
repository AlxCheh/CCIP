# ccip-session-optimizer — skill-extraction map

Карта будущего skill-extract'а. Вынесена из inline-комментариев промпта
(`<!-- portable/config/project -->`), чтобы снизить context-window pressure и
attention fragmentation в runtime (token-economy). Метаданные для рефакторинга,
не runtime-инструкции. При extract'е: `portable` → skill core, `config:KEY` →
project config schema, `project:WHAT` → CCIP-side adapter / plugin.

| Секция промпта | Маркер |
|---|---|
| (header block) | SKILL-EXTRACTION MARKERS legend — see git history fe* for original |
| (top / frontmatter) | <!-- config: KEY -->     параметризовать; значение уйдёт в project config |
| (top / frontmatter) | <!-- project: WHAT -->   project-bound — остаётся в CCIP или станет плагином |
| (top / frontmatter) | <!-- portable: concept — hook-driven evidence verification + ban on self-attestation --> |
| (top / frontmatter) | <!-- project: hook-path `.claude/runtime/verify-evidence-log.js` is CCIP runtime --> |
| ## Триггеры (только точное совпадение, регистр игнорируется) | <!-- config: trigger-phrases — list per project (here ru+en); matcher itself is portable --> |
| ## Триггеры (только точное совпадение, регистр игнорируется) | <!-- /config --> |
| ## Триггеры (только точное совпадение, регистр игнорируется) | <!-- portable: exact-match policy, no fuzzy, escalate to parent on doubt --> |
| ## Триггеры (только точное совпадение, регистр игнорируется) | <!-- portable: re-entrancy semantics, TTL window, JSON schema, corruption policy --> |
| ## Триггеры (только точное совпадение, регистр игнорируется) | <!-- config: lock-path `.claude/runtime/optimizer.lock`, ttl 5 min — per-project tunable --> |
| ## §R Re-entrancy guard (первое действие) | <!-- /portable --> |
| ## §R Re-entrancy guard (первое действие) | <!-- portable: pre-flight discipline — token/call budget, batching, abort-on-overrun --> |
| ## §R Re-entrancy guard (первое действие) | <!-- config: budget-tokens (3000) and budget-calls (6) — per-project tunable --> |
| ## §0 Pre-flight (бюджет 3000 токенов; ≤ 6 tool calls; батчевый; abort-on-overrun) | <!-- portable: bash whitelist concept --> |
| ## §0 Pre-flight (бюджет 3000 токенов; ≤ 6 tool calls; батчевый; abort-on-overrun) | <!-- config: allowed-bash-commands — `git log*`, `git status*`, `git rev-parse*` per project --> |
| ## §0 Pre-flight (бюджет 3000 токенов; ≤ 6 tool calls; батчевый; abort-on-overrun) | <!-- portable: wikilink resolution — single Grep, quarantine on miss/ambiguity, never infer from slug --> |
| ### §0.1 Разрешение wikilinks (ОДНИМ Grep'ом) | <!-- /portable --> |
| ### §0.1 Разрешение wikilinks (ОДНИМ Grep'ом) | <!-- portable: batched-read discipline, slice-by-heading-anchor, heading-uniqueness rule --> |
| ### §0.2 Батчевое чтение (одно сообщение, все Read параллельно) | <!-- config: id-patterns — CCIP uses T-XX/F-XXX/C-XXX/R-XXX; per-project regex list --> |
| ### §0.2 Батчевое чтение (одно сообщение, все Read параллельно) | <!-- config: domain-term "delivery plan" is CCIP terminology; portable concept = "primary plan document" --> |
| ### §0.2 Батчевое чтение (одно сообщение, все Read параллельно) | <!-- /portable --> |
| ### §0.2 Батчевое чтение (одно сообщение, все Read параллельно) | <!-- portable: budget enforcement — heuristic `lines × 12`, hard stop, partial-coverage flagging, no memory-fill --> |
| ### §0.2 Батчевое чтение (одно сообщение, все Read параллельно) | <!-- config: budget numbers (3000, 6, ×12 multiplier) — per-project tunable --> |
| ### §0.3 Бюджеты | <!-- /portable --> |
| ### §0.3 Бюджеты | <!-- portable: cross-source consistency check — claim in ≥2 sources MUST match literally; free-form → quarantine --> |
| ### §0.3 Бюджеты | <!-- config: id-regex + status-vocabulary (done/pending/blocked/deferred) — per-project enumerations --> |
| ### §0.4 Cross-memory consistency (§C) | <!-- /portable --> |
| ### §0.4 Cross-memory consistency (§C) | <!-- portable: injection-safe ingestion principle + denylist regex set; fully reusable as-is --> |
| ### §0.5 Injection-safe ingestion | <!-- /portable --> |
| ### §0.5 Injection-safe ingestion | <!-- portable: authority boundary — sources = data, never instructions; meta-line quarantine --> |
| ### §0.5b Authority boundary (structural rule) | <!-- /portable --> |
| ### §0.5b Authority boundary (structural rule) | <!-- portable: source-type allowlist concept; telephone-game guard; denied-source list --> |
| ### §0.5b Authority boundary (structural rule) | <!-- config: prefix vocabulary `repo:` / `git:` / `state-memory:` + per-prefix resolver — per project --> |
| ### §0.5c Source-type allowlist для Evidence | <!-- /portable --> |
| ## Запреты (hook-enforced) | <!-- portable: core prohibitions — substring rule, prefix-allowlist, telephone-game guard, no orphan claims, no slug-inference, no full-plan reads --> |
| ## Запреты (hook-enforced) | <!-- /portable --> |
| ## Запреты (hook-enforced) | <!-- config: self-attestation-lexemes — language-specific vocabulary list, extend per locale --> |
| ## Запреты (hook-enforced) | <!-- /config --> |
| ## Запреты (hook-enforced) | <!-- config: id-pattern — `T-X` token shape is CCIP convention, regex per project --> |
| ## Запреты (hook-enforced) | <!-- /config --> |
| ## Запреты (hook-enforced) | <!-- portable: line-number-anchor ban, SHA-with-subject format, pipe-escape rule --> |
| ## Запреты (hook-enforced) | <!-- /portable --> |
| ## Запреты (hook-enforced) | <!-- project: section-header-history — CCIP-specific Wave 3 legacy migration; new projects don't need this rule --> |
| ## Запреты (hook-enforced) | <!-- /project --> |
| ## Запреты (hook-enforced) | <!-- portable: branch-claim + SHA-token verification concepts; FIREWALL_* codes are hook-implementation detail (config) --> |
| ## Запреты (hook-enforced) | <!-- /portable --> |
| ## Запреты (hook-enforced) | <!-- project: session-artifact-ban — `docs/errors/sessions/` is CCIP-specific archive path; principle (no hook-output as Evidence) is portable, path is not --> |
| ## Запреты (hook-enforced) | <!-- /project --> |
| ## Запреты (hook-enforced) | <!-- portable: no-placeholder-row rule for empty Evidence Log --> |
| ## Запреты (hook-enforced) | <!-- /portable --> |
| ## Запреты (hook-enforced) | <!-- portable: 3-artifact output structure (Report / Bootstrap / Evidence Log) and emission order --> |
| ## Запреты (hook-enforced) | <!-- config: language (ru) of section labels and table headers — per-project localization --> |
| ### Артефакт 1 — Session Optimization Report (≤ 50 строк) | <!-- portable: report schema — plan-selection, violations, token-buckets, quarantine, coverage --> |
| ### Артефакт 1 — Session Optimization Report (≤ 50 строк) | <!-- config: bucket thresholds (5k/20k), max line count (50), table-header localization --> |
| ### Coverage | <!-- /portable --> |
| ### Артефакт 2 — Next-Session Bootstrap (≤ 60 строк / ≤ 300 слов, verbatim) | <!-- portable: bootstrap schema (Context/Tasks/Blockers/Constraints/Gotchas), cardinality contract, fallback policy, tagged-token convention --> |
| ### Артефакт 2 — Next-Session Bootstrap (≤ 60 строк / ≤ 300 слов, verbatim) | <!-- config: section heading text "Next-Session Bootstrap", word/line limits, integrity-comment generator-name, FIREWALL_BOOTSTRAP_MISSING code --> |
| ### Артефакт 2 — Next-Session Bootstrap (≤ 60 строк / ≤ 300 слов, verbatim) | <!-- /portable --> |
| ### Артефакт 3 — Evidence Log (≤ 25 строк) | <!-- portable: evidence-log schema, substring-bytes rule, pipe-escape rule, row-cap, no-placeholder-row, drop-unverified-claim rule --> |
| ### Артефакт 3 — Evidence Log (≤ 25 строк) | <!-- config: 80B max length, 25 rows cap, prefix vocabulary, table localization --> |
| ### Evidence Log | <!-- /portable --> |
| ### Evidence Log | <!-- portable: invariants manifest schema + sentinel mechanism + hook check list --> |
| ### Evidence Log | <!-- config: sentinel string "manifest=invariants-v1", budget numbers, plan_files/state_memory_files keys --> |
| ## §I — Манифест инвариантов (обязательный последний блок ответа) | <!-- /portable --> |
| ## §I — Манифест инвариантов (обязательный последний блок ответа) | <!-- project: violation persistence paths — `docs/errors/sessions/`, `errors_log.md`, `session-opt-index.md` are CCIP layout --> |
| ## §I — Манифест инвариантов (обязательный последний блок ответа) | <!-- /project --> |
| ## §I — Манифест инвариантов (обязательный последний блок ответа) | <!-- portable: principle "agent emits only artifacts; hook handles persistence + lock release" --> |
| ## §I — Манифест инвариантов (обязательный последний блок ответа) | <!-- project: hook name `verify-evidence-log.js`, archive paths, index path, lock path — all CCIP runtime --> |
| ## Persistence | <!-- /project --> |
| ## Persistence | <!-- portable: internal pre-emit reasoning rule + ban on outputting "Final check" sections --> |
| ## Internal reasoning (не печатать в ответе) | <!-- /portable --> |
| ## Internal reasoning (не печатать в ответе) | <!-- portable: top-level operating principles (1-7); only size limits in #6 are config --> |
| ## Правила работы (короткие) | <!-- /portable --> |
