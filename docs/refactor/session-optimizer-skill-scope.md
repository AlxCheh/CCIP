# Session Optimizer — Skill-Extraction Scope Map

> **Purpose:** карта границ portable / config / project для будущей extraction'а `ccip-session-optimizer` + `verify-evidence-log.js` в reusable skill. Source-файлы не размечены маркерами — все scope-метаданные тут.
>
> **Status:** preparation only. Extract'а нет до появления второго проекта-потребителя ИЛИ 60 дней стабильности контракта (см. `MEMORY.md` → решение от 2026-05-16).
>
> **Maintenance:** при существенных правках source-файлов проверять, не сдвинулись ли line-ranges. Использовать как diff-baseline.

## Legend

| Category | Meaning | При extract'е |
|---|---|---|
| **portable** | Инвариант/контракт/алгоритм без project-specific детерминантов | Переезжает в `skill/core/` как есть |
| **config** | Параметр (значение, словарь, regex, число), который меняется per-project | Выносится в `skill/manifest.yaml` `config:` секцию; default опциональный |
| **project** | Хардкод CCIP-окружения (path, terminology, history-quirk) | Остаётся в CCIP-репо как plugin / adapter / config-override |
| **meta** | Frontmatter, секции-заголовки — структурный «клей» | Перенос через template |

## File 1 — `.claude/agents/ccip-session-optimizer.md` (253 lines)

| Lines | Category | Section | Notes |
|---|---|---|---|
| 1–6   | meta     | frontmatter | name/description/tools/model. `description` упоминает CCIP — при extract'е дженеризовать |
| 8     | portable + project | opening paragraph | Концепт hook-driven verification — portable. Путь `.claude/runtime/verify-evidence-log.js` — project |
| 10–17 | config + portable | Триггеры | Фразы (12–15) — config:trigger-phrases (ru+en). Exact-match policy (17) — portable |
| 19–28 | portable + config | §R Re-entrancy guard | Semantics (TTL, JSON schema, corruption policy) — portable. Lock path `.claude/runtime/optimizer.lock` (21) — config:lock-path. TTL 5 min — config |
| 30     | portable + config | §0 header | Budget concept portable; 3000/6 — config:budget-numbers |
| 32     | portable + config | bash whitelist | Concept portable; allowed commands list — config:allowed-bash |
| 34–41 | portable | §0.1 wikilinks | Полностью переносимый алгоритм (single Grep, quarantine on miss/ambiguity) |
| 43–52 | portable + config | §0.2 batched read | Discipline + heading-anchor — portable. `T-XX/F-XXX/C-XXX/R-XXX` regex (48) — config:id-patterns. «delivery plan» terminology (50) — config:plan-doc-name |
| 54–58 | portable + config | §0.3 budgets | Enforcement — portable. Numbers (3000, 6, ×12) — config:budget-numbers |
| 60–66 | portable + config | §0.4 cross-memory consistency | Concept portable. Status vocabulary (done/pending/blocked/deferred) + ID regex — config |
| 68–75 | portable | §0.5 injection-safe | Denylist regex + principle — полностью переносимы |
| 77–81 | portable | §0.5b authority boundary | Fully portable structural rule |
| 83–95 | portable + config | §0.5c source-type allowlist | Concept + telephone-game guard — portable. Prefix vocab `repo:/git:/state-memory:` — config:source-prefixes |
| 97–105 | portable | Запреты — core | Substring, prefix-allowlist, no orphan claims, slug-inference ban, full-plan-read ban |
| 106   | config | Запреты — self-attestation | Lexemes list — config:self-attestation-lexemes (per locale) |
| 107   | config | Запреты — ordering claims | `T-X блокирует T-Y` форма — config:id-pattern |
| 108–110 | portable | Запреты — line-anchor/SHA/pipe | Reusable rules |
| 111   | project | Запреты — Bootstrap legacy | CCIP Wave 3 historical migration; new projects don't have this baggage |
| 112–113 | portable + config | Запреты — branch/SHA verification | Concepts portable; `FIREWALL_BRANCH_DRIFT` / `FIREWALL_SHA_NOT_FOUND` error codes — config |
| 114   | project | Запреты — session-artifact ban | `repo:docs/errors/sessions/` is CCIP archive layout |
| 115   | portable | Запреты — no-placeholder row | Reusable |
| 117   | meta + config | Output section | Structural; localization ru — config |
| 119–153 | portable + config | Артефакт 1 — Report template | Schema portable; bucket thresholds (5k/20k), 50-line cap — config; ru labels — config:locale |
| 155–177 | portable + config | Артефакт 2 — Bootstrap template | Schema + cardinality contract — portable. Heading text «Next-Session Bootstrap», 60/300 limits, `generated-by:ccip-session-optimizer` — config |
| 179–198 | portable + config | Артефакт 3 — Evidence Log template | Schema + substring/pipe-escape/no-placeholder rules — portable. 80B, 25 rows, prefix vocab — config |
| 200–226 | portable + config | §I Manifest | Schema + sentinel mechanism + hook check list — portable. Sentinel string `manifest=invariants-v1`, budget numbers — config |
| 227   | project | violation persistence note | Paths `docs/errors/sessions/`, `errors_log.md`, `session-opt-index.md` — CCIP layout |
| 229–236 | portable + project | Persistence | Principle «agent emits artifacts, hook persists» — portable. Hook filename + all paths — project |
| 238–242 | portable | Internal reasoning | Pre-emit mental check + ban on «Final check» output sections |
| 244–252 | portable + config | Правила работы | Principles 1–7 portable. Size limits in #6 (50/60/300/25/14) — config |

