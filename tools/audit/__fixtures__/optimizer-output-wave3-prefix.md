## Session Optimization Report — 2026-05-16T00-00-00Z

### Plan-file selection
| Кандидат | Упоминания (turn #) | Выбран? |
|---|---|---|
| (no plan; wave3 heading-prefix regression test) | n/a | N/A |

### Нарушения (0)
| # | Паттерн | Где | Стоимость (bucket) | Правка |
|---|---|---|---|---|

### Карантин (§Q)
| Утверждение | Причина | Действие пользователя |
|---|---|---|

### Coverage
full

### Артефакт 2 — Next-Session Bootstrap

Wave 3 heading-prefix smoke fixture [sha:wave3pref].

<!-- bootstrap-integrity timestamp:2026-05-16T00-00-00Z generated-by:ccip-session-optimizer -->

### Артефакт 3 — Evidence Log

| # | claim_in_bootstrap | source_file | anchor | exact_substring |
|---|---|---|---|---|
| 1 | claude.md heading | repo:CLAUDE.md | orchestration | Simple > complex |

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
