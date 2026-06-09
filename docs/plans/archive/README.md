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

## Партия 2026-06-09 (18 планов)

Сверка: 2026-06-09. Основание — git-история коммитов, наличие артефактов на диске, соотношение [x]/[ ] чекбоксов.

| План | Доказательство завершённости |
|------|------------------------------|
| `2026-05-17-multi-agent-ecosystem-residual-remediation.md` | Статус COMPLETED в заголовке; 27 [x]; Tier 2 закрыт индивидуальными планами ниже |
| `2026-05-26-remediation-master-sequencing.md` | Roadmap-документ; все W-items реализованы своими планами |
| `2026-05-31-period-cycle-design.md` | Design spec; `apps/web/src/pages/PeriodPage.tsx` на диске |
| `2026-05-31-m08-dashboard-hardening-design.md` | Design spec; тесты в `apps/web/src/pages/__tests__/` на диске |
| `2026-05-31-period-cycle-implementation.md` | `PeriodPage.tsx`, `GpFormPage.tsx` на диске |
| `2026-05-31-m08-dashboard-hardening-implementation.md` | `apps/web/src/{pages,hooks,store}/__tests__/` на диске |
| `2026-06-01-gp-form.md` | `apps/web/src/pages/GpFormPage.tsx` + тест на диске |
| `2026-06-02-m08-design-pass.md` | Design spec; `tokens.css`, `AppShell.tsx` на диске |
| `2026-06-02-m08-design-pass-impl.md` | 47 [x] / 0 [ ]; AppShell + CSS Modules на диске |
| `2026-06-03-ccip-agent-optimizer.md` | `.claude/agents/ccip-agent-optimizer.md` на диске; PR #12 merged |
| `2026-06-03-ccip-claude-md-auditor-improvements.md` | Step 2.2b, SHA-diff, PENDING-нотификация присутствуют в теле агента |
| `2026-06-06-audit-remediation.md` | Наличие follow-up gaps-плана подтверждает исполнение; PR #13 `b4db597` |
| `2026-06-06-audit-gaps-remediation.md` | `execute-dag-skip-perms.test.js`, `execute-dag-context-warn.test.js` на диске; R-016/R-017 в test fixtures |
| `2026-06-07-runtime-hardening.md` | PR #14 коммит `24c7523` (F-RT-01/03/06/07/09/10) |
| `2026-06-07-state-update-observability.md` | PR #15 коммит `338ea23` (F-RT-02/04, ADR-017) |
| `2026-06-07-runtime-governance-foundation.md` | PR #17 коммит `2274d44` (R1+R2) |
| `2026-06-07-runtime-governance-enforcement.md` | PR #18 коммит `0ce35cb` (R3+R4+R5) |
| `2026-06-07-runtime-governance-phase3.md` | PR #19 коммит `b1525c5` (R7/R8/R9) |

## Партия 2026-06-09 вторая волна (2 плана)

| План | Доказательство завершённости |
|------|------------------------------|
| `2026-06-08-structural-hardening.md` | PR #22 merged: HA-8 (`--staged` gate), SPOF-1 (rolling .bak), UU-2 (7 stdin тестов) |
| `2026-06-08-defect-remediation.md` | D-07 в PR #22; D-06 (10 fallback profiles); D-23 (tracked); все остальные D-fixes в PR #13–#21 |

## Активные планы (остаются в `docs/plans/`)

| План | Статус | Остаток |
|------|--------|---------|
| `2026-05-18-sub-plan-a-wave-1.md` | Не начат | `apps/api/test/integration/` отсутствует — integration suite не создан |
| `2026-05-24-dispute-sla-module.md` | ~70% | Tasks 8–10: `dispute.controller.ts` + `dispute.module.ts` MISSING; 2 TODO в `period.service.ts` |
