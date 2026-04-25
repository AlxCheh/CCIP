# ADR-013 — PDF-генерация отчётов: Puppeteer + S3 + async BullMQ

**Статус:** Принято
**Закрытый риск/пробел:** §10.4

## Решение
PDF генерируется через Puppeteer (headless Chromium) + Handlebars-шаблоны; файл в S3; генерация async через BullMQ — `closePeriod` не блокируется.

## Контекст
Два типа документов: Акт периода (объёмы, расхождения, подписанты) и Сводный отчёт объекта (% готовности, прогнозы). Синхронная генерация в HTTP-запросе блокирует `closePeriod` на 5–15 сек — недопустимо.

## Практический кейс
SC закрывает период 7. `closePeriod` фиксирует snapshot, REFRESH MV, затем `BullMQ.add('pdf-reports', {type:'period_report', periodId})`. PdfWorker (~10 сек) рендерит Handlebars-шаблон, загружает PDF в S3, обновляет `periods.report_url`. Director открывает страницу — кнопка «Скачать акт» (presigned URL, TTL 15 мин). При OOM kill Puppeteer: retry ×2 (backoff 30 с, 90 с). После 3 неудач: `report_generation_failed=TRUE`, уведомление Admin.

## Контракт реализации

**Шаблоны:** `src/pdf/templates/period-act.hbs` (`period`, `period_facts[]`, `discrepancies[]`, `boq_items[]`, `object_participants[]`); `src/pdf/templates/object-summary.hbs` (`object`, `readiness_snapshots[]`, `mv_object_current_status`).

**PdfWorker flow:** `PdfService.renderHtml(template, data)` → `Puppeteer.launch()` → `page.setContent(html)` → `page.pdf({format:'A4'})` → `S3Service.upload(buffer, key)` → `prisma.periods.update({report_url, report_generated_at})`.

**Puppeteer:** `--no-sandbox --disable-dev-shm-usage` в K8s. Один инстанс browser на lifecycle воркера, `browser.newPage()` на каждый job. `page.setDefaultTimeout(30_000)`.

**K8s resources:** requests `memory:256Mi cpu:250m`; limits `memory:512Mi cpu:1000m`.

**S3 path:** `reports/objects/{objectId}/periods/{periodId}/act_{periodNumber}_{generatedAt}.pdf`; `reports/objects/{objectId}/summary_{generatedAt}.pdf`. Retention: 3 года (S3 lifecycle). Versioning включено.

**API:** `GET /objects/:id/periods/:periodId/report` → 302 presigned URL (TTL 15 мин) | 404+`{generating:true}` | 500 если `report_generation_failed=TRUE`.

**BullMQ job:** `attempts:3`, `backoff:{type:'exponential', delay:30_000}`, `removeOnComplete:true`, `removeOnFail:false`.

## Патчи схемы БД
**P-30** — `periods.report_url TEXT`, `periods.report_generated_at TIMESTAMPTZ`, `periods.report_generation_failed BOOLEAN DEFAULT FALSE`
**P-31** — `objects.summary_report_url TEXT`, `objects.summary_report_generated_at TIMESTAMPTZ`

## Отклонённые альтернативы
| Альтернатива | Причина |
|---|---|
| WeasyPrint (Python) | Дополнительный Python-контейнер; команда без Python-опыта |
| @react-pdf/renderer | Нет HTML/CSS; ручная вёрстка таблиц; ограниченные стили |
| Synchronous в HTTP | Блокирует closePeriod на 5–15 сек; риск timeout |
| Отдельный PDF-микросервис | Избыточно для монолита на данном этапе |
