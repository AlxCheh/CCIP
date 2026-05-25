## Session Optimization Report — 2026-05-25T00-00-00Z

### Plan-file selection
| Кандидат | Упоминания (turn #) | Выбран? |
|---|---|---|
| (no plan; C-2 anchor-window regression test) | n/a | N/A |

### Нарушения (0)
| # | Паттерн | Где | Стоимость (bucket) | Правка |
|---|---|---|---|---|

### Карантин (§Q)
| Утверждение | Причина | Действие пользователя |
|---|---|---|

### Coverage
full

## Next-Session Bootstrap

C-2 anchor-window BAD fixture [sha:c2anchbd].

<!-- bootstrap-integrity timestamp:2026-05-25T00-00-00Z generated-by:ccip-session-optimizer -->

### Evidence Log

| # | claim_in_bootstrap | source_file | anchor | exact_substring |
|---|---|---|---|---|
| 1 | quote outside anchor window | repo:CLAUDE.md | ## Context | no full file reads |

## §I Манифест инвариантов

```yaml manifest=invariants-v1
invariants:
  bootstrap_claims: 1
  evidence_rows: 1
  unverified_rows: 0
  quarantined: 0
  preflight_tokens: 600
  preflight_calls: 1
  coverage: full
  trigger_match: 'exact:"End session"'
  plan_files: []
  state_memory_files: []
```
