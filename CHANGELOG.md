# Changelog

All BLOCKER/CRITICAL remediations and significant contract changes are recorded here.
Format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- `audit_log` partitioning через `pg_partman` v5 + `pg_cron` (ADR-010, §10.5 T-22):
  - custom postgres image `infra/docker/postgres/Dockerfile` (postgres:16-bookworm + PGDG partman/cron + build-time version assertions)
  - migration `0002_audit_log_partman` с pre-flight guard, monthly partitions, premake=3, daily `run_maintenance_proc`
  - integration test `packages/database/test/audit-log-rotation.test.ts` (6 cases)
  - CI job `db-integration` для запуска rotation regression на каждом PR
  - `docs/governance/db-setup.md` — one-time dev re-init step

### Changed
- `infra/docker/docker-compose.yml`: postgres service использует local build вместо `postgres:16-alpine`

closes T-22

### Fixed

- `.claude/settings.json` hooks теперь используют относительные пути (`node .claude/runtime/*.js`) вместо абсолютного `W:/Claude/CCIP/...` — closes F-002. ALLOWLIST entry удалена из `tools/audit/path-canonical.js`.

### Fixed — Zero-Drift Compliance §10 remediation (REM-2026-05-12-A)

Closes findings from `docs/audits/multi-agent-ecosystem-2026-05-07.md`:

- **F-001** (BLOCKER) — phantom RBAC roles `supervisor`/`contractor` in agent docs replaced with canonical `stroycontrol` / `gpToken` from `enum UserRole`.
- **F-002** (BLOCKER) — regression-prevention infrastructure added (T-25): nightly `portable-clone.yml` clones the repo into a random `/tmp/<uuid>/` directory and runs the full audit suite, catching any reintroduction of absolute Windows paths. `.claude/settings.json` hook commands remain temporarily allowlisted in `path-canonical.js` pending canonicalization.
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

### Added — ADR-015 SLA worker canonical path (2026-05-17)

- `docs/decisions/ADR-015-sla-worker-canonical-path.md` — кодифицирует canonical path `apps/api/src/modules/dispute-sla/` для SLA worker (M-05b); закрывает Red Team C-004 как ADR-уровень decision record (phantom paths уже исправлены коммитом 859484a).

### Fixed — Residual remediation F-016 (2026-05-17)

- `.claude/agents/ccip-security.md` теперь содержит §State Contract секцию per CLAUDE.md §15 — closes F-016 (residual gap не покрытый STATE-CONTRACT audit check).

### Fixed — Residual spot-checks F-014 / X-4 / X-7 (2026-05-17)

- **F-014 / X-4** — `.claude/agents/ccip-claude-md-auditor.md` проверена на наличие legacy `CCIP/` или `W:/` paths в git команд; все paths уже относительные. No regression.
- **X-7** — ADR-013 (PDF reports) был orphan на уровне agent routing. Теперь подключён к `.claude/agents/ccip-backend-core.md` (зона ответственности + ключевые ADR список). `[ORPHAN-ADR]` audit check: 17/17 passed.
