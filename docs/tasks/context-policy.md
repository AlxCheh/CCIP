# Context Policy

Определяет набор документов, загружаемых в зависимости от Context Level (T-level).  
T-level определяется из Task Type через `index.md §0.1`.

---

## T-level Resolution

| T-level | Task Type | Что загружается |
|---------|-----------|-----------------|
| T1 | Documentation | только целевой документ |
| T2 | Feature, Refactoring, Performance, Research | phase file + arch module |
| T3 | Bug Fix, Security Update | phase file + error log + arch module |
| T4 | Architecture Change | phase file + core-platform + ADR |

> T-level выше необходимого — запрещено.
