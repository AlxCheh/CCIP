# M-08 Design Pass — Дизайн-спека

**Date:** 2026-06-02
**Status:** Approved
**Module:** M-08 Web App — Design Pass
**Scope:** DashboardPage · ObjectDetailPage · PeriodPage (GP Form — ADR отдельно: `docs/superpowers/specs/2026-06-01-gp-form-design.md`)

---

## 1. Дизайн-система «Ledger»

**Направление:** Кремовый с тёмным ядром × Индустриальный. Физическая учётная книга — кремовая бумага, тёмные чернила, терракотовые акценты, grain-текстура.

### 1.1 Токены (CSS custom properties)

```css
:root {
  --cream:   #f5ede0;   /* фон страницы и основных блоков */
  --dark:    #1e1208;   /* сайдбар, topbar, кнопки, линейки */
  --dark2:   #2e1a0a;   /* hover-состояния тёмных элементов */
  --accent:  #d4824a;   /* терракота — активный nav, кнопки, бары */
  --brown:   #7a5030;   /* вторичный текст, подстроки */
  --brown2:  #9a6040;   /* метки, placeholder */
  --text:    #3d1f08;   /* основной текст */
  --rule:    #d8c4a8;   /* разделители, фон баров */
  --err:     #c84a2a;   /* ошибки, разрыв, расхождение */
  --errBg:   #fde8e4;   /* светлый фон ошибок */
  --green:   #4a8a50;   /* успех, «в плане», «подтверждено» */
}
```

### 1.2 Типографика

| Роль | Шрифт | Размер | Weight | Применение |
|------|-------|--------|--------|------------|
| Display | EB Garamond | 38px | 500 | Заголовок h1 страниц |
| Heading | EB Garamond | 32px | 500 | Заголовок объекта/периода |
| Body serif | EB Garamond | 18px | 400 | Названия в таблицах |
| Body serif sm | EB Garamond | 17px | 400 | Наименования позиций BoQ |
| Body serif xs | EB Garamond | 15px | 400 | Ячейки участников |
| Label mono | Space Mono | 8px | 700 | Uppercase-метки, заголовки колонок |
| Label mono md | Space Mono | 9px | 400/700 | Подстроки, заголовки секций |
| Label mono lg | Space Mono | 10px | 400 | Hint-тексты, ед. изм. |
| Data mono | Space Mono | 11px | 400 | % прогресса, мелкие числа |
| Data mono md | Space Mono | 12px | 400 | Числа в таблицах, даты |
| Data mono lg | Space Mono | 13px | 400 | SC-input в таблице периода |
| Brand | Space Mono | 15px | 700 | Логотип CCIP в сайдбаре |
| KPI | Space Mono | 30px | 700 | Цифры в KPI-полосе дашборда |

**Google Fonts import:**
```
EB Garamond: ital,wght@0,400;0,500;0,600;1,400
Space Mono: wght@400;700
```

### 1.3 Grain-текстура

SVG feTurbulence, opacity 0.05, mix-blend-mode: multiply — на `position:absolute; inset:0` поверх кремового фона.

```css
background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
```

---

## 2. App Shell

**Layout:** `display:flex` — sidebar (212px, фиксированная) + main (flex:1).

