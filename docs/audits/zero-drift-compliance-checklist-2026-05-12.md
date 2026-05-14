# Zero-Drift Compliance Checklist — CCIP

> **Strategy ID:** REM-2026-05-12-A
> **Anchor audit:** [AUDIT-2026-05-07-A](multi-agent-ecosystem-2026-05-07.md)
> **Purpose:** Единственное операциональное определение "ready" для пилота M-13 и continuous health invariant после пилота.
> **Rule:** No partial closures. BLOCKER half-fixed = BLOCKER.
> **Invariants:** I-1 Single source of truth · I-2 Machine-enforceable · I-3 Silent-failure intolerance.

---

## 1. Contract integrity

- [ ] `tools/audit/path-canonical.js` exit 0 across whole repo
- [ ] `tools/audit/section-anchors.js` exit 0 across `.claude/agents/`, `docs/`
- [ ] `tools/audit/dead-refs.js` exit 0
- [ ] Each `.claude/agents/*.md` filename present exactly once in `CLAUDE.md` intent or auxiliary table
- [ ] `CLAUDE.md §15 State Contract` present and resolves all `(§15)` references

## 2. Schema integrity

- [ ] `enum UserRole` = SoT for all role references (`tools/audit/rbac-vs-schema.js` green)
- [ ] Each `docs/decisions/ADR-*.md` declares `impl_anchors:` and all anchors exist on disk
- [ ] Agent frontmatter conforms to `docs/schemas/agent-frontmatter.schema.json`
- [ ] `session-state.json` conforms to `docs/schemas/session-state.schema.json` at every hook tick

## 3. CI integrity

- [ ] Full audit suite passes on Ubuntu **and** macOS **and** Windows runners
- [ ] Clone into random-name `/tmp/<uuid>/` → suite green (closes F-002, F-011)
- [ ] `pnpm install --frozen-lockfile && pnpm audit --audit-level=high` green
- [ ] Pre-commit hook installed in `.husky/`; verified by attempting a forbidden commit
- [ ] No `${workspaceFolder}` or env var required for happy-path build

## 4. Runtime integrity

- [ ] Hooks write atomically (tmp+rename+fsync); 20-way concurrent test green (closes F-013, X-1)
- [ ] Hooks fail loud — zero `catch {}` in `.claude/runtime/` (closes X-3)
- [ ] `session_id` populated on every dispatch; agent rejects empty state (closes F-004)
- [ ] Structured log line emitted per hook invocation; SRE dashboard live
- [ ] Parser accepts both Markdown `## State Update` and top-level JSON; malformed → throw (closes F-012)

## 5. Security posture

- [ ] RBAC roles identical across code, docs, ADRs (CI-enforced, closes F-001)
- [ ] AuditLog table partitioned per ADR-010; rotation simulated in CI
- [ ] RLS policies exercised by `T-R-004` + per-tenant fuzz test
- [ ] Allowlist in `settings.local.json` restructured to literal patterns; no `' *` glob (closes X-12)
- [ ] Pen-test smoke (allowlist abuse, prompt-injection via handoff) green (closes X-2)

## 6. Governance

- [ ] CODEOWNERS enforces dual review on `schema.prisma`, `CLAUDE.md`, `docs/decisions/**`, `.claude/agents/**`, `.claude/runtime/**`
- [ ] ADR immutability validator green (`Status: Accepted` ADRs append-only)
- [ ] Branch protection rules saved as code (`.github/branch-protection.yml`)
- [ ] CHANGELOG entry for every BLOCKER/CRITICAL remediation merged

## 7. Documentation truth

- [ ] No orphan ADRs — each ADR cited by ≥1 agent OR ≥1 module (closes X-7)
- [ ] No orphan directories — `frontend/`, `the roles of subagents/`, `.agents/skills/*` purged (closes F-020..F-022)
- [ ] MEMORY.md ⊆ filesystem (`tools/audit/memory-fs-sync.js` enforces, closes X-8)
- [ ] Delivery doc module paths resolve (`tools/audit/dead-refs.js` covers, closes F-015, F-017)

## 8. Continuous compliance

- [ ] Nightly cron runs full audit suite; failures alarmed
- [ ] Weekly orphan-scan emits report; PRs auto-opened for removal candidates
- [ ] Quarterly red-team audit re-run, results appended to `docs/audits/`
- [ ] Monthly schema-drift check vs canonical schemas

---

## Validators referenced (must exist under `tools/audit/`)

| Validator | Section | Purpose |
|---|---|---|
| `path-canonical.js` | §1 | rejects `docs/errors_log.md`, `docs/feedback-loop.md` literals, abs Windows paths |
| `section-anchors.js` | §1 | resolves `(§N)` references in `.claude/agents/*.md` and `docs/` |
| `dead-refs.js` | §1, §7 | walks markdown, asserts every path/file/ADR ref exists |
| `rbac-vs-schema.js` | §2, §5 | parses `enum UserRole`, rejects unknown role tokens in `.claude/agents/` |
| `agent-frontmatter.js` | §2 | validates against `docs/schemas/agent-frontmatter.schema.json` |
| `adr-coverage.js` | §2 | asserts `impl_anchors:` declared and resolved per ADR |
| `intent-coverage.js` | §1 | every `.claude/agents/*.md` covered in `CLAUDE.md` table |
| `portable-hook.js` | §3 | runs hook in throwaway `/tmp/<uuid>/` clone |
| `memory-fs-sync.js` | §7 | enforces filesystem > memory precedence |
| `adr-status-immutable.js` | §6 | rejects edits to Accepted ADRs beyond allowed fields |
| `state-update-parser.test.js` | §4 | property-tests dual-format parser |

---

## Closure protocol

1. Item marked `[x]` only when its validator is green in CI **and** locally on a clean clone.
2. Reverting a remediation must keep CI green (validators land before mechanical fixes).
3. New BLOCKER/CRITICAL findings re-open the relevant section.
4. Pilot M-13 sign-off requires §1–§5 fully `[x]`; §6–§8 ≥ 80%.

**Document is append-only.** Items completed get checked; never removed. New rows are added; never reordered.