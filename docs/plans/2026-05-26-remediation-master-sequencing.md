# Remediation Master Sequencing — закрытие остатка фиксов, багов и audit-findings

> **Тип:** sequencing/roadmap (не task-decomposition). Каждый work-item делегирует детали существующему sub-плану или требует отдельной writing-plans сессии.
> **Сверка состояния:** 2026-05-26 против git-истории + артефактов на диске. `docs/project-state.md` устарел (Last Updated 2026-05-07) — не источник истины для работ после этой даты.
> **Источник findings:** `docs/audits/multi-agent-ecosystem-2026-05-07.md` (Tier 2 sub-plans), `docs/audits/zero-drift-compliance-checklist-2026-05-12.md`, остаток M-05b.

---

## 1. Что осталось (полный реестр открытого)

| # | Work-item | Источник | Текущее состояние | Эффорт | Блокирует |
|---|-----------|----------|-------------------|--------|-----------|
| ~~**W1**~~ | ~~M-05b завершение~~ | `archive/2026-05-24-dispute-sla-module.md` | ✅ **DONE 2026-05-28** — Tasks 1–9: HTTP-слой + оба TODO M-05b закрыты; 279 unit + audit 18/18. Task 10 (E2E acceptance) отложен. Branch `feat/m-05b-dispute-http-period-fixes` | — | разблокировал M-05c, M-08 |
| **W2** | §11 Business Correctness gate (Wave 1) | `2026-05-18-sub-plan-a-wave-1.md` (Tier 2 / Sub-plan A) | Не начат (`apps/api/test/integration/` отсутствует) | 3–5 d | regression-safety всех ADR-002/006/007/010 |
| **W3** | Hook write-lock (X-1 hard guarantee) | Tier 2 / Sub-plan F | Не начат (PARTIAL: atomic write есть, write-lock нет) | 1–2 d | — (изолировано) |
| **W4** | RLS fuzz suite (X-6) | Tier 2 / Sub-plan E | Не начат | 2–3 d | pre-pilot security |
| **W5** | M-12 K8s scaffold (F-006, X-11) | Tier 2 / Sub-plan C | Не начат (`infra/k8s/` отсутствует) | 2–3 d | W6, M-12 |
| **W6** | §12 Operational Readiness gate (DR/RTO/RPO/SLO/runbooks) | Tier 2 / Sub-plan B | Не начат | 4–6 d | pre-pilot M-13 |
| **W7** | M-M Mobile scaffold (F-005, ADR-008/013/014) | Tier 2 / Sub-plan D | Не начат (`apps/mobile/` отсутствует) | 5–10 d | post-pilot |
| **W8** | Dev-runtime bring-up + schema/migration sync | вскрыто 2026-05-29 при M-05b Task 10 (первый E2E прогон стека) | Частично: 8 runtime-фиксов done (`40308e7` — @ccip/database CJS build, BullMQ REDIS_PASSWORD, @Public GP submit, seed bcrypt/import; + pg_cron PR #9, ручной ALTER sla_force_close_at, dev `.env`). **Открыто:** B-01 period status drift код↔БД, B-02 migration-history drift (project-state §3) | 1–3 d | M-05b Task 10, M-08, любой E2E |

**Cosmetic / Tier 3 (не фиксируем без триггера):** F-019 (docker-compose location), F-025/026/027, X-5 (auditor self-modify — theoretical). Зафиксированы справочно в residual-remediation плане §0.

**Не баги:** записи `VIOLATIONS detected` в `docs/errors/errors_log.md` — это корректные срабатывания verifier'а session-optimizer на плохих bootstrap-цитатах прошлых сессий, а не дефекты кода.

---

## 2. Оптимальная очередность

```
W1  ──────────────► (критический путь: разблокирует M-05c/M-08)
        │
        ▼
W2  ─────────────────────────► (safety net до новых модулей)
W3  ──┐ (параллельно W2: другой домен/агент, изолировано)     ← quick win, снимает последний open infra-риск X-1
      │
      ▼
W4  ─────────────► (использует инфраструктуру W2; security pre-pilot)
        │
        ▼
W5  ─────────────► (prod-infra prereq)
        │
        ▼
W6  ─────────────► (зависит от K8s из W5)
        │
        ▼
W7  ─────────────► (post-pilot, P4 — последним)
```

### Обоснование порядка

1. **W1 первым** — единственный наполовину сделанный модуль и активный P1. Закрытие Tasks 8–10 разблокирует M-05c и M-08 при наименьшем эффорте (~0.5–1 d). Критический путь к пилоту.
2. **W2 рано** — integration-suite ловит регрессии; чем раньше поставлен, тем дешевле каждый последующий модуль. D-block (dispute) тесты требуют готового W1, поэтому строго после него.
3. **W3 параллельно W2** — изолированный dev-tooling фикс (другой домен, другой агент, нет пересечения файлов). Снимает X-1 — единственный оставшийся open infra-риск. Можно вклинить как быстрый выигрыш, не блокируя критический путь.
4. **W4** — RLS fuzz опирается на test-инфраструктуру из W2; multi-tenancy (M-02c) уже готов. Security gate перед пилотом.
5. **W5 → W6** — K8s scaffold обязателен прежде Operational Readiness (DR/SLO-прогоны нужен manifests). Жёсткая зависимость.
6. **W7 последним** — Mobile это P4 / post-pilot по `project-state §2`; не на критическом пути M-13.

### Распараллеливание (если несколько исполнителей)
- Поток A (backend-core): W1 → W2 → W4
- Поток B (devops): W3 → W5 → W6
- W7 — после пилота, отдельно.

---

## 3. Маршрутизация по агентам (CLAUDE.md Intent table)

| Work-item | Primary | Co-agent | Risk |
|-----------|---------|----------|------|
| W1 | `ccip-backend-core` | `ccip-qa` (Task 10 acceptance) | MEDIUM (BullMQ + period invariants) |
| W2 | `ccip-qa` | `ccip-backend-core` | MEDIUM |
| W3 | `ccip-devops` | — | LOW |
| W4 | `ccip-security` | `ccip-dba` (RLS политики) | **HIGH → security-reviewer co-agent** |
| W5 | `ccip-devops` | `ccip-architect` (ADR-005 worker config) | MEDIUM |
| W6 | `ccip-devops` | `ccip-architect` | MEDIUM |
| W7 | `ccip-mobile` | — | MEDIUM |

W2/W4/W5/W6/W7 — каждый требует отдельной brainstorming + writing-plans сессии (per residual-remediation §1: «каждый sub-plan требует отдельной планировочной сессии»). W3 достаточно мал для inline-плана. W1 уже декомпозирован (Tasks 8–10 готовы к исполнению).

---

## 4. Definition of Done (на каждый work-item)

- W1: `dispute.controller.ts` + `dispute.module.ts` созданы и зарегистрированы в `app.module.ts`; оба TODO M-05b в `period.service.ts` закрыты; Task 10 acceptance (Scenario A + Redis recovery) зелёный; `node tools/audit/audit-suite.js` без регрессий; `project-state.md` обновлён (M-05b → `✓ done`); план перемещён в `archive/`.
- W2–W7: соответствующий sub-plan исполнен полностью; CI-gate зелёный; finding(ы) в `zero-drift-compliance-checklist-2026-05-12.md` отмечены; `project-state.md` обновлён.
- Общий инвариант: каждый work-item заканчивается обновлением `project-state.md` и (для W2–W7) галочкой в zero-drift checklist — иначе drift между state и кодом повторится.

---

## 5. Первое действие

Начать с **W1** — он готов к исполнению без планировочной сессии:
```
docs/plans/2026-05-24-dispute-sla-module.md → Task 8 → Task 9 → Task 10
```
Агент: `ccip-backend-core` (primary) + `ccip-qa` (acceptance). После закрытия — обновить `project-state.md` и переместить план в `archive/`.
