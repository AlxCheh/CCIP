# .claude/audit/ — token-efficiency-auditor runtime state

Persistent agent-owned state для `token-efficiency-auditor` (см. `docs/decisions/ADR-016-token-efficiency-auditor.md`).

> Эта директория — **runtime-память агента**, не CI-инструментарий. CI-скрипты живут в `tools/audit/`.

## Структура

| Путь | Назначение | Мутабельность |
|---|---|---|
| `rules/baseline.yaml` | Immutable seed (15 правил R-001..R-015) | **read-only**, откат при катастрофе |
| `rules/active.yaml` | Live-набор; мутируется обучением | агент пишет |
| `rules/quarantine.yaml` | Испытательный срок (shadow-режим) | агент пишет |
| `rules/deprecated.yaml` | Архив отвергнутых правил с причинами | append-only |
| `metrics/history.jsonl` | 1 строка = 1 сессия | append-only |
| `metrics/rolling-30.json` | Производный агрегат за 30 сессий | агент пишет |
| `antipatterns/AP-NNN.md` | Карточки обнаруженных антипаттернов | агент пишет |
| `evidence/<session-id>.json` | Сырые findings + token-attribution | агент пишет |
| `reports/<session-id>.md` | Человекочитаемый отчёт | агент пишет |

## Lifecycle правила

```
proposed → quarantine(3 сессии) → active ──┐
                ↓                          ↓
            rejected                  deprecated
```

- Промоушен `quarantine → active`: ΔT ≥ +5% AND ΔQ ≥ 0 AND precision ≥ 0.7.
- Auto-deprecate: hit_count = 0 за 20 сессий ИЛИ precision < 0.4.
- `requires_transcript_access: true` → не промотируется на текущем runtime (raw transcript недоступен).

## Текущий статус

- **Активны (12):** R-001..R-006, R-008, R-010, R-011, R-013..R-015.
- **В quarantine (3, заблокированы):** R-007, R-009, R-012 — требуют raw transcript.
