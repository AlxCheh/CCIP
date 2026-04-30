# Routing Contract

Формальная схема routing decision. Routing считается завершённым только когда все поля resolved.

---

```yaml
routing_contract:

  inputs:
    task_type:
      required: true
      source: task description
      values:
        - Feature Implementation
        - Refactoring
        - Bug Fix
        - Architecture Change
        - Research Task
        - Documentation Update
        - Performance Optimization
        - Security Update

    module_id:
      required: true
      source: index.md §1.5
      values: [M-01, M-02, M-03, M-04, M-05, M-06, M-07, M-08, M-10, M-11, M-12, M-13, M-M]

  resolved:
    priority_tier:
      required: true
      source: priority-policy.md
      resolved_from: phase file marker [H]🔴 / [H] / [M] / [L]
      values: [P1-CRITICAL, P2-BLOCKING, P3-REQUIRED, P4-OPTIONAL]

    context_level:
      required: true
      source: context-policy.md
      resolved_from: task_type
      values: [T1, T2, T3, T4]

    execution_agent:
      required: true
      source: index.md (task_type + module_id)
      resolved_from: index.md row → agent-handoff.md for co-agents

  fallback:
    unresolved_module:
      agent: ccip-architect
      reason: unknown scope requires architectural triage
      lookup: docs/delivery/critical-path.md (limit:30)
    unresolved_priority:
      tier: P2-BLOCKING
      reason: conservative default; avoids skipping required DoR checks
    unresolved_context:
      level: T2
      reason: covers most non-trivial tasks without over-loading context

  validation:
    valid_when: all fields resolved (via lookup or fallback)
    invalid_when: any required field is null after fallback applied
    on_invalid: block execution, record in project-state.md §3
```
