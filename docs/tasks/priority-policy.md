# Priority Policy

Маркер приоритета читается из phase file секции при lookup по `index.md §1.5`.

---

## Priority Tiers

| Tier | Маркер | DoR checks | Escalation |
|------|--------|------------|------------|
| **P1-CRITICAL** | `[H] 🔴 CRITICAL PATH` | Все обязательны | +`ccip-architect` при T3/T4; блокер → `project-state.md §3` немедленно |
| **P2-BLOCKING** | `[H]` без 🔴 | Phase + Dep + Schema | Нет; выполнять после всех P1 текущей фазы |
| **P3-REQUIRED** | `[M]` | Phase + Dep | Нет; допустима параллельность с другими P3 |
| **P4-OPTIONAL** | `[L]` | Phase only | Нет; начинать только после завершения всех P1 + P2 проекта |

---

## Priority по модулю (M-ID)

| Tier | Модули |
|------|--------|
| **P1-CRITICAL** | M-00, M-01, M-02, M-03, M-04, M-05a, M-05b, M-05c, M-08, M-10, M-11, M-12, M-13 |
| **P2-BLOCKING** | M-07 |
| **P3-REQUIRED** | M-06 |
| **P4-OPTIONAL** | M-M |
