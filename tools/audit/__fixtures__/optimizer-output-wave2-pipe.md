## Session Optimization Report — 2026-05-16T00-00-00Z

### Plan-file selection
| Кандидат | Упоминания (turn #) | Выбран? |
|---|---|---|
| (no plan; wave2 pipe-escape regression test) | n/a | N/A |

### Нарушения (0)
| # | Паттерн | Где | Стоимость (bucket) | Правка |
|---|---|---|---|---|

### Карантин (§Q)
| Утверждение | Причина | Действие пользователя |
|---|---|---|

### Coverage
full

## Next-Session Bootstrap

Wave 2 pipe-escape smoke fixture [sha:wave2pipe].

<!-- bootstrap-integrity timestamp:2026-05-16T00-00-00Z generated-by:ccip-session-optimizer -->

### Evidence Log

| # | claim_in_bootstrap | source_file | anchor | exact_substring |
|---|---|---|---|---|
| 1 | escaped pipe survives parser | repo:tools/audit/__fixtures__/wave2-pipe-source.txt | if (a | if (a \|\| b) continue; |

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
