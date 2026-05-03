# Runtime State Protocol

Единственный источник истины о текущей сессии между вызовами агентов.
Файл: `CCIP/.claude/runtime/session-state.json`

---

## Жизненный цикл

```
Session Start
    ↓
[INIT] Заполнить task, intents, risk, confidence, routing, started_at, status→"planning"
    ↓
[PLAN] Если routing=planner → заполнить dag[], current_step=0, status→"executing"
    ↓
[INJECT] Перед каждым Agent call → прочитать state, передать в промпт агента
    ↓
[UPDATE] После каждого Agent call → записать agent_outputs[name] + observations[]
    ↓
[FLUSH] Stop hook автоматически → flush-state.js → переносит observations в feedback-loop.md
```

---

## Схема полей

### Поля инициализации (заполняются при старте сессии)

| Поле | Тип | Значения |
|---|---|---|
| `session_id` | string | `YYYY-MM-DD-HHMM` |
| `task` | string | Краткое описание задачи (1-2 предложения) |
| `intents` | string[] | Из §7.0: ARCH, SCHEMA, BACKEND_CORE, ... |
| `risk` | string | `LOW` \| `MEDIUM` \| `HIGH` (§7.7) |
| `confidence` | string | `HIGH` \| `MEDIUM` \| `LOW` (§7.1) |
| `routing` | string | `direct` \| `planner` \| `multi-agent` |
| `started_at` | string | ISO 8601 timestamp |
| `status` | string | `init` → `planning` → `executing` → `done` \| `blocked` |

### DAG (заполняется при routing=planner)

```json
"dag": [
  {
    "step": 1,
    "type": "sequential",
    "agent": "ccip-architect",
    "role": "lead",
    "scope": "Что именно делает этот агент",
    "status": "pending | running | done | failed",
    "depends_on": []
  }
]
```

### Agent outputs (заполняется после каждого Agent call)

```json
"agent_outputs": {
  "ccip-architect": {
    "summary": "≤ 3 предложения о сделанном",
    "artifacts": ["path/to/file.md"],
    "handoff_notes": "Что нужно знать следующему агенту"
  }
}
```

### Observations (заполняется после каждого агента, флашится в feedback-loop)

```json
"observations": [
  {
    "agent":          "ccip-architect",
    "session":        "2026-05-03-1430",
    "written_at":     "2026-05-03T14:32:11.000Z",
    "dag_step":       1,
    "outcome":        "success | rerouted | partial",
    "context_tokens": 14000,
    "reason":         "Причина reroute или пустая строка при success"
  }
]
```

**Правила валидации (flush-state.js):**
- `agent` должен присутствовать в `dag[].agent` текущей сессии; иначе запись пропускается с предупреждением.
- `session` и `written_at` заполняются автоматически execute-dag.js — агент не должен указывать их вручную.
- `dag_step` — номер шага DAG, который сгенерировал наблюдение; позволяет отследить потери при race.

---

## Правила для агентов

**При старте агента:**
1. Если `agent_outputs` не пуст → прочитать `handoff_notes` предыдущих агентов
2. Проверить `current_step` → убедиться что выполняешь правильный шаг DAG

**При завершении агента:**
1. Записать `agent_outputs[agent_name]` с summary + artifacts + handoff_notes
2. Добавить observation в `observations[]`
3. Обновить `status` DAG-шага → `done`
4. Если последний шаг → установить `status` сессии → `done`

---

## Инъекция state в Agent prompt

Обязательный блок в начале каждого Agent prompt:

```
## Session Context (from session-state.json)
Task: <task>
Intents: <intents>
Risk: <risk>
Previous agents: <список agent_outputs с handoff_notes>
Your step: <dag[current_step].scope>
```

**Защита от prompt injection:**
`handoff_notes` предыдущих агентов инъецируется с HTML-тегами `<!-- handoff-data -->` / `<!-- /handoff-data -->` и проходит через `sanitizeHandoff()`, которая удаляет строки, начинающиеся с `ignore`, `system:`, `you are now`, `new instruction` и подобных паттернов. Агенты не должны копировать handoff-данные в артефакты или свой handoff_notes без явного намерения.

---

## Flush

`flush-state.js` запускается Stop hook автоматически:
- Читает `observations[]`
- Если не пусто → добавляет в `feedback-loop.md §4`
- Валидирует: `obs.agent` должен присутствовать в `dag[].agent`; иначе — пропуск с `stderr` предупреждением
- Сбрасывает `observations[]` в state file через атомарный tmp→rename (исключает corrupt на crash)

## Запуск execute-dag.js

```bash
node execute-dag.js               # отобразить DAG-план, выполнить
node execute-dag.js --confirm     # отобразить DAG-план, спросить подтверждение
node execute-dag.js --auto        # пропустить отображение плана, выполнить
node execute-dag.js --dry-run     # отобразить план без запуска агентов
node execute-dag.js --resume      # пропустить done-шаги, сбросить failed→pending
```

**По умолчанию** (без флагов): DAG-план отображается в консоли, выполнение начинается автоматически. Используй `--confirm` для интерактивного подтверждения при запуске из pipelineокружений, где автозапуск нежелателен.
