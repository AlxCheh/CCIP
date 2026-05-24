---
status: Draft (ревью B применено — готов к Фазе A)
relates_to: ADR-016
date: 2026-05-23
scope: реализация триггера T-02 (session-end) + замыкание self-learning петли
quality_priority: true
review: ccip-architect 2026-05-23 — verdict B, 5 правок применены (G1/G3/G6/идемпотентность/Q3)
---

# T-02 Implementation Design — session-end audit + self-learning loop

> Качество — главный критерий. Центр риска — самомодификация правил
> (`active.yaml`/`quarantine.yaml` меняются по метрикам). Дизайн строится
> вокруг guardrails, атомарности, обратимости и CI-проверяемости.

## 1. Что такое T-02 на самом деле (коррекция дизайна)

T-02 — **НЕ** `Stop`-hook nudge. На `Stop` сессия уже закрывается — действовать на подсказку некому (ограничение C1 из hooks-design). Правильный механизм:

> На фразе «Завершаем сессию» оркестратор запускает `ccip-session-optimizer`,
> затем `token-efficiency-auditor` — **отдельными turn'ами до фактического Stop**.

Это оркестрационная конвенция (как у optimizer'а сейчас), усиленная детектором фразы. T-02 — единственная точка, где замыкается петля «обучение от сессии к сессии»: пишется `history.jsonl`, пересчитывается `rolling-30`, продвигается lifecycle правил.

## 2. Goals / Non-goals

**Goals**
- Систематический аудит каждой сессии на завершении (не только на аномалиях).
- Полные метрики по всей сессии (`T_total`, `IDC`, `ΔT_session`).
- Накопление `metrics/history.jsonl` (1 строка = 1 сессия) → `rolling-30`.
- Продвижение rule lifecycle (quarantine→active, deprecate) **с гарантиями качества**.

**Non-goals**
- Авто-запуск аудитора из `Stop`-хука (слишком поздно).
- Доступ к raw transcript (по-прежнему недоступен).
- Изменение поведения активной сессии.

## 3. Предусловие: устойчивый идентификатор сессии

**Проблема.** `session-state.json.session_id` часто `""` → нельзя дедуплицировать строки `history.jsonl` и нельзя надёжно отличить сессии (риск двойного учёта при повторном T-02).

**Решение.** `SessionStart`-hook (`audit-session-reset.js`, уже существует) при сбросе **штампует** сгенерированный `session_key` в `trigger-state.json`:
```
session_key = <ISO-8601 timestamp при старте> + "-" + <4 hex>   # пример: 2026-05-23T14:02:11Z-a3f9
```
Аудитор на T-02 берёт `session_key` из `trigger-state.json` как ключ строки истории и для идемпотентности. Fallback при отсутствии: `session-state.started_at`; если и его нет — `unknown-<date>` (не падать).

> **Идемпотентность (правка ревью):** `audit-session-reset.js` **всегда генерирует новый** `session_key` при каждом старте (не переиспользует значение из предыдущего state). Это исключает ложную идемпотентность при возобновлённой сессии (старый ключ → ошибочный «уже обработано»). Двойной T-02 в одной сессии безопасен: проверка последней строки `history.jsonl` по `session_key` + атомарная запись (G2); `/token-rules-apply` дополнительно отвергает delta с дублирующимися `rule.id`.

## 4. Алгоритм аудитора в режиме T-02

```
1. READ      session-state.json (полностью), agent_outputs[ccip-session-optimizer],
             rules/*.yaml, metrics/rolling-30.json, metrics/history.jsonl (хвост),
             trigger-state.json (session_key + pending_audit).
2. METRICS   полносессионные: T_total = Σ observations[].context_tokens,
             T_useful, IDC, R_dup, E_resp, ΔT_session vs rolling-30.
3. IDEMPOTENCY  если последняя строка history.jsonl имеет тот же session_key →
             НЕ мутировать (history/rolling/rules); только перегенерировать отчёт.
4. APPEND    дописать строку в history.jsonl (атомарно, append-only).
5. ROLLING   пересчитать rolling-30 из последних 30 строк.
6. LIFECYCLE проход по правилам (раздел 5) — единственная мутация поведения.
7. EMIT      report + evidence + ## State Update.
```

## 5. Rule lifecycle mutation — guardrails (ядро качества)

Это самая опасная часть. Инварианты — обязательны, проверяются CI:

| # | Инвариант | Как обеспечивается |
|---|---|---|
| G1 | `baseline.yaml` **никогда** не пишется | запрет в коде + SHA-256 lockfile (`baseline.lock`, генерируется однократно при bootstrap, не обновляется авто); `audit-rules.js` сверяет хеш файла с lock-значением — **работает без `git`** (detached/shallow/CI-safe) |
| G2 | Все записи атомарны | tmp + fsync + rename (как `post-agent-hook.js`) |
| G3 | Перед записью — структурная валидация; при провале abort, старое сохраняется | `audit-rules.js` (inline-проверки: ID-формат `^R-\d{3}$`, наличие `status`, membership в baseline). **`rules-delta.yaml` валидируется семантически в `token-rules-apply.js` перед применением** (дубли `rule.id`, отсутствие правила в baseline); провал → abort + non-zero exit. Реализовано без отдельного JSON-Schema файла — см. примечание к §6 |
| G4 | Правило не может быть одновременно в `active` и `quarantine` | `audit-rules.js` |
| G5 | `requires_transcript_access: true` → промоушен запрещён | проверка флага перед promote |
| G6 | Quality-gate `ΔE_resp < −0.05` при `ΔT<0` → **НЕ авто-откат** (`E_resp` estimated, риск ложных срабатываний). Только предложение в `rules-delta.yaml` с `reason: estimated_quality_degradation`; применение — через `/token-rules-apply` | сравнение с предыдущей строкой history |
| G7 | Каждая мутация логируется (audit trail, обратимость) | append в `metrics/rules-changelog.jsonl` |
| G8 | Промоушен `quarantine→active` только при выполнении ВСЕХ: ≥3 сессии, ΔT≥+5%, ΔQ≥0, precision≥0.7 | явная конъюнкция, `min_confidence≥0.6` |
| G9 | Auto-deprecate: `hit_count==0` за 20 сессий ИЛИ `precision<0.4` | счётчики в active.yaml |

**Принцип обратимости:** любое изменение восстановимо из `baseline.yaml` (полный откат) либо из `rules-changelog.jsonl` (точечный). Аудитор не удаляет правила — только перемещает между `active`/`quarantine`/`deprecated`.

### 5.1 Разделение мутаций (Q1 — РЕШЕНО: propose-confirm)

| Класс | Что | Применение |
|---|---|---|
| **Авто (безопасно)** | `hit_count`, `precision`, `sessions_in_quarantine`, append `history.jsonl`, пересчёт `rolling-30` | аудитор пишет сразу (не меняет активное поведение) |
| **Propose-confirm (меняет поведение)** | promote `quarantine→active`, deprecate `active→deprecated` | аудитор пишет **предложение** в `metrics/rules-delta.yaml` + причину/метрики; **НЕ** применяет к `active.yaml`/`quarantine.yaml` |

Применение `rules-delta` — отдельный явный шаг: команда `/token-rules-apply` (или ручное подтверждение оркестратором), которая семантически валидирует delta (дубли `rule.id`, существование в baseline), применяет атомарно, логирует в `rules-changelog.jsonl` и очищает delta. Так система **предлагает** изменения поведения, но никогда не меняет себя без человека. G8/G9 остаются критериями **попадания в delta**, а не авто-применения.

## 6. Новая quality-инфраструктура (CI ловит порчу от self-learning)

| Артефакт | Роль |
|---|---|
| `tools/audit/audit-rules.js` | Валидатор rule-файлов: G1 (baseline-immutability через `baseline.lock`), ID-формат, наличие `status`, G4 (disjoint working sets), membership + completeness относительно baseline |
| `tools/audit/token-rules-apply.js` | Семантическая валидация `rules-delta.yaml` при применении (G3): дубли `rule.id`, существование в baseline |
| wiring в `tools/audit/audit-suite.js` | Порча rule-файлов от мутаций ловится в CI / pre-commit |
| `tools/audit/__tests__/audit-rules.test.js` | Тесты валидатора |

> **Примечание (реализация vs дизайн):** изначально планировался отдельный
> `docs/schemas/rules.schema.json` как JSON-Schema для rule-файлов. При реализации
> Фазы B схема **не создавалась** — её роль покрыта детерминированными inline-проверками
> в `audit-rules.js` (структура + G1/G4/membership/completeness) и семантической
> валидацией delta в `token-rules-apply.js` (G3). Отдельный JSON-Schema поверх
> bespoke-валидатора был бы избыточен и создал бы второй источник истины. Цель G3
> («валидация перед записью, abort при провале») достигнута без него.

Без этого слоя self-mutation — чёрный ящик. С ним каждая мутация проверяема детерминированно (тот же принцип, что у `session-state.js`).

## 7. Механизм запуска (defense in depth, 3 слоя)

1. **Детектор фразы** — `UserPromptSubmit`-hook распознаёт «Завершаем сессию» / «Закрываем сессию» / «End session» / `/session-end` и инъецирует детерминированный чеклист: «(1) ccip-session-optimizer → (2) token-efficiency-auditor (T-02)». Не запускает агентов (C1) — только напоминает.
2. **Конвенция** — фиксируется в `CLAUDE.md` (таблица Auxiliary Agents уже содержит обоих) и в `.claude/runtime/state-protocol.md`: порядок `optimizer → auditor`.
3. **Контракт аудитора** — режим T-02 описан в теле агента (раздел 4).

> **Q3 — РЕШЕНО:** детектор фразы реализуется **внутри** `audit-turn-hook.js` (он уже на `UserPromptSubmit`, читает stdin-промпт в `raw`, пишет `trigger-state.json`). Отдельный hook создал бы два конкурирующих `UserPromptSubmit`-писателя одного файла → race condition (оба читают старый state, второй затирает первого). Один hook — одна атомарная запись.

## 8. Edge cases (обязательная обработка)

| Сценарий | Поведение |
|---|---|
| optimizer не отработал | аудитор продолжает, в отчёте помечает отсутствие artifact |
| пустая сессия (нет `agent_outputs`) | минимальный отчёт; строку history НЕ писать (шум) |
| первая сессия (нет `rolling-30`) | `ΔT_session = null`; промоушены невозможны (нет baseline тренда) |
| T-02 сработал дважды | идемпотентность по `session_key` (раздел 4, шаг 3) |
| `session_key` отсутствует | fallback `started_at` → `unknown-<date>`; не падать |
| `history.jsonl` повреждён | пропустить парсинг битых строк (NDJSON line-by-line), не abort'ить |
| < 30 сессий в истории | rolling считается по доступным; не блокирует |

## 9. План верификации (quality-first)

- **Unit-тесты:** идемпотентность по `session_key`; append history; пересчёт rolling-30; критерии promote (все 4 условия по отдельности и вместе); deprecate (оба условия); G1 baseline-immutability; G3 abort при невалидной мутации; G5 запрет promote для transcript-rules.
- **`audit-rules.js`** в suite + собственные тесты.
- **Dry-run** на синтетической `history.jsonl` (3 сессии) → проверить корректный promote одного quarantine-правила и deprecate одного «мёртвого».
- **Регрессия:** существующие 17 + 27 тестов хуков остаются зелёными.

## 10. Фазы (по возрастанию риска)

- **Фаза A — data backbone (низкий риск):** `session_key` штамп в `SessionStart` + append `history.jsonl` + пересчёт `rolling-30` + идемпотентность. Метрики накапливаются, поведение правил НЕ трогается.
- **Фаза B — self-learning (высокий риск, максимум проверки):** `audit-rules.js` (inline-валидация rule-файлов) + lifecycle-мутации с G1–G9 + `rules-changelog.jsonl` + тесты. (Отдельный `rules.schema.json` не создавался — см. §6.)
- **Фаза C — trigger ergonomics:** детектор фразы (`UserPromptSubmit`) + правки `state-protocol.md`.

> Рекомендация по качеству: A и B мержить **раздельно**. A безопасна и сразу полезна (история/тренд). B — только после полного тест-покрытия и `audit-rules.js` в CI, т.к. меняет поведение системы между сессиями.

## 11. Открытые вопросы для ревью

1. **Q1 — авто-мутация vs propose-confirm → РЕШЕНО: propose-confirm.** Счётчики/метрики — авто; promote/deprecate — в `rules-delta.yaml`, применяются только командой `/token-rules-apply` (раздел 5.1). Система не меняет своё поведение без человека.
2. **Q2 — формат `session_key` → РЕШЕНО: timestamp+hex** (`2026-05-23T14:02:11Z-a3f9`). Читаемость при отладке `history.jsonl` важнее; 4 hex (65536) при ≤1 сессии/сек — коллизий нет.
3. **Q3 — детектор фразы → РЕШЕНО: расширить `audit-turn-hook.js`** (не отдельный hook — иначе race на `trigger-state.json`).
4. **Q4 — пустые/тривиальные сессии → РЕШЕНО: не писать.** Нет `agent_outputs` ИЛИ `T_total < 500` токенов → строку history не писать; инкремент `sessions_skipped` в `rolling-30.json`. Иначе нулевые строки занижают baseline и делают порог promote ложно достижимым.