**Coverage check:** 253 / 253 lines mapped.

## File 2 — `.claude/runtime/verify-evidence-log.js` (419 lines)

| Lines | Category | Element | Notes |
|---|---|---|---|
| 1–13, 17–20 | portable | header JSDoc | Layered verification concept (L1/L1b/L2/L3) + hook semantics + exit-0 policy |
| 14–16 | project | header JSDoc — paths | `docs/errors/sessions/`, `session-opt-index.md`, `errors_log.md` |
| 22–25 | portable | requires | Standard Node modules |
| 27     | portable | `ROOT` | Repo-root resolution pattern |
| 28     | portable | comment about env override | Pattern is good (already plugin-friendly) |
| 29–31 | project | `SESSIONS_DIR`, `INDEX_FILE`, `ERRORS_LOG` | CCIP archive layout. Env-overridable mitigates, defaults are project. Convert defaults to per-project config |
| 32     | config | `LOCK_FILE` | Path is config; env-override already in place |
| 34     | config | `BANNED_LEXEMES` regex | Language-specific vocabulary (ru+en here) — config:self-attestation-lexemes |
| 35     | config | `BOOTSTRAP_WORD_LIMIT = 300` | config:bootstrap-word-limit |
| 36     | config | `PREFLIGHT_TOKEN_LIMIT = 3000` | config:preflight-token-limit |
| 37     | config | `PREFLIGHT_CALL_LIMIT = 6` | config:preflight-call-limit |
| 38     | config | `ALLOWED_SOURCE_PREFIXES` | config:source-prefixes (each prefix needs a registered resolver) |
| 42–49 | portable | `responseText()` | Generic Claude tool_response normalizer |
| 51–56 | portable | `gitShortHash()` | Generic git util |
| 58–60 | portable | `utcStamp()` | Generic |
| 62–64 | portable | `countWords()` | Generic |
| 66–68 | portable | `ensureDir()` | Generic |
| 70–86 | portable | `atomicAppend()` | Generic file-append helper |
| 91–95 | portable + config | `extractManifestBlock()` | Algorithm portable; sentinel string in regex — config:manifest-sentinel |
| 103–119 | portable + project | `extractSection()` | Level-aware section extraction — portable. `Артефакт\s+\d+\s+[—-]\s+` tolerance prefix (line 110) — project:artefact-prefix (CCIP Wave 3 quirk) |
| 127–154 | portable | `parseManifest()`, `parseValue()` | Minimal YAML subset; reusable |
| 163–197 | portable | `parseEvidenceRows()` | 5-column markdown table parser with pipe-escape + placeholder tolerance |
| 201–204 | portable | `verifyRowSource()` — prefix check | Uses `ALLOWED_SOURCE_PREFIXES` |
| 206–211 | project | session-artifact ban | Hardcoded `repo:docs/errors/sessions/` — CCIP archive path. Make plugin-driven: «sources matching `<project:archive-prefix>` are auto-rejected» |
| 212–216 | portable + config | quote validation | Empty check + UTF-8 byte limit — portable. 80B value — config:quote-byte-limit |
| 218–234 | portable | git resolver | `git:<SHA>:<path>` via `git show` — generic |
| 236–245 | portable | repo/state-memory resolver | Filesystem read + substring check — generic |
| 250–256 | portable | `bootstrapFirewall()` — missing/lexeme | Generic. Uses `BANNED_LEXEMES` (config) |
| 259–260 | portable + config | wordcount check | Generic. Uses `BOOTSTRAP_WORD_LIMIT` (config) |
| 262–276 | portable | Wave 4 — branch claim verification | Universal `git rev-parse --abbrev-ref HEAD` check |
| 278–288 | portable | Wave 5 — SHA token verification | Universal `git cat-file -e` check |
| 257, 260, 274, 286 | config | `FIREWALL_*` error code names | config:firewall-codes (per-project naming) |
| 295–302 | portable | stdin/exit-0 protocol | Claude Code PostToolUse hook contract |
| 304–309 | portable | `payload.tool_name !== 'Agent'` gate | Generic |
| 310–311 | config | subagent name gate | `'ccip-session-optimizer'` — config:subagent-name |
| 313–317 | portable | empty-response skip | Generic |
| 319–341 | portable | L1 syntactic checks | Manifest cardinality, unverified count, budget overruns |
| 344–346 | config | section name extracts | `'Session Optimization Report'`, `'Evidence Log'`, `'Next-Session Bootstrap'` — config:section-names |
| 349, 352–361 | portable | L1b firewall call + L2 per-row verification | Generic |
| 363–369 | portable + config | L3 — count drift + overflow | Portable; 25-row cap — config |
| 371–377 | portable | persist init (stamp, sha, paths) | Generic |
| 379–403 | portable + project | session body composition | Structure portable; `verified-by:` string mentions hook name (project) |
| 405–406 | portable | session file write | Generic |
| 408–410 | portable + project | index row append | Structure portable; line layout matches CCIP `session-opt-index.md` format |
| 412–416 | portable | errors_log append on violations | Generic |
| 418     | portable | lock cleanup | Generic re-entrancy lock release |

