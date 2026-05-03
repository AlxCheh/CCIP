# CLAUDE.md v2 — Lean Orchestration Guide

## 1. Core Principle
Load minimal context. Solve tasks via the simplest path.

## 2. Context Rules
- Read only necessary sections
- Use limit + offset
- Avoid full architecture loading unless needed
- Delegate large tasks

### Context Levels
- L1: Routing
- L2: Task
- L3: Architecture
- L4: Full analysis

**Rule:** Do not escalate without need

## 3. Task Flow
```
IF simple task → direct agent
ELSE → classify intents → check risk → route
```

## 4. Fast Path
```
IF intents == 1 AND risk == LOW → direct agent
```

## 5. Intent Routing
- ARCH → ccip-architect
- SCHEMA → ccip-dba
- BACKEND → ccip-backend-core
- AUX → ccip-backend-aux
- FRONTEND → ccip-frontend
- DEVOPS → ccip-devops
- QA → ccip-qa
- SECURITY → security-reviewer
- DOC → ccip-doc-writer

### Multi-intent
- Primary = main intent
- Others = co-agents

## 6. Risk
- HIGH: auth / security / breaking
- MEDIUM: schema / API
- LOW: docs / UI

### Rules
- HIGH → add security-reviewer
- ARCH → architect lead

## 7. Planner
Use ONLY if:
- intents ≥ 3
- OR risk HIGH
- OR unclear task

## 8. Agent Selection
1. Policy
2. Intent → agent
3. Else → general-purpose

## 9. Execution
- 1 primary agent
- max 2–3 agents
- avoid complex DAG

## 10. Feedback
```
Fail ≥2 → backup agent
Success ≥3 → keep routing
```

## 11. Document Routing
- docs/project-state.md
- docs/tasks/index.md
- docs/architecture/*
- prisma/schema.prisma
- docs/decisions/ADR

## 12. Forbidden
- full file reads
- unnecessary L4
- planner overuse
- >3 agents

## 13. Efficiency
- minimize tokens
- avoid duplication
- prefer simple logic

## 14. Verification
Define success before task

## 15. Golden Rule
> Simple > complex
