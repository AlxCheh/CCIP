# Changelog

All BLOCKER/CRITICAL remediations and significant contract changes are recorded here.
Format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Fixed — Zero-Drift Compliance §10 remediation (REM-2026-05-12-A)

Closes findings from `docs/audits/multi-agent-ecosystem-2026-05-07.md`:

- **F-001** (BLOCKER) — phantom RBAC roles `supervisor`/`contractor` in agent docs replaced with canonical `stroycontrol` / `gpToken` from `enum UserRole`.
- **F-003** — `CLAUDE.md §15 State Contract` section added; `(§15)` references resolved.
- **F-005** — `docs/errors_log.md` path canonicalized in `ccip-architect.md`.
- **F-006** — `docs/feedback-loop.md` path corrected in `ccip-routing-planner.md`.
- **F-007** — `apps/mobile/` annotated as TBD in `ccip-mobile.md` until module exists.
- **F-008** — `infra/k8s/` annotated as TBD in `ccip-devops.md`; canonical `docs/errors_log.md` path in 4 remaining agents.
- **F-009** — placeholder `docs/proposed-claude-md-changes.md` created.
- **F-010** — every `.claude/agents/*.md` present in CLAUDE.md intent or auxiliary table.
- **F-015**, **F-017** — phantom module paths in delivery docs canonicalized.
- **F-016** — agent frontmatter schema validation added.
- **F-020**, **F-021**, **F-022** — orphan directories `frontend/`, `the roles of subagents/`, `.agents/skills/*` purged or guarded.

### Added — Audit infrastructure

- `tools/audit/` scaffolding: 17 read-only audit scripts + JSON Schemas.
- `docs/schemas/` Draft 2020-12 schemas for agent frontmatter and session state.
- §15 State Contract in CLAUDE.md; `state-protocol.md` lifecycle doc.
- Atomic write + fsync in `.claude/runtime/{post-agent-hook,flush-state}.js`; 20-way concurrency stress test.
- `pen-test-smoke.js` (T-23 §10.5); `allowlist-literal.js` (T-21 §10.5).
- `adr-immutability.js` (T-28 §10.6); this CHANGELOG (T-29 §10.6).
