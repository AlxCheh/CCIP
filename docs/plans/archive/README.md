# Plans Archive

Завершённые на 100% планы. Перемещены сюда через `git mv` (история коммитов сохранена).
Сверка выполнена 2026-05-26 против git-истории и фактических артефактов, а не против чекбоксов в самих файлах (чекбоксы в планах не отмечались по ходу работы).

| План | Что закрывал | Доказательство завершённости |
|------|--------------|------------------------------|
| `2026-05-05-auth-audit-tenant.md` | M-02a/b/c — JWT auth, GpTokenGuard, AuditLogService, multi-tenancy middleware | `docs/project-state.md §5`: M-02a/b/c `✓ done` (2026-05-05); миграция `20260505000000_add_password_hash`; `apps/api/src/common/{guards,audit,prisma}/` на диске |
| `2026-05-12-zero-drift-compliance-section10.md` | §10 Zero-Drift Compliance — 30 audit-скриптов в `tools/audit/`, JSON-схемы, husky + CI matrix | `node tools/audit/audit-suite.js` → **17/18 passed, exit 0** (1 skip — MEMORY.md вне scope); 30 скриптов присутствуют |
| `2026-05-15-auditlog-partman-design.md` | T-22 design (spec) — партиционирование `audit_log` | Реализован одноимённым implementation-планом (ниже); статус был `Draft`, но контракт воплощён в миграции |
| `2026-05-15-auditlog-partman-implementation.md` | T-22 — `pg_partman` + `pg_cron`, rotation invariant в CI | Миграция `0002_audit_log_partman` на диске; 6 коммитов T-22 (`c33cb63`, `fe5f428`, `be3662d`, `c9c88de`, `1d14503`, `e1ce9f7`); PR #2 merged |
| `2026-05-25-session-optimizer-hardening.md` | C-1..C-5 + M-1..M-10 аудита `ccip-session-optimizer` (16 задач) | Все 16 задач закоммичены (`2e13351`→`02033c7`); Task 12 decision = feedback-loop (`27da4af`); PR #4 (`b38219c`) + PR #5 (`b2934f4`) merged |

## Не заархивированы (остаются в `docs/plans/`)

| План | Статус | Остаток |
|------|--------|---------|
| `2026-05-17-multi-agent-ecosystem-residual-remediation.md` | Tier 1 завершён (4/4), Tier 2 открыт | Roadmap из 6 sub-plans (A/B/C/D/E/F) — живой документ, не архивируется |
| `2026-05-18-sub-plan-a-wave-1.md` | Не начат | Integration suite не создан (`apps/api/test/integration/` отсутствует) |
| `2026-05-24-dispute-sla-module.md` | M-05b ~70% | Tasks 8–10 открыты: HTTP-слой (`dispute.controller.ts` + `dispute.module.ts`), PeriodService fixes (2 TODO M-05b в `period.service.ts:60,326`), приёмка |

Очередность закрытия остатка — см. `docs/plans/2026-05-26-remediation-master-sequencing.md`.
