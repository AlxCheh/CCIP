# CLAUDE.md — Orchestration

> Simple > complex

## Context
```
L1 → this file only
L2 → load relevant task file
L3 → load docs/architecture_v1_0.md
L4 → load all
```
Rule: do not escalate without need

## Fast Path
```
IF intents == 1 AND risk == LOW
→ direct agent (stop)
```

## Planner
```
IF intents >= 3 OR risk == HIGH
→ planner
ELSE → direct agent
```

## Intent → Agent → Backup
| Intent   | Agent              | Backup            |
|----------|--------------------|-------------------|
| ARCH     | ccip-architect     | general-purpose   |
| SCHEMA   | ccip-dba           | ccip-backend-core |
| BACKEND  | ccip-backend-core  | general-purpose   |
| AUX      | ccip-backend-aux   | ccip-backend-core |
| FRONTEND | ccip-frontend      | general-purpose   |
| DEVOPS   | ccip-devops        | general-purpose   |
| QA       | ccip-qa            | general-purpose   |
| MOBILE   | ccip-mobile        | general-purpose   |
| SECURITY | security-reviewer  | ccip-architect    |
| DOC      | ccip-doc-writer    | general-purpose   |

## Risk Rules
```
HIGH   → add security-reviewer as co-agent
MEDIUM → present output for review before applying
LOW    → execute directly
```
```
IF intent == ARCH → ccip-architect leads
```

## Agent Selection
```
1. intent → agent (table above)
2. else → general-purpose
```

## Execution
```
- 1 primary agent always
- max 2–3 agents total
- co-agents support primary, not parallel
```

## Multi-intent
```
primary  = main intent agent
co-agents = remaining intents (max 2)
```

## Feedback
```
IF agent fails >= 2 → switch to backup (see table)
IF success >= 3     → keep current routing
```

## Document Routing
| Need          | File                    |
|---------------|-------------------------|
| project state | docs/project-state.md   |
| tasks         | docs/tasks/index.md     |
| architecture  | docs/architecture/*     |
| schema        | packages/database/prisma/schema.prisma |
| decisions     | docs/decisions/ADR-*.md |

## Constraints
- no full file reads — use limit + offset
- no unnecessary L3/L4
- no >3 agents
- no planner for simple tasks

## Verification
Define success criteria before starting task.
