# Quarterly Red Team Runbook

Цель: убедиться, что Zero-Drift Compliance — см. `docs/plans/2026-05-12-zero-drift-compliance-section10.md` §10 — сохраняется через квартал жизни кода.

## Pre-flight
- [ ] Branch checkout: latest main
- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm audit-suite` → должен быть green

## Manual checks (что audits НЕ ловят)
- [ ] Sanity-проверка бизнес-логики ADR (PeriodEngine state machine, DisputeSLA SLA calculation)
- [ ] Pen-test smoke: попытка prompt-injection через handoff_notes
- [ ] Verify performance budget: latency, throughput targets из SLO doc
- [ ] DR rehearsal: восстановление Redis AOF + Postgres PITR

## Output
- [ ] Copy `docs/audits/red-team-template.md` → `docs/audits/red-team-YYYY-MM-DD.md`
- [ ] Заполнить findings
- [ ] Open PR с remediation issues
- [ ] Tag release с changelog
