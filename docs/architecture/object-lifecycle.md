# Object Lifecycle Architecture

## 1. Purpose

Описывает жизненный цикл строительного объекта от создания до пилота.

Охватывает:
- инициализацию объекта (Module A);
- нулевой отчёт (Module B);
- управление BoQ и весовыми коэффициентами;
- управление участниками.

---

## 2. Module A — Object Initialization

### Создание объекта

При создании объекта формируется базовая структура:
- `construction_objects` — мета-данные объекта (название, адрес, tenant_id)
- `boq_items` — позиции сметы с `planned_volume`, `unit_price`
- `weight_coef` — весовой коэффициент через DB trigger: `planned_cost / total_planned_cost`

### Инварианты инициализации

- `weight_coef` по всем позициям объекта должны суммироваться в `1.00`
- `planned_volume > 0` для каждой позиции
- tenant_id обязателен на всех таблицах

### BoQ Versioning (ADR-006)

Базовая линия версионируется через `effective_from` + `boq_versions` snapshot:
- UpdateBaseline создаёт новую версию, не изменяет текущую
- Исторические периоды всегда рассчитываются по версии, актуальной на момент периода

---

## 3. Module B — ZeroReport

### Назначение

Нулевой отчёт — обязательный шаг до открытия первого периода.

Содержит:
- подтверждение начального состояния объекта директором
- фиксацию базовой линии (baseline snapshot)
- инициализацию `cumulative_fact = 0` для всех позиций

### Переход к Period Engine

ZeroReport завершён → разблокируется создание первого периода (Module C).

---

## 4. Participants

| Роль | Назначение | Доступ |
|------|-----------|--------|
| `admin` | создаёт объект, управляет пользователями | полный |
| `director` | утверждает нулевой отчёт | read + approve |
| `supervisor` | стройконтроль, верификация | create/close period |
| `contractor` | подача данных через GpToken | GpToken flow only |

Назначение ролей — через `object_participants` таблицу с tenant_id изоляцией.

---

## 5. Key Tables

| Таблица | Назначение |
|---------|-----------|
| `construction_objects` | объект верхнего уровня |
| `boq_items` | позиции сметы |
| `boq_versions` | снапшоты baseline (ADR-006) |
| `object_participants` | роли участников |
| `weight_coefficients` | весовые коэффициенты (trigger-управляемые) |

---

## 6. ADR References

- ADR-006: BoQ versioning через `effective_from` / snapshot
- ADR-012: multi-tenancy — `tenant_id` на всех таблицах, RLS policy
