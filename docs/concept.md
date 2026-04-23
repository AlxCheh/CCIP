---
name: CCIP Project Concept
description: Core business logic of the Intelligent Construction Management Platform (CCIP) - roles, data model, workflows, analytics
type: project
originSessionId: fe5bb90c-2ecf-4761-a36d-fc09bb835bd9
---
# CCIP — Интеллектуальная платформа управления строительством

**Why:** Platform for digitizing construction progress tracking with verified fact entry, discrepancy management, and forecast analytics.
**How to apply:** All features must align with this 4-level model and role model.

## 4-level data model
- **Level 0** — System Configuration (admin-only parameters: period length, thresholds, decay_factor, etc.)
- **Level 1** — Object Passport (immutable: name, class, participants, permit)
- **Level 2** — Project Documentation (versioned: SSR, RDC, calendar plan, BoQ ≤50 items)
- **Level 3** — Current Status (live: 0-report, periodic fact entry, % readiness, forecasts)

## Roles
- **GP (General Contractor)** — provides filled summary template, does NOT work in system
- **Stroycontrol (Construction Control)** — sole operator: verifies, enters data, classifies discrepancies
- **Project Director** — read-only dashboard, approves 0-report/UpdateBaseline/L2 changes
- **Admin** — configures Level 0, manages closed periods, co-approves with Director

## Core workflow: Period cycle
1. Stroycontrol opens period → GP template generated
2. GP fills template (volume + note) and submits
3. Stroycontrol visits site, verifies, photos within 2 calendar days
4. Stroycontrol enters verified fact → closes period
- Closed period = immutable (except Admin with reason)
- Period can't close if any item is "Disputed"

## 0-Report (baseline)
- Required before first period (hard block)
- Source priority: 1) field measurement, 2) GP exec docs, 3) КС-2
- Cross-verification required for weight_coef ≥ 0.10 OR critical_works[] (3 docs mandatory)
- Timer: alert after 5 days if not approved

## Discrepancy classification (binary)
- **Type 1 (technical):** works visible + measurable without destruction → Stroycontrol enters own figure
- **Type 2 (disputed):** works hidden OR inaccessible → status "Disputed", blocks period close
- **Type 3 (systemic):** ≥N Type-2 in last M periods → auto-flag on Director dashboard

## SLA Deadlock
- **Scenario A (GP silence):** Day 5 → forced close with stroycontrol's figure
- **Scenario B (active dispute):** Day 7 Director decides; Day 14 → stroycontrol's figure applied

## % Readiness calculation
```
object_readiness = Σ(MIN(work_pct, 100%) × weight_coef)
work_pct = MIN(fact / plan × 100, 100%)
weight_coef = work_contract_value / total_contract_value  (from RDC)
```

## Two forecasts on Director dashboard
- **Weighted forecast:** based on weighted moving average pace (decay_factor=0.9, window=5 periods)
- **Critical path forecast:** MAX(forecast_end) for weight_coef ≥ 0.10 OR critical_works[]
- **Gap flag:** appears when difference ≥ forecast_gap_alert (default 2 periods)

## Overrun handling
- ≤5%: warning, input allowed
- 5-20%: mandatory note, flag on dashboard
- >20%: hard block → requires UpdateBaseline or Admin accept

## UpdateBaseline procedure
- Initiated by Stroycontrol (new plan_volume + reason + document)
- Approved by Admin (only between periods — blocked if period open)
- History not recalculated; new version applies from next period

## BoQ versioning (L2)
- Any L2 change creates new version (v1.0, v1.1, ...)
- Closed periods immutable; new version applies from next open period
- Structural deletion of item with non-zero fact → blocked (must mark "excluded from scope")

## Key UX requirements
- Mobile-first (field data entry)
- Offline mode mandatory (queue with timestamps, sync on reconnect)
- ≤50 BoQ items
- ≤10 hours/week data entry
- Conflict resolution: show both versions, no last-write-wins

## Key configurable parameters (Level 0)
| Parameter | Default |
|-----------|---------|
| N_flag_threshold | 3 |
| M_flag_window | 5 periods |
| weight_threshold | 0.10 |
| forecast_gap_alert | 2 periods |
| tolerance_threshold | 5% |
| overrun_warning_limit | 20% |
| avg_pace_periods | 5 |
| decay_factor | 0.9 |
| zero_report_alert_days | 5 |
| baseline_correction_threshold | 5% |
