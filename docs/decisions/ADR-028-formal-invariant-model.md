---
adr: ADR-028
status: Принято
impl_anchors:
  - tools/formal/CCIPInvariants.tla
  - tools/formal/MC.cfg
  - .github/workflows/ci.yml
related:
  - ADR-019
  - ADR-024
  - ADR-025
  - ADR-026
---

# ADR-028 — Formal TLA+ Model of Core Governance Invariants

## Контекст

`docs/audits/2026-06-12-capability-assessment.md` §I фиксирует «нет формальной верификации
**[ОТСУТ.]**» как ключевой блокер Mission-Critical. После Волны 2 (#2/#6) набор
block-инвариантов стабилизирован: INV-AGENT-BUDGET, INV-STATE-CONTRACT, INV-SECURITY-COAGENT
(все enforced), плюс cross-process lock (ADR-019). Моделировать до стабилизации бессмысленно
(роадмап §XII «Волна 4»).

## Решение

**TLA+ (native syntax) + TLC model checker** для 4 block-инвариантов в одном файле
`tools/formal/CCIPInvariants.tla`. Выбор TLA+ над Alloy: лучший CI-headless (exit code);
concurrency-домен (lock, budget) — родная зона TLA+; один toolchain.

**Верифицированные свойства:**

| Инвариант | Свойство | Тип |
|---|---|---|
| INV-AGENT-BUDGET | `agent_count ≤ MAX_AGENTS` всегда | Safety |
| INV-STATE-CONTRACT | `completed ∧ ¬exempt ⇒ has_state_update` | Safety |
| INV-SECURITY-COAGENT | `security_surface ⇒ coagent_present` | Safety |
| Cross-process lock | Взаимное исключение + eventual progress | Safety + Liveness |

**Константы модели (MC.cfg):** MAX_AGENTS=5, |PROCESSES|=3, |AGENTS|=7 — полный перебор
TLC: 3.88M states, 469K distinct, глубина 23, 4 мин 28 сек.

**CI:** новый job `formal` (ubuntu + temurin Java 11), независимый от `audit`/`ci`.
`tla2tools.jar` закоммичен → версия зафиксирована, нет wget в CI.

**Техническая заметка:** константы `ACTS`/`SECURITY_ACTS` вместо `ACTIONS`/`SECURITY_ACTIONS` —
`ACTIONS` конфликтует с зарезервированным именем TLC; семантика идентична.

## Границы (честно)

- Модель верифицирует **абстракцию** инвариантов, не production-код напрямую.
  Соответствие кода модели — ответственность review.
- State space ограничен константами MC.cfg. Свойства доказаны для этих bounds.
- Liveness требует WF (weakly-fair) процессов — корректно для OS-шедулинга.
- Формальная верификация закрывает «нет формальной верификации», но не даёт HA/distributed —
  Mission-Critical остаётся недостижимым по другим причинам (single-node, нет консенсуса).

## Связь

Закрывает §I capability-assessment `[ОТСУТ.]→[ПОДТВ.]`.
Обновляет §VII, §VIII, §IX, §XII.8, §XIII.
