---
description: Применить предложенные lifecycle-изменения правил (propose-confirm, ADR-016 Phase B)
allowed-tools: Bash, Read
---

Шаг **confirm** в propose-confirm цикле token-efficiency-auditor (ADR-016, см. `docs/proposals/token-auditor-t02-design.md`).

Применяет ранее предложенные `token-rules-propose.js` изменения из `.claude/audit/rules/rules-delta.json` к активному набору правил.

## Порядок

1. **Показать предложение.** Прочитай `.claude/audit/rules/rules-delta.json` (если файла нет — сообщи «нет предложений» и остановись). Выведи пользователю список `promote`/`deprecate` с причинами и метриками. Промоушены помечены `q_estimated:true` — ΔQ оценочный (E_resp estimated), это требует человеческого суждения.

2. **Сухой прогон.** Запусти `node tools/audit/token-rules-apply.js --dry-run` и покажи, что именно изменится.

3. **Применить.** Запусти `node tools/audit/token-rules-apply.js`. Скрипт:
   - семантически валидирует delta (id ∈ quarantine/active, не transcript-gated);
   - атомарно перемещает правила между `active`/`quarantine`/`deprecated`;
   - **пост-валидирует** через `audit-rules.js` и **откатывается** при провале (baseline неприкосновенен);
   - логирует в `.claude/audit/metrics/rules-changelog.jsonl`;
   - удаляет `rules-delta.json`.

4. **Отчёт.** Сообщи итог (`applied` / `no-delta` / ошибка), какие правила перемещены, и что записано в changelog. При откате — приведи причину провала audit-rules.

## Инварианты (напомнить)

- Это единственный путь, меняющий активное поведение правил (counters обновляются отдельно, автоматически).
- `baseline.yaml` не трогается ни при каких условиях (G1).
- Любое применённое изменение обратимо через `rules-changelog.jsonl` и полный откат к `baseline.yaml`.
