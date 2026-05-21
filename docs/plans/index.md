# Plans Index

Implementation plans проекта CCIP. Каноническая директория — `docs/plans/`. Выполненные / superseded / deferred артефакты переносятся в `docs/plans/archive/`.

**Связанные каталоги (НЕ перемещаются — другие классы артефактов):**
- `docs/delivery/phase-*.md` — phase reference docs, маршрутизируемые из agent prompts.
- `docs/audits/*.md` — audit reports.
- `docs/refactor/*.md` — refactor mapping docs.
- `docs/decisions/ADR-*.md` — architectural decisions.
- `apps/api/src/modules/*.manifest.md` — module-level architectural docs.

---

## Active plans

| Date | File | Purpose | Status |
|---|---|---|---|
| 2026-05-05 | [auth-audit-tenant.md](2026-05-05-auth-audit-tenant.md) | Auth + AuditLog + Tenant implementation (M-02a/b/c) | in-progress |
| 2026-05-12 | [zero-drift-compliance-section10.md](2026-05-12-zero-drift-compliance-section10.md) | §10 Zero-Drift Compliance gates + TDD fixtures | Принято rev 2 |
| 2026-05-15 | [auditlog-partman-design.md](2026-05-15-auditlog-partman-design.md) | AuditLog partitioning schema (pg_partman + pg_cron) | Draft |
| 2026-05-15 | [auditlog-partman-implementation.md](2026-05-15-auditlog-partman-implementation.md) | AuditLog T-22 implementation tasks | in-progress |
| 2026-05-17 | [multi-agent-ecosystem-residual-remediation.md](2026-05-17-multi-agent-ecosystem-residual-remediation.md) | Tier 1 completed; Tier 2 superseded by 2026-05-20 | mixed (kept as active reference for Tier 1 post-mortem) |
| 2026-05-18 | [business-correctness-gate-design.md](2026-05-18-business-correctness-gate-design.md) | §11 Business Correctness Gate — design spec | Draft |
| 2026-05-18 | [sub-plan-a-wave-1.md](2026-05-18-sub-plan-a-wave-1.md) | §11 Wave 1: 17 algorithm tests + 2 ADR invariant suites | in-progress (branch `feat/sub-plan-a-w1`) |
| 2026-05-20 | [multi-agent-ecosystem-audit-remediation.md](2026-05-20-multi-agent-ecosystem-audit-remediation.md) | 23-finding audit remediation + §10.8 governance audit phase | Accepted |

---

## Archive

_(пусто; будущие completed / superseded / deferred plans → [`archive/`](archive/))_

---

## Conventions

- **Filename:** `YYYY-MM-DD-<feature-name>.md` (ISO date prefix).
- **Header:** см. шаблон `superpowers:writing-plans` SKILL.md.
- **Cross-ref:** при ссылке из плана на другой план — относительный путь `2026-MM-DD-<other>.md`, не `docs/plans/...`.
- **Move to archive:** при completion → `git mv docs/plans/<file>.md docs/plans/archive/`. В архиве файл больше не патчится, остаётся как post-mortem reference.