### Sidebar
- Фон: `var(--dark)`
- Логотип: `●` (9px круг, accent) + «CCIP» (Space Mono 15px bold, #f5ede0, letter-spacing 2px)
- Подпись под логотипом: «Система учёта» (Space Mono 7px, uppercase, letter-spacing 3px, brown)
- Nav-ссылки: Space Mono 11px, uppercase, letter-spacing 1.5px; активная — `border-left: 2px solid accent`, фон rgba(accent, .08), цвет accent
- Бейдж (Расхождения): accent фон, dark текст, border-radius 99px, 9px
- Профиль (внизу): имя EB Garamond 15px (#e7d6bf), роль Space Mono 8px (brown)

### Topbar
- Фон: `var(--dark)`, padding 9px 24px
- Левый текст: «Стройконтроль · Система учёта» — Space Mono 8px, uppercase, letter-spacing 3px, accent
- Правая дата: Space Mono 8px, brown

### Ссылка «назад» (все страницы кроме Dashboard)
- Вариант B: `← Название` — Space Mono 9px, bold, uppercase, letter-spacing 2px, цвет dark, border-bottom 1px solid dark

---

## 3. DashboardPage

### Hero
- Kicker: «Портфель · N объектов» — Space Mono 8px, uppercase, letter-spacing 3px, brown2
- h1 «Дашборд»: EB Garamond 38px, weight 500
- Meta (организация · время): EB Garamond 13px, italic, brown2
- Кнопка «↻ Обновить»: Space Mono 9px, uppercase, letter-spacing 2px, фон dark, цвет accent, padding 11px 18px

### KPI-полоса (4 плитки)
- Обрамление: `border-top: 2px solid dark; border-bottom: 2px solid dark`
- Разделители между плитками: `border-right: 1px solid rule`
- Метка: Space Mono 8px, uppercase, letter-spacing 2px, brown2
- Значение: Space Mono 30px, bold, tabular-nums
- Значение «с разрывом»: цвет err; «просрочка SLA»: цвет accent

### Toolbar
- Тоггл «Только с разрывом»: слева — Space Mono 10px, uppercase, letter-spacing 1px, brown
- Сортировка (select): справа — метка Space Mono 7px, uppercase, letter-spacing 2px; select Space Mono 11px, border-bottom 1px solid brown

### Таблица
- Заголовки: Space Mono 8px, uppercase, letter-spacing 2px, dark, `border-bottom: 2px solid dark`
- **Объект:** название EB Garamond 18px + подстрока Space Mono 9px (brown) «период № N · статус»
- **Статус:** Space Mono 10px, uppercase, с точкой-dot 6px
- **Готовность:** прогресс-бар 5px (accent) + Space Mono 11px %
- **Прогноз:** дата Space Mono 12px (err если просрочка) + подпись «крит. DD.MM» 9px (brown)
- **Разрыв:** пилюля Space Mono 10px — «разрыв» (accent + rgba фон) / «в плане» (green + rgba фон)
- Строки с разрывом: `box-shadow: inset 3px 0 0 var(--accent)` на первой ячейке
- Разделители строк: `border-bottom: 1px solid rule`

### Пагинация
- Кнопки Space Mono 9px, uppercase; активная: фон dark, цвет accent

### Бэкенд-зависимость
> `DashboardRow` требует расширения: добавить `periodNumber: number` и `periodStatus: string` для подстроки под названием объекта. Отдельный бэкенд-таск, вне дизайн-pass.

---

## 4. ObjectDetailPage

### Hero
- Ссылка назад: `← Дашборд`
- h1 (название объекта): EB Garamond 32px, weight 500 + статус-пилюля inline
- Статус-пилюля «Активный»: Space Mono 9px, uppercase, green border+bg
- Метаданные (класс · адрес · разрешение): Space Mono 9px, letter-spacing 1px, brown2
- Нижняя линия: `border-bottom: 2px solid dark`

### KPI-полоса (4 плитки)
- Обрамление: `border-top: 1px solid rule; border-bottom: 2px solid dark` (верх тонкий)
- **Без** вертикальных разделителей между плитками
- Метка: Space Mono 8px, uppercase, letter-spacing 2px, brown2
- **Готовность:** прогресс-бар 5px (accent) + % Space Mono 11px
- **Прогноз (взвеш.):** Space Mono 22px, bold, err
- **Прогноз (крит. путь):** Space Mono 22px, bold, err
- **Разрыв прогнозов:** пилюля R3 — Space Mono 11px, bold, uppercase; `border: 1.5px solid err; background: errBg; color: err; padding: 5px 12px` + подпись «Прогнозы расходятся» Space Mono 9px, brown2

### Секции
- Заголовок: Space Mono 9px, uppercase, letter-spacing 3px, dark, bold; `border-bottom: 2px solid dark`
- Отступ между секциями: 20px

**Текущий период:**
- Название «Период № N»: EB Garamond 18px
- Подстрока «Открыт DD.MM.YYYY»: Space Mono 9px, letter-spacing 1px, brown2
- Статус-пилюль «Генподрядчик подал данные»: Space Mono 10px, uppercase, accent border+bg
- Кнопка «Открыть →»: Space Mono 9px, uppercase, цвет accent, border 1px rgba(accent,.4), padding 8px 14px

**Активный BoQ:**
- «Версия N»: EB Garamond 18px
- «N позиций»: Space Mono 9px, brown2

**Участники (таблица):**
- Заголовки: Space Mono 8px, uppercase, letter-spacing 2px, dark, border-bottom 2px solid dark
- Ячейки: EB Garamond 15px
- Дата «С»: Space Mono 11px, tabular-nums

**История периодов (таблица):**
- Аналогично участникам
- Числа (номер, дата, BoQ): Space Mono 11px, tabular-nums
- Прогресс-бар: 5px, max-width 80px
- Дата с просрочкой: Space Mono 11px, err

---

## 5. PeriodPage

### Hero
- Ссылка назад: `← Название объекта`
- h1 «Период № N»: EB Garamond 32px, weight 500
- Подстрока «Название объекта · Открыт DD.MM.YYYY»: Space Mono 10px, letter-spacing 1px, brown2
- Нижняя линия: `border-bottom: 2px solid dark`

### Степпер (4 шага — вариант C «Табы»)
- Контейнер: `display:flex; border-bottom: 2px solid dark`
- Каждый шаг: `flex:1; padding: 12px 16px 10px`
- Номер шага: Space Mono 7px, uppercase, letter-spacing 2px
- Название шага: Space Mono 11px, bold, letter-spacing .5px
- **Пройден (done):** номер и название — brown
- **Активный (active):** номер — err; название — в рамке `border: 1.5px solid err; background: errBg; color: err; padding: 3px 8px; display: inline-block`
- **Впереди (ahead):** номер и название — rule (светло-бежевый)

### Кнопка «Закрыть период»
- Активная: Space Mono 9px, uppercase, letter-spacing 2px, фон dark, цвет accent, padding 11px 20px
- Disabled: фон rule, цвет brown2, cursor not-allowed
- Hint-текст: Space Mono 10px, letter-spacing .5px, цвет err
- Разделитель снизу: `border-bottom: 1px solid rule`

### Таблица позиций BoQ

Заголовки: Space Mono 8px, uppercase, letter-spacing 2px, dark; `border-bottom: 2px solid dark`

| Колонка | Шрифт | Размер | Цвет | Align |
|---------|-------|--------|------|-------|
| Код | Space Mono | 10px | brown2 | left |
| Наименование | EB Garamond | 17px | text | left |
| Ед. | Space Mono | 12px | brown2 | center |
| План | Space Mono | 12px | text | right |
| Объём ГП | Space Mono | 12px | text | right |
| Объём SC | Space Mono | 12px | text | right |
| Пустое (—) | Space Mono | 12px | rule | right |

**Пилюля «Расхождение»:** Space Mono 10px, uppercase, `border: 1px solid rgba(err,.4); background: errBg; color: err`
**Пилюля «Подтверждено»:** Space Mono 10px, uppercase, `border: 1px solid rgba(green,.4); background: rgba(green,.06); color: green`

**Строки с расхождением:** фон `rgba(200,74,42,.04)`

**Ввод SC:**
- Input: Space Mono 13px, width 70px, `border-bottom: 2px solid accent`, text-align right, прозрачный фон
- Кнопка «ОК»: Space Mono 8px, uppercase, фон dark, цвет accent, padding 5px 9px

---

## 6. Мокапы (reference)

Все согласованные мокапы сохранены в:
```
.superpowers/brainstorm/1226-1780422587/content/variants/
  ledger.html               — Dashboard (финальный)
  object-detail-approved.html — ObjectDetail
  period-page-approved.html   — PeriodPage
```

GP Form: `docs/superpowers/specs/2026-06-01-gp-form-design.md`

---

## 7. Бэкенд-зависимости

| Зависимость | Описание | Приоритет |
|-------------|----------|-----------|
| `DashboardRow.periodNumber` | Добавить номер текущего периода в ответ дашборда | Можно без него (показывать пустую подстроку) |
| `DashboardRow.periodStatus` | Статус текущего периода для подстроки | Аналогично |

---

## 8. CSS-архитектура

**Подход:** CSS custom properties (`tokens.css`) + CSS Modules (`*.module.css`) для каждой страницы.

```
apps/web/src/
  styles/
    tokens.css          ← все --var переменные из §1.1
  pages/
    DashboardPage.module.css
    ObjectDetailPage.module.css
    PeriodPage.module.css
  components/
    Sidebar.module.css
    ProgressBar.module.css
    StatusPill.module.css
    StepperTabs.module.css
```

**Шрифты** подключаются в `index.html` через Google Fonts (preconnect + stylesheet).
