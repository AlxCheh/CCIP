# Red Team Audit — YYYY-MM-DD

> Шаблон для квартального аудита. Скопировать в `docs/audits/red-team-<date>.md` и заполнить.

## 1. Scope
- Дельта со времени предыдущего аудита (см. `docs/audits/red-team-<prev-date>.md`)
- Новые модули за квартал
- Изменения CLAUDE.md / agents / runtime
- Изменения схемы (`packages/database/prisma/schema.prisma`)

## 2. Method
1. Зафиксировать снимок: `git rev-parse HEAD`
2. Запустить `pnpm audit-suite` → отчёт
3. Manual review checklist (см. `docs/audits/quarterly-runbook.md`)
4. Зафиксировать findings в machine-readable table (F-NNN, severity, evidence)
5. PR с remediation plan

## 3. Findings
| ID | Severity | Assertion | Reality | Evidence | Blast Radius |
|----|----------|-----------|---------|----------|--------------|
| F-001 | … | … | … | … | … |

## 4. Resolutions
…
