# Task Routing Index

| Task Type | Agent | T-level |
|-----------|-------|---------|
| Feature Implementation | `module_agent` → §1.5 | T2 |
| Refactoring | `module_agent` → §1.5 | T2 |
| Bug Fix | `module_agent` → §1.5 | T3 |
| Architecture Change | `ccip-architect` | T4 |
| Research Task | `ccip-architect` | T2 |
| Documentation Update | `ccip-doc-writer` | T1 |
| Performance Optimization | `module_agent` → §1.5 | T2 |
| Security Update | `security-reviewer` | T3 |

Co-agent условия → `agent-handoff.md`  
Context по T-level → `context-policy.md`  
Priority + DoR → `priority-policy.md`  
Lifecycle → `workflow.md`  
Routing contract → `routing-contract.md`

---

## §1.5 Module → Phase Routing

| M-ID | Модуль | Фаза | Агент(ы) |
|------|--------|------|----------|
| M-01 | Docker + PostgreSQL + Redis AOF + PgBouncer + Prisma | 1 | `ccip-dba`, `ccip-devops` |
| M-02 | Auth/RBAC, AuditLog, Multi-tenancy middleware | 2 | `ccip-backend-aux` |
| M-03 | Init Module A — Objects, BoQ, weight_coef trigger | 3 | `ccip-backend-core` |
| M-04 | ZeroReport Module B | 4 | `ccip-backend-core` |
| M-05 | PeriodEngine C, DisputeSLA D, Analytics E, BullMQ | 5 | `ccip-backend-core` |
| M-06 | Baseline F/G, GC Change H | 6 | `ccip-backend-core` |
| M-07 | Sync API I | 7 | `ccip-backend-aux` |
| M-08 | Web App — Dashboard, Period Cycle, GP Form | 8 | `ccip-frontend` |
| M-10 | Security / Immutability / RBAC audit | 10 | `security-reviewer` |
| M-11 | Testing / SLA Recovery scan | 11 | `ccip-qa` |
| M-12 | Prod Infra / K8s | 12 | `ccip-devops` |
| M-13 | Pilot | 13 | все агенты |
| M-M | Mobile App | post | `ccip-mobile` |

> Offsets → `phase-map.md`  
> Fallback при unresolved полях → `routing-contract.md#fallback`
