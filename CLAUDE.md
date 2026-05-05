# CLAUDE.md — Orchestration

> Simple > complex. Minimum agents, minimum scope.

## Context
```
L1 → this file only
L2 → load relevant task file
L3 → load docs/architecture_v1_0.md
L4 → load all
```
Rule: load minimum level needed; verify sufficiency before escalating.

## Fast Path
```
IF intents == 1 AND risk == LOW AND no ambiguity
→ state expected output → direct agent (stop)
IF ambiguity exists → resolve before routing; do not guess
```

## Planner
```
IF intents >= 3 OR risk == HIGH
→ enumerate all intents explicitly → planner
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
HIGH          → add security-reviewer as co-agent
MEDIUM        → present output for review before applying
LOW           → execute directly
risk unclear  → default MEDIUM
```
```
IF intent == ARCH → ccip-architect leads
```

## Agent Selection
```
1. name all intents explicitly
2. intent → agent (table above)
3. else → general-purpose
```

## Execution
```
Before starting:
  - state the task in one sentence
  - state expected output / success criteria
  - name assumptions; if uncertain → ask

Execute:
  - 1 primary agent always
  - max 2–3 agents total
  - co-agents support primary, not parallel
  - touch only what the task requires
```

## Multi-intent
```
primary   = main intent agent
co-agents = remaining intents (max 2)
```

## Feedback
```
IF agent fails >= 2           → switch to backup (see table)
IF success >= 3               → keep current routing
IF output ≠ expected criteria → name the deviation before retrying
```

## Document Routing
| Need          | File                                   |
|---------------|----------------------------------------|
| project state | docs/project-state.md                  |
| tasks         | docs/tasks/index.md                    |
| architecture  | docs/architecture/*                    |
| schema        | packages/database/prisma/schema.prisma |
| decisions     | docs/decisions/ADR-*.md                |

## Constraints
- no full file reads — use limit + offset
- no unnecessary L3/L4
- no >3 agents
- no planner for simple tasks
- no speculation: implement only what was asked
- if a simpler approach exists, name it before using a complex one
- when in doubt → ask; never fill gaps with assumptions