**Coverage check:** 419 / 419 lines mapped.

## Aggregate breakdown

| Category | Agent (.md) | Hook (.js) | Combined |
|---|---|---|---|
| portable (lines) | ~165 (65%) | ~270 (64%) | ~435 (65%) |
| config (mixed/dedicated) | ~55 (22%) | ~100 (24%) | ~155 (23%) |
| project | ~25 (10%) | ~40 (10%) | ~65 (10%) |
| meta | ~8 (3%) | ~9 (2%) | ~17 (2%) |

Соотношение ~65:23:10:2 здоровое для будущего skill'а. Если бы project превышал 20% — extraction не оправдан. Сейчас граница чёткая.

## Extraction checklist (использовать когда придёт время)

1. **Pre-check:** убедиться что условия gate'а из основного анализа выполнены (≥ 2 потребителя ИЛИ 60+ дней contract-стабильности).
2. **Skill core (`skill/core/`):**
   - Скопировать все portable-блоки из обоих файлов.
   - Заменить hardcoded values на `${config.X}` placeholders.
3. **Skill config schema (`skill/manifest.yaml`):**
   - Каждое `config:KEY` из таблиц выше → запись в `spec.config`.
   - Required vs optional определить по тому, есть ли разумный default.
4. **Project adapter (`CCIP/.claude/skill.config.yaml`):**
   - Заполнить CCIP-конкретные значения для всех config-keys.
   - Зарегистрировать project-plugins: archive-sink (CCIP layout), session-artifact-ban path.
5. **Plugin interface:**
   - Source-resolvers: `repo:`, `git:`, `state-memory:` — выделить в `runtime/source-resolvers/`.
   - Archive-sink: `runtime/persistence/` с интерфейсом `write(session, artifacts, violations)`.
6. **Test parity:**
   - Прогнать существующие CCIP-фикстуры через extracted skill + CCIP config → diff = 0.
   - Если diff ≠ 0 — добавить missing config-key или backport fix в skill core.
7. **Lock + version:** `skill.lock.yaml` в CCIP фиксирует `version + hash` skill'а.

## Update procedure

- При каждом Wave-итерации в source-файлах — обновлять line-ranges в этом sidecar'е (или хотя бы помечать stale).
- Если изменение добавляет новую категорию (например, новый source prefix или новый firewall check) — отметить добавление в таблице.
- При extract'е этот файл становится living document в skill-репо (например, `skill/docs/scope-history.md`).
