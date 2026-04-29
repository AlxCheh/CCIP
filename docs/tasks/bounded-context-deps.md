# Bounded Context Dependency Graph

**Источник:** `core-platform.md §8, §12`; `architecture/*.md §Dependencies`  
**Назначение:** определить, какой контекст загружать при межмодульных задачах.

---

## 1. DAG Зависимостей

```
[Auth & Security] ──► все модули (глобальная зависимость)
[Data Layer]      ──► все модули (глобальная зависимость)

[Object Lifecycle]
       │
       ▼
[Period Engine] ──────────────────────────────────────────┐
       │                                                  │
       ├──────────────────┐                               │
       ▼                  ▼                               │
[Disputes & SLA]  [Analytics Engine]                      │
       │                  │                               │
       └──────────────────┴──────────────────►[Infrastructure]

[Sync Engine] ──► Period Engine, Auth & Security, Data Layer
```

**Правила DAG:**
- Стрелка `A → B` означает: модуль A зависит от B.
- Auth & Security и Data Layer — глобальные зависимости; не указываются в каждом узле.
- Изменение узла может нарушить все узлы, указывающие на него.

---

## 2. Зависимости по модулю

### Auth & Security
| Поле | Значение |
|------|----------|
| **depends_on** | Data Layer (токены), Object Lifecycle (проверка доступа к объектам) |
| **depended_by** | все модули, Disputes & SLA, Sync Engine |
| **change_impact** | **HIGH** — затрагивает весь стек |
| **Агент** | `ccip-security` + `ccip-architect` при изменении контракта |

---

### Data Layer
| Поле | Значение |
|------|----------|
| **depends_on** | — (фундаментальный слой) |
| **depended_by** | все модули |
| **change_impact** | **CRITICAL** — любая миграция схемы затрагивает всю систему |
| **Агент** | `ccip-dba` + `ccip-architect` при изменении схемы |

---

### Object Lifecycle (Init Module A)
| Поле | Значение |
|------|----------|
| **depends_on** | Auth & Security, Data Layer |
| **depended_by** | Period Engine (zero-report check), Auth & Security (object access) |
| **change_impact** | **MEDIUM** — затрагивает Period Engine |
| **Агент** | `ccip-backend-core` |

---

### Period Engine (Module C)
| Поле | Значение |
|------|----------|
| **depends_on** | Object Lifecycle, Data Layer, Auth & Security |
| **depended_by** | Disputes & SLA, Analytics Engine, Sync Engine, Auth (GP token) |
| **change_impact** | **HIGH** — state machine изменение затрагивает D, E, I |
| **Агент** | `ccip-backend-core` + `ccip-architect` при изменении state machine |
| **Ключевые ADR** | ADR-002, ADR-007 |

---

### Disputes & SLA (Module D)
| Поле | Значение |
|------|----------|
| **depends_on** | Period Engine (блокировка закрытия), Auth & Security, Data Layer, Infrastructure |
| **depended_by** | Period Engine (обратная блокировка: open disputes блокируют period close) |
| **change_impact** | **MEDIUM** — блокирует period close workflow |
| **Агент** | `ccip-backend-core` |
| **Ключевые ADR** | ADR-005 |

---

### Analytics Engine (Module E)
| Поле | Значение |
|------|----------|
| **depends_on** | Period Engine (источник закрытых периодов), Data Layer, Infrastructure (MV refresh) |
| **depended_by** | Dashboard, Data Layer (snapshot storage) |
| **change_impact** | **MEDIUM** — влияет на Dashboard и MV |
| **Агент** | `ccip-backend-core` |
| **Ключевые ADR** | ADR-004, ADR-011 |

---

### Sync Engine (Module I)
| Поле | Значение |
|------|----------|
| **depends_on** | Mobile Architecture, Data Layer, Period Engine (валидация изменений), Auth & Security |
| **depended_by** | Data Layer (версионирование), Mobile App |
| **change_impact** | **LOW** — изолирован от критического пути MVP |
| **Агент** | `ccip-backend-aux` |
| **Ключевые ADR** | ADR-003, ADR-008 |

---

### Infrastructure (BullMQ, Redis, K8s)
| Поле | Значение |
|------|----------|
| **depends_on** | — (инфраструктурный слой) |
| **depended_by** | Disputes & SLA (workers), Analytics Engine (MV refresh) |
| **change_impact** | **MEDIUM** — затрагивает D, E при изменении конфигурации |
| **Агент** | `ccip-devops` |
| **Ключевые ADR** | ADR-005 |

---

## 3. Impact Matrix — что проверять при изменении модуля

| Изменяемый модуль | Обязательно проверить | Дополнительный контекст |
|-------------------|-----------------------|------------------------|
| Auth & Security | ВСЕ модули | `auth-security.md` + ADR-009 |
| Data Layer | ВСЕ модули | `data-layer.md` + migration plan |
| Object Lifecycle | Period Engine | `period-engine.md §8` |
| Period Engine | Disputes & SLA, Analytics Engine, Sync Engine | ADR-002, ADR-007 |
| Disputes & SLA | Period Engine (close workflow) | ADR-005 |
| Analytics Engine | Dashboard, Data Layer (MV) | ADR-004, ADR-011 |
| Sync Engine | Data Layer, Mobile App | ADR-003, ADR-008 |
| Infrastructure | Disputes & SLA, Analytics Engine | ADR-005 |

---

## 4. Cross-Module Task Classification

### CRITICAL — ccip-architect обязателен
- Изменения в контракте Auth & Security (JWT, RBAC guards)
- Изменения в схеме Data Layer (миграции)
- Изменения в state machine Period Engine

### HIGH — ccip-architect + профильный агент
- Новый тип dispute / SLA escalation rule
- Изменение алгоритма Analytics (WMA, прогноз)
- Изменение структуры Object Lifecycle (BoQ, weight_coef)

### MEDIUM — только профильный агент
- Изменения внутри bounded context без затрагивания публичного контракта
- Добавление нового endpoint в рамках существующей бизнес-логики

---

## 5. Read Policy

При задаче, затрагивающей межмодульные интерфейсы:

1. Найти модуль в §2;
2. прочитать строку `depended_by` — это модули, которые могут сломаться;
3. загрузить architecture doc для каждого downstream модуля из `depended_by`;
4. если `change_impact = HIGH/CRITICAL` → привлечь `ccip-architect`.

> Файл читается с `limit: 60` (§1–§2 достаточно для маршрутизации).

---

## 6. Правило направления зависимостей

> Зависимости должны быть направлены только по утвержденной схеме DAG (§1).  
> Новые межмодульные зависимости требуют ADR.  
> Источник: `core-platform.md §8 Inter-Module Contracts`.
