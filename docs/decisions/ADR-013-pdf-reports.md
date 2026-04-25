# ADR-013 — PDF-генерация отчётов: Puppeteer + S3 + async BullMQ

**Статус:** Принято  
**Дата:** 2026-04-25  
**Закрытый пробел §10.4:** PDF-генерация отчётов

---

## Решение (одна строка)

PDF генерируется через Puppeteer (headless Chromium); HTML-шаблоны рендерит NestJS + Handlebars; готовый файл сохраняется в S3; генерация асинхронна через BullMQ job — `closePeriod` не блокируется.

---

## Контекст

Два типа документов нужны в пилоте:
1. **Акт периода** — итоговые объёмы по позициям BoQ, расхождения, accepted_volume, подписанты; передаётся Заказчику как доказательный документ.
2. **Сводный отчёт объекта** — % готовности по снимкам, WMA-темп, прогнозы, флаги; читает Director на совещании.

Генерация не входит в критический путь MVP (§10.4 arch: «зарезервировано»), но нужна до production rollout.

---

## Практический кейс

SC закрывает период 7 складского центра класса А. `closePeriod()` записывает `readiness_snapshots`, делает REFRESH MV, затем ставит в BullMQ очередь `pdf-reports` job `{ type: 'period_report', periodId }`. Через ~10 секунд Puppeteer рендерит HTML-шаблон акта, загружает PDF в S3 (`reports/objects/{objectId}/periods/{periodId}/act.pdf`), обновляет `periods.report_url`. Director открывает страницу периода — видит кнопку «Скачать акт» с presigned S3 URL.

Если Puppeteer упал (OOM kill), BullMQ retry × 2 с экспоненциальным backoff (30s, 90s). После 3 неудач — `periods.report_generation_failed = TRUE`, уведомление admin.

---

## Контракт реализации

### Архитектура потока

```
closePeriod() транзакция
    └─► [после commit] BullMQ.add('pdf-reports', { type, id }, { attempts: 3, backoff: exponential })

PdfWorker (ROLE=worker, тот же pod что и SLA-scheduler):
    ├─► PdfService.renderHtml(templateName, data)   — Handlebars + данные из БД
    ├─► Puppeteer.launch() → page.setContent(html) → page.pdf({ format: 'A4', ... })
    ├─► S3Service.upload(buffer, key)
    └─► prisma.periods.update({ report_url, report_generated_at })
         OR prisma.objects.update({ summary_report_url })
```

### Шаблоны

| Шаблон | Путь | Данные |
|--------|------|--------|
| Акт периода | `src/pdf/templates/period-act.hbs` | `period`, `period_facts[]`, `discrepancies[]`, `boq_items[]`, `object_participants[]` |
| Сводный отчёт | `src/pdf/templates/object-summary.hbs` | `object`, `readiness_snapshots[]`, последний `mv_object_current_status` |

### Ресурсные ограничения (K8s)

```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "250m"
  limits:
    memory: "512Mi"   # Puppeteer/Chromium — 200–400 MB в пике
    cpu: "1000m"
```

Puppeteer запускается с `--no-sandbox --disable-dev-shm-usage` в K8s-контейнере (нет user namespace). Один инстанс Puppeteer переиспользуется между job-ами (`browser.newPage()` на каждый job, `browser` живёт весь lifecycle worker-а). Timeout: 30 секунд на страницу (`page.setDefaultTimeout(30_000)`).

### API endpoints

```
GET /objects/:id/periods/:periodId/report
    → 302 presigned S3 URL (TTL 15 min)
    → 404 если report_url IS NULL + { generating: true } если job в очереди
    → 500 если report_generation_failed = TRUE

GET /objects/:id/summary-report
    → аналогично для объектного отчёта
```

### Хранение в S3

```
reports/
  objects/{objectId}/
    periods/{periodId}/
      act_{periodNumber}_{generatedAt}.pdf
    summary_{generatedAt}.pdf
```

Retention: 3 года (S3 lifecycle policy). Versioning: включено — перегенерация создаёт новую версию, старая не удаляется.

---

## Патчи схемы БД

| Патч | Содержание |
|------|-----------|
| **P-30** | `periods.report_url TEXT`, `periods.report_generated_at TIMESTAMPTZ`, `periods.report_generation_failed BOOLEAN DEFAULT FALSE` |
| **P-31** | `objects.summary_report_url TEXT`, `objects.summary_report_generated_at TIMESTAMPTZ` |

---

## Отклонённые альтернативы

| Альтернатива | Причина отклонения |
|-------------|-------------------|
| WeasyPrint (Python) | Дополнительный Python-контейнер; IPC через HTTP; команда не работает с Python; CSS-поддержка хуже Chromium |
| @react-pdf/renderer | Нет HTML/CSS — ручная вёрстка таблиц; сложные условные стили; ограниченный набор компонентов |
| Synchronous (в HTTP-запросе) | Блокирует closePeriod на 5–15 сек; недопустимо для UX; риск timeout |
| Отдельный PDF-микросервис | Избыточно для монолита; можно добавить позже при необходимости горизонтального масштабирования |
