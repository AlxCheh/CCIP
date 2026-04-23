# АЛГОРИТМ УПРАВЛЕНИЯ ОБЪЕКТОМ КАПИТАЛЬНОГО СТРОИТЕЛЬСТВА

*Формализованный алгоритм с тестовыми сценариями*

*На основе Концепции управления ОКС v1.4 · 2026*

---

> **Изменения в версии алгоритма 1.3**
> Блок A: расширен Уровень 0 — добавлены все параметры из Концепции v1.4.
> Блок B: переработан по методике 0-отчёта (иерархия источников, перекрёстная верификация, таймер, исправление после запуска).
> Блок C: формальная классификация расхождений, плановая пауза, диалог дубликатов.
> Блок D: SLA deadlock (Сценарий A и B), привязка фото к Типу 2.
> Блок E: взвешенный темп с decay_factor, обработка нулей и выбросов, два прогноза, флаг разрыва, обработка >100%.
> Новые блоки: F (UpdateBaseline), G (Версионирование L2), H (Смена ГП), I (Офлайн-режим).
> Таблица тестов: новые тесты по всем блокам.

---

## Содержание

- [Часть 1. Структурная карта алгоритма](#часть-1-структурная-карта-алгоритма)
- [Часть 2. Полный псевдокод](#часть-2-полный-псевдокод)
  - [Блок A. Инициализация системы](#блок-a-инициализация-системы-l0l2-однократно)
  - [Блок B. 0-отчёт](#блок-b-0-отчёт-l3-a-однократно)
  - [Блок C. Цикл периода](#блок-c-цикл-периода-l3-b-повторяется-каждый-период)
  - [Блок D. Урегулирование расхождений и SLA](#блок-d-урегулирование-расхождений-и-sla)
  - [Блок E. Расчёт % готовности и аналитика](#блок-e-расчёт--готовности-и-аналитика)
  - [Блок F. Обновление плановых объёмов (UpdateBaseline)](#блок-f-обновление-плановых-объёмов-updatebaseline)
  - [Блок G. Версионирование проектной базы (L2)](#блок-g-версионирование-проектной-базы-l2)
  - [Блок H. Смена Генерального подрядчика](#блок-h-смена-генерального-подрядчика)
  - [Блок I. Офлайн-режим и синхронизация](#блок-i-офлайн-режим-и-синхронизация)
- [Часть 3. Входные и выходные параметры](#часть-3-входные-и-выходные-параметры)
- [Часть 4. Таблица тестирования](#часть-4-таблица-тестирования)
  - [4.1 Блок A — Инициализация](#41-блок-a--инициализация)
  - [4.2 Блок B — 0-отчёт](#42-блок-b--0-отчёт)
  - [4.3 Блок C — Цикл периода](#43-блок-c--цикл-периода)
  - [4.4 Блок D — Расхождения и SLA](#44-блок-d--расхождения-и-sla)
  - [4.5 Блок E — Расчёт % готовности и прогноз](#45-блок-e--расчёт--готовности-и-прогноз)
  - [4.6 Блок F — UpdateBaseline](#46-блок-f--updatebaseline)
  - [4.7 Блок G — Версионирование L2](#47-блок-g--версионирование-l2)
  - [4.8 Блок H — Смена ГП](#48-блок-h--смена-гп)
  - [4.9 Блок I — Офлайн-синхронизация](#49-блок-i--офлайн-синхронизация)
- [Часть 5. Механизм обратной связи и корректировки](#часть-5-механизм-обратной-связи-и-корректировки)
- [Часть 6. Мини-кейс: сквозной пример](#часть-6-мини-кейс-сквозной-пример)

---

## Часть 1. Структурная карта алгоритма

| Уровень | Блок | Функции | Триггер |
|---------|------|---------|---------|
| L0 | Конфигурация системы | Все настраиваемые параметры системы | Однократно при запуске |
| L1 | Паспорт объекта | Идентификация, участники, технические параметры | Однократно |
| L2 | Проектная база | ССР, РДС, Calendar plan, ведомость объёмов. Версионируется. | При изменении РД |
| L3-A | 0-отчёт | Фиксация начального факта на дату подключения | Однократно |
| L3-B | Цикл периода | ГП → Верификация → Ввод → Закрытие периода | Каждый период |
| L3-C | Расхождения | Тип 1/2/3, журнал, флаги, SLA, эскалация | При расхождении |
| L3-D | Аналитика | % готовности, два прогноза, флаги разрыва, отчёты | После закрытия периода |
| L3-E | UpdateBaseline | Изменение плановых объёмов, двухшаговая процедура | По запросу |
| L3-F | Версионирование L2 | Создание версии BoQ при любом изменении | При изменении L2 |
| L3-G | Смена ГП | Процедура перехода ответственности | По запросу |

---

## Часть 2. Полный псевдокод

---

### Блок A. Инициализация системы (L0–L2, однократно)

```pseudo
FUNCTION InitSystem():
  // A1. Конфигурация системы (L0) — все параметры задаются администратором
  SET period_length              ← admin_input
  SET N_flag_threshold           ← admin_input   // дефолт = 3
  SET M_flag_window              ← admin_input   // дефолт = 5
  SET weight_threshold           ← admin_input   // дефолт = 0.10
  SET forecast_gap_alert         ← admin_input   // дефолт = 2 периода
  SET tolerance_threshold        ← admin_input   // дефолт = 5%
  SET overrun_warning_limit      ← admin_input   // дефолт = 20%
  SET avg_pace_periods           ← admin_input   // дефолт = 5
  SET decay_factor               ← admin_input   // дефолт = 0.9
  SET spike_threshold            ← admin_input   // дефолт = 2.0
  SET zero_report_alert_days     ← admin_input   // дефолт = 5
  SET baseline_correction_threshold ← admin_input // дефолт = 5%
  SET critical_works[]           ← admin_input   // влияет на фото и критический путь

  // A2. Паспорт объекта (L1)
  SET obj.name, obj.class, obj.area, obj.floors
  SET obj.customer, obj.GC, obj.designer
  SET obj.permit_number
  LOCK L1_fields

  // A3. Проектная база (L2)
  IMPORT BoQ[]
  IF COUNT(BoQ) > 50:
    WARN 'Превышение лимита позиций — рекомендуется агрегирование'
  END IF

  FOR EACH work IN BoQ:
    IF duplicate_name EXISTS IN BoQ:
      CALL ResolveDuplicate(work.id)   // диалог разрешения дубликатов
    END IF
    work.unit            ← BoQ.unit
    work.plan_volume     ← BoQ.volume
    work.tolerance_pct   ← admin_input  // допустимая погрешность по виду работ
    work.contract_value  ← RDC.value IF RDC exists ELSE SSR.value
    work.weight_coef     ← work.contract_value / total_contract_value
  END FOR

  ASSERT SUM(work.weight_coef) == 1.0
  IMPORT calendar_plan[]
  SET boq_version ← CreateBoQVersion('v1.0', 'Инициализация системы')
  RETURN system_ready = TRUE
END FUNCTION


FUNCTION ResolveDuplicate(work_id):
  DISPLAY both_rows(work_id)
  WAIT FOR user_choice:
    'Переименовать' → обе остаются с разными наименованиями
    'Объединить'    → объёмы суммируются, создаётся одна позиция
    'Отменить'      → импорт остановлен, возврат к редактированию BoQ
  END WAIT
  // Без выбора одного из трёх — сохранение заблокировано
END FUNCTION
```

---

### Блок B. 0-отчёт (L3-A, однократно)

> **Изменение v1.3** — Добавлена формальная методика расчёта стартового факта: иерархия источников, допустимая погрешность, перекрёстная верификация для тяжёлых позиций, таймер утверждения с циклическим уведомлением, процедура исправления после запуска.

```pseudo
FUNCTION ZeroReport(connection_date):

  // B1. Ввод стартового факта по иерархии источников
  FOR EACH work IN BoQ:
    // Иерархия источников (приоритет по убыванию):
    // 1. Натурный замер стройконтролем — всегда приоритет
    // 2. Исполнительная документация ГП — при невозможности замера
    // 3. КС-2 — при отсутствии исполнительной, с пометкой об источнике
    fact_0[work.id] ← site_control_input(work.id, source_type)
    SET work.zero_source ← source_type  // фиксируем источник в карточке

    // B2. Проверка допустимой погрешности
    IF source_type IN ['натурный замер', 'исполнительная документация']:
      delta_0 ← ABS(naturniy_zamer - exec_doc_volume)
      IF delta_0 / work.plan_volume > work.tolerance_pct:
        FLAG work.id 'требует дополнительной верификации'
        REQUIRE site_control.note(work.id)  // примечание обязательно
        // Флаг не блокирует 0-отчёт
      END IF
    END IF

    // B3. Перекрёстная верификация для тяжёлых позиций
    IF work.weight_coef >= weight_threshold OR work.id IN critical_works[]:
      REQUIRE naturniy_zamer_with_photo(work.id)    // 1. замер с фото
      REQUIRE exec_schema_signed_gc(work.id)         // 2. исполнительная схема с подписью ГП
      REQUIRE ks2_reference(work.id)                 // 3. КС-2 как контрольная точка
      // Директор утверждает только при наличии всех трёх
    ELSE:
      REQUIRE one_source_with_note(work.id)          // достаточно одного источника
    END IF
  END FOR

  // B4. Утверждение директором
  SET zero_report.status ← 'Ожидает утверждения'
  START TIMER zero_report_alert_days
  WHILE project_director.approved == FALSE:
    IF TIMER >= zero_report_alert_days:
      NOTIFY admin: '0-отчёт не утверждён — требуется действие директора'
      RESET TIMER  // циклическое повторение каждые zero_report_alert_days дней
    END IF
  END WHILE

  LOCK ZeroReport
  SET baseline_date ← connection_date
  RETURN zero_report_confirmed = TRUE
  // Первый период не может быть открыт без утверждённого 0-отчёта
END FUNCTION


FUNCTION CorrectZeroReport(work_id, new_value, reason):
  delta_pct ← ABS(new_value - fact_0[work_id]) / work.plan_volume * 100

  IF delta_pct <= baseline_correction_threshold:  // дефолт 5%
    // Случай A — техническая ошибка
    fact_0[work_id] ← new_value
    LOG ZeroReportCorrection(work_id, old_value, new_value, reason, admin.name)
    RECALC all_subsequent_periods(work_id)  // автоматический пересчёт
  ELSE:
    // Случай B — системная ошибка (> порога)
    REQUIRE project_director.decision(reason)  // решение директора обязательно
    fact_0[work_id] ← new_value
    LOG ZeroReportCorrection(work_id, old_value, new_value, reason, director.name)
    FOR EACH closed_period affected:
      MARK period 'пересчитано [дата], основание: [reason]'
      // История не удаляется — только маркируется
    END FOR
  END IF
END FUNCTION
```

---

### Блок C. Цикл периода (L3-B, повторяется каждый период)

> **Изменение v1.3** — Добавлена плановая пауза при открытии периода. Верификация расхождений построена на формальной бинарной классификации (§5.2 Концепции). Тип 2 — только при `work_accessible=FALSE` с обязательным основанием.

```pseudo
FUNCTION RunPeriodCycle(period_id):

  // C1. Открытие периода
  ASSERT zero_report_confirmed == TRUE  // блокировка до утверждения 0-отчёта
  site_control.OpenPeriod(period_id)
  SET period.date_from, period.date_to

  // Плановая пауза — опциональная отметка стройконтроля при открытии
  IF site_control.marks_planned_pause:
    REQUIRE pause_reason FROM [
      'Праздничные дни',
      'Ожидание поставки материалов',
      'Технологический перерыв',
      'Неблагоприятные погодные условия',
      'Ожидание разрешительной документации',
      'Иное'  // → примечание обязательно
    ]
    SET period.planned_pause ← TRUE
    // Период исключается из расчёта темпа (тип ноль А)
  END IF

  GENERATE template_xls(period_id)
  LOCK template_structure

  // C2. Получение данных от ГП
  WAIT FOR gc_submission UNTIL deadline
  IF gc_submission RECEIVED:
    SET claimed_volume[work.id] ← template.col6
    SET gc_note[work.id]        ← template.col7
  ELSE:
    LOG 'ГП не предоставил шаблон — ввод стройконтролем'
    SET claimed_volume ← NULL
  END IF

  // C3. Верификация стройконтролем
  FOR EACH work IN BoQ:
    site_control.InspectSite(work.id)
    IF work.id IN critical_works[]:
      REQUIRE photo_upload(work.id, period_id)
    END IF
    verified_volume ← site_control.measure(work.id)
    delta ← claimed_volume[work.id] - verified_volume

    // ─── КЛАССИФИКАЦИЯ РАСХОЖДЕНИЯ ──────────────────────────────────────
    // Бинарная классификация через два вопроса (§5.2 Концепции v1.4):
    //   Вопрос 1: Работы доступны для осмотра и замера?
    //   Вопрос 2: Замер возможен без разрушения конструкции?
    //
    // По умолчанию — Тип 1. Тип 2 только при явном снятии work_accessible.
    // work_accessible = FALSE → стройконтроль обязан указать основание.
    // Действие логируется с датой, именем инженера и основанием.
    // ────────────────────────────────────────────────────────────────────

    IF delta == 0:
      work.status          ← 'Подтверждено'
      work.fact_volume     += verified_volume

    ELSE IF delta != 0 AND work.work_accessible == TRUE:
      // Тип 1: Техническое расхождение
      work.status           ← 'Подтверждено'
      work.fact_volume      += verified_volume
      work.discrepancy_type ← 1
      LOG DiscrepancyType1(work.id, delta, period_id)
      NOTIFY GC(work.id, period_id, verified_volume)  // авто-уведомление

    ELSE IF delta != 0 AND work.work_accessible == FALSE:
      // Тип 2: Спорное расхождение
      ASSERT site_control.dispute_reason != NULL  // основание обязательно
      REQUIRE photo_upload(work.id, period_id)    // фото обязательно для Типа 2
      work.status           ← 'Оспорено'
      work.discrepancy_type ← 2
      LOG DiscrepancyType2(work.id, delta, period_id,
                           site_control.dispute_reason,
                           site_control.engineer_name)
      CALL ResolveDispute(work.id, period_id)  // → см. Блок D
    END IF

    // Обработка превышения планового объёма
    CALL CheckOverrun(work.id, verified_volume)
  END FOR

  // C4. Закрытие периода
  disputed_count ← COUNT(work WHERE work.status == 'Оспорено')
  IF disputed_count > 0:
    BLOCK period_close
    DISPLAY checklist(disputed_items)
    WAIT UNTIL ResolveDispute() resolves all
  END IF

  site_control.ClosePeriod(period_id)
  LOCK period_data(period_id)

  // C5. Расчёт показателей
  CALL CalcReadiness(period_id)       // → см. Блок E
  CALL DetectSystemicFlags()          // → см. Блок D
  CALL GeneratePeriodReport(period_id)
END FUNCTION


FUNCTION CheckOverrun(work_id, fact_volume):
  ratio ← fact_volume / work.plan_volume

  IF ratio <= (1 + tolerance_threshold):
    IF ratio > 1.0:
      WARN 'Превышение плана в допустимых пределах'  // предупреждение, ввод разрешён

  ELSE IF ratio <= (1 + overrun_warning_limit):
    REQUIRE site_control.note(work_id)  // примечание обязательно
    FLAG work_id ON director_dashboard 'превышение плана'
    NOTIFY site_control: 'Рекомендуется запустить UpdateBaseline'  // → см. Блок F

  ELSE:
    BLOCK work_input(work_id)  // жёсткий стоп
    NOTIFY site_control: 'Ввод заблокирован — требуется UpdateBaseline
                          или акцепт администратора с основанием'
  END IF
END FUNCTION
```

---

### Блок D. Урегулирование расхождений и SLA

> **Изменение v1.3** — Добавлена полная SLA-процедура для двух сценариев дедлока: молчание ГП (принудительное закрытие стройконтролем на день 5) и активный спор (эскалация директору, потолок день 14). Все сроки — календарные дни.

```pseudo
FUNCTION ResolveDispute(work_id, period_id):
  SET dispute_start_date ← TODAY()
  REQUEST gc_confirmation(work_id, period_id)
  ATTACH site_control_photos(work_id)       // фото обязательно для Типа 2
  ATTACH site_control.dispute_reason(work_id)

  // ── СЦЕНАРИЙ A: МОЛЧАНИЕ ГП ─────────────────────────────────────────────
  WAIT FOR gc_response UNTIL dispute_start_date + 2 days

  IF gc_response NOT RECEIVED BY day 2:
    ON day 3:
      NOTIFY project_director: 'ГП не ответил по позиции ' + work_id

    ON day 5:
      // Принудительное закрытие — стройконтроль не ожидает акцепта директора
      SET work.fact_volume += site_control.measure(work_id)
      SET work.status       ← 'Подтверждено (принудительно)'
      LOG DiscrepancyJournal.close(work_id,
            'Закрыто без ответа ГП, день 5',
            site_control.engineer_name)
      RETURN  // период разблокируется
  END IF

  // ── СЦЕНАРИЙ B: АКТИВНЫЙ СПОР ────────────────────────────────────────────
  IF gc_response RECEIVED:
    agreed_volume ← site_control.verify_docs(work_id)

    IF site_control.accepts_docs == TRUE:
      SET work.fact_volume += agreed_volume
      SET work.status       ← 'Подтверждено'
      LOG DiscrepancyJournal.close(work_id)

    ELSE:  // стройконтроль не принимает документацию ГП
      ON day 2 after gc_response:
        REQUIRE site_control.rejection_reason(work_id)  // основание отказа обязательно

      ON day 3 after gc_response:
        NOTIFY project_director:
          'Активный спор по позиции ' + work_id +
          '. Обе стороны предоставили документацию.'

      ON day 7 after gc_response:
        WAIT FOR director.decision:
          'Утвердить объём стройконтроля' → SET work.fact_volume += site_control.measure(work_id)
          'Утвердить объём ГП'            → SET work.fact_volume += agreed_volume
          'Назначить экспертизу'          → HOLD, продолжить ожидание

      ON day 14 after gc_response:  // жёсткий потолок
        IF director.decision == NULL:
          SET work.fact_volume += site_control.measure(work_id)  // консервативная оценка
          SET work.status       ← 'Спор не урегулирован'
          LOG DiscrepancyJournal.close(work_id, 'Применён объём стройконтроля, день 14')
        END IF
    END IF
  END IF

  CALL DetectSystemicFlag(work_id)
END FUNCTION


FUNCTION DetectSystemicFlag(work_id):
  // Скользящее окно шириной M_flag_window периодов.
  // Учитываются ТОЛЬКО расхождения Типа 2.
  type2_in_window ← COUNT(
    periods WHERE discrepancy_type(work_id) == 2,
    last M_flag_window
  )
  IF type2_in_window >= N_flag_threshold:
    FLAG work_id ON director_dashboard WITH message:
      type2_in_window + ' спорных расхождений за последние ' + M_flag_window + ' периодов'
      + cumulative_delta(work_id, last M_flag_window)
    LOG SystemicDiscrepancy(work_id, type2_in_window, cumulative_delta)
  END IF
END FUNCTION
```

---

### Блок E. Расчёт % готовности и аналитика

> **Изменение v1.3** — Расчёт темпа переведён на взвешенное скользящее среднее с `decay_factor`. Добавлена обработка трёх типов нулевых периодов и механизм выявления выбросов. Два прогноза: взвешенный и по критическому пути. Автофлаг разрыва. `pct_ready` ограничен 100% на уровне вида работ.

```pseudo
FUNCTION CalcReadiness(period_id):
  ASSERT period(period_id).status == 'Closed'

  // E1. % готовности по видам работ (не превышает 100%)
  FOR EACH work IN BoQ:
    work.pct_ready ← MIN(work.fact_volume / work.plan_volume * 100, 100)
    IF work.pct_ready == 0:       work.status ← 'Не начато'
    IF 0 < work.pct_ready < 100:  work.status ← 'В работе'
    IF work.pct_ready >= 100:
      work.status ← 'Готово'
      LOCK work_input_fields(work.id)
  END FOR

  // E2. Взвешенный % готовности объекта
  obj.pct_ready ← SUM(work.pct_ready * work.weight_coef FOR ALL work)

  // E3. Плановый темп
  FOR EACH work IN BoQ:
    remaining_periods ← (plan_end_date - today) / period_length
    work.planned_pace ← (work.plan_volume - work.fact_volume) / remaining_periods
  END FOR

  // E4. Взвешенный фактический темп с затуханием
  FOR EACH work IN BoQ:
    window ← last avg_pace_periods periods

    // Фильтрация нулевых периодов
    window_clean ← FILTER window:
      EXCLUDE period IF period.planned_pause == TRUE    // тип А: плановая пауза
      EXCLUDE period IF work.start_date > period.date  // тип Б: позиция не начата
      INCLUDE period IF volume == 0 AND NOT planned_pause  // тип В: внеплановый простой
        → NOTIFY director: 'Нулевой темп по позиции ' + work.id

    // Взвешенное среднее с decay_factor
    total_weight  ← 0
    pace_weighted ← 0
    FOR i FROM 0 TO COUNT(window_clean) - 1:
      w ← decay_factor ^ i
      pace_weighted += window_clean[i].volume * w
      total_weight  += w
    END FOR

    IF total_weight > 0:
      work.pace_weighted ← pace_weighted / total_weight
    ELSE:
      work.pace_weighted ← 0
    END IF

    // Обнаружение выбросов
    latest_volume ← window_clean[0].volume
    IF latest_volume > work.pace_weighted * spike_threshold:
      FLAG work.id 'аномальный темп' WITH ratio ← latest_volume / work.pace_weighted
      WAIT FOR site_control.explanation WITHIN 1 period:
        'Плановая концентрация' → вес периода понижается до 0.5
        'Ошибка ввода'          → период исключается из окна
        NULL (нет реакции)      → вес периода автоматически понижается до 0.5
      END WAIT
    END IF

    // Прогноз по виду работ
    IF work.pace_weighted > 0:
      work.forecast_end ← today + (work.plan_volume - work.fact_volume) / work.pace_weighted
    ELSE IF ALL periods in window_clean == 0:  // внеплановый простой по всему окну
      work.forecast_end ← 'простой — прогноз невозможен'
    ELSE:
      work.forecast_end ← 'неопределён'
    END IF
  END FOR

  // E5. Два прогноза на уровне объекта
  obj.forecast_weighted ← weighted_forecast(all_works)
  critical_set          ← works WHERE work.weight_coef >= weight_threshold
                                   OR work.id IN critical_works[]
  obj.forecast_critical ← MAX(work.forecast_end FOR work IN critical_set)
  obj.bottleneck_work   ← work WITH MAX(forecast_end) IN critical_set

  gap ← (obj.forecast_critical - obj.forecast_weighted) / period_length
  IF gap >= forecast_gap_alert:
    FLAG 'forecast_gap' ON director_dashboard WITH message:
      'Критический путь опережает взвешенный прогноз на ' + gap + ' периодов'
      + ' · Узкое место: ' + obj.bottleneck_work.name
  ELSE:
    CLEAR FLAG 'forecast_gap' IF active  // снимается автоматически
  END IF
END FUNCTION
```

---

### Блок F. Обновление плановых объёмов (UpdateBaseline)

> **Новый блок v1.3** — Двухшаговая процедура: стройконтроль инициирует запрос, администратор утверждает. Изменение применяется только между периодами. Исторические закрытые периоды не пересчитываются.

```pseudo
FUNCTION RequestBaselineUpdate(work_id, new_plan_volume, reason, doc):
  ASSERT reason != NULL   // основание обязательно
  ASSERT doc    != NULL   // документ-основание обязателен (версия РД / доп. соглашение)

  SET request.work_id    ← work_id
  SET request.old_volume ← work.plan_volume
  SET request.new_volume ← new_plan_volume
  SET request.reason     ← reason
  SET request.doc        ← doc
  SET request.created_by ← site_control.name
  SET request.created_at ← NOW()
  SET request.status     ← 'Ожидает утверждения'
  NOTIFY admin(request)
  // Изменения в систему НЕ вносятся до утверждения
END FUNCTION


FUNCTION ApproveBaselineUpdate(request_id):
  // Блокировка: только между периодами
  IF current_period.status == 'Open':
    BLOCK approval
    NOTIFY admin: 'Подождите закрытия периода P' + current_period.id
    RETURN approved = FALSE
  END IF

  IF admin.decision == 'Утверждено':
    old_volume           ← work.plan_volume
    work.plan_volume     ← request.new_volume
    FOR EACH w IN BoQ:
      w.weight_coef ← w.contract_value / total_contract_value
    END FOR
    ASSERT SUM(work.weight_coef) == 1.0
    work.planned_pace ← (work.plan_volume - work.fact_volume) / remaining_periods
    CALL CalcReadiness(last_closed_period_id)
    CALL CreateBoQVersion('объёмное', request.reason)  // → см. Блок G
    LOG BaselineChange(work_id, old_volume, work.plan_volume,
                       request.reason, request.doc, admin.name, NOW())
    SET work.baseline_change_flag ← TRUE
    SET work.baseline_change_date ← NOW()
    SET request.status ← 'Утверждено'
    NOTIFY site_control(request)

  ELSE IF admin.decision == 'Отклонено':
    SET request.status  ← 'Отклонено'
    SET request.comment ← admin.comment  // комментарий при отклонении обязателен
    NOTIFY site_control(request)
  END IF
END FUNCTION
```

---

### Блок G. Версионирование проектной базы (L2)

> **Новый блок v1.3** — Любое изменение L2 создаёт новую версию BoQ. Три типа изменений: объёмное, стоимостное, структурное. Инициирует стройконтроль, утверждает директор проекта. Закрытые периоды не пересчитываются.

```pseudo
FUNCTION CreateBoQVersion(change_type, reason):
  // Только между периодами
  IF current_period.status == 'Open':
    BLOCK version_creation
    NOTIFY admin: 'Подождите закрытия периода P' + current_period.id
    RETURN
  END IF

  new_version ← {
    version_id:    next_incremental_version(),  // v1.0, v1.1, v1.2...
    effective_from: next_period_id,
    effective_to:   NULL,   // NULL = текущая активная версия
    change_type:    change_type,  // 'объёмное' / 'стоимостное' / 'структурное'
    reason:         reason,
    changed_by:     site_control.name,
    approved_by:    project_director.name,
    approved_at:    NOW()
  }

  // Закрываем предыдущую версию
  previous_version.effective_to ← current_period_id
  SAVE new_version TO boq_version_journal

  // Пересчёт в зависимости от типа изменения
  IF change_type == 'стоимостное':
    FOR EACH w IN BoQ:
      w.weight_coef ← w.contract_value / total_contract_value
    END FOR
    ASSERT SUM(work.weight_coef) == 1.0
  END IF

  IF change_type == 'структурное: удаление':
    IF work.fact_volume > 0:
      BLOCK deletion
      NOTIFY admin: 'Удаление заблокировано — позиция имеет факт.
                     Варианты: Исключить из scope / Объединить (merge)'
    ELSE:
      DELETE work FROM BoQ
      RECALC all weight_coef
    END IF
  END IF

  IF change_type == 'структурное: добавление':
    // История новой позиции начинается с момента добавления
    // Нулевых исторических периодов нет
    work.start_period ← next_period_id
  END IF

  // Закрытые периоды не пересчитываются
  // Исключение: техническая ошибка инициализации — только по решению директора
  NOTIFY director: 'Проектная база обновлена. Версия: ' + new_version.version_id
END FUNCTION
```

---

### Блок H. Смена Генерального подрядчика

> **Новый блок v1.3** — Смена ГП выполняется только между периодами при нулевом количестве позиций в статусе «Оспорено». История и журнал расхождений не переназначаются.

```pseudo
FUNCTION ChangeGeneralContractor(new_gc_name, change_date):
  // Проверка условий
  IF current_period.status == 'Open':
    BLOCK gc_change
    NOTIFY admin: 'Смена ГП заблокирована — закройте период P' + current_period.id
    RETURN
  END IF

  disputed_count ← COUNT(work WHERE work.status == 'Оспорено')
  IF disputed_count > 0:
    BLOCK gc_change
    NOTIFY admin: 'Смена ГП заблокирована — урегулируйте ' + disputed_count + ' расхождений'
    RETURN
  END IF

  // Выполнение смены
  old_gc_name ← obj.GC
  obj.GC      ← new_gc_name
  LOG GCChange(old_gc_name, new_gc_name, change_date, admin.name)

  // Переназначение уведомлений
  SET notification_recipient ← new_gc_name  // уведомления Типа 1
  // Шаблон следующего периода формируется на имя нового ГП
  // История не переназначается
  // Журнал расхождений, закрытые периоды — без изменений

  NOTIFY all_parties: 'ГП изменён с ' + old_gc_name + ' на ' + new_gc_name +
                      ' с ' + change_date
END FUNCTION
```

---

### Блок I. Офлайн-режим и синхронизация

> **Новый блок v1.3** — Стройконтроль работает локально на мобильном устройстве. Все действия записываются в локальную очередь с временными метками. Закрытие периода — только онлайн. Last-write-wins не применяется.

```pseudo
FUNCTION SyncOfflineData(device_queue):
  FOR EACH action IN device_queue (ordered by timestamp):

    // Сценарий 1: период открыт
    IF target_period.status == 'Open':
      APPLY action WITH timestamp ← action.offline_timestamp
      // Временная метка — дата офлайн-ввода, не дата синхронизации

    // Сценарий 2: период закрыт пока устройство было офлайн
    ELSE IF target_period.status == 'Closed':
      BLOCK sync_for_this_period
      NOTIFY admin:
        'Офлайн-данные за период P' + target_period.id +
        ' не синхронизированы — период уже закрыт'
      WAIT FOR admin.decision:
        'Принять'   → открыть период, применить данные
        'Отклонить' → данные не вносятся, причина фиксируется

    // Сценарий 3: конфликт — другой пользователь уже внёс данные
    ELSE IF conflict_exists(action.work_id, target_period.id):
      DISPLAY conflict_resolution_ui:
        version_A: { value: action.value, date: action.timestamp,
                     engineer: action.engineer_name }
        version_B: { value: server_value, date: server_timestamp,
                     engineer: server_engineer_name }
      REQUIRE site_control.choice WITH mandatory_note
      // Last-write-wins не применяется — решение всегда за человеком
    END IF
  END FOR

  // Ограничения офлайн-режима:
  // Закрытие периода        — только онлайн
  // Запрос к ГП (Тип 2)     — уходит только после синхронизации
  // Фото                    — сохраняются локально, загружаются при синхронизации
END FUNCTION
```

---

## Часть 3. Входные и выходные параметры

| Блок | Входные параметры | Выходные параметры | Критерий корректности |
|------|-------------------|--------------------|-----------------------|
| A. Инициализация | Конфиг L0 (все параметры), Паспорт L1, ССР/РДЦ, ВОР, ПНР | `system_ready=TRUE`, BoQ с весами, baseline, `boq_version v1.0` | `SUM(weight_coef)==1.0`, `COUNT(BoQ)≤50` |
| B. 0-отчёт | Фактические объёмы по иерархии источников | `fact_0[work.id]`, `baseline_date`, источник зафиксирован | Утверждён директором. Тяжёлые позиции — три документа. |
| C1. Открытие периода | `period_id`, признак плановой паузы (опционально) | `period.open=TRUE`, шаблон XLS, пауза зафиксирована | Шаблон сформирован. Плановая пауза имеет основание. |
| C2. Получение от ГП | Заполненный шаблон XLS | `claimed_volume[work.id]` | Только кол.6-7 отличаются от шаблона |
| C3. Верификация | `claimed_volume`, осмотр, фото, `work_accessible` | `verified_volume`, `delta`, `work.status`, `discrepancy_type ∈ {1,2}` | Нет позиций без статуса. Тип 2 — только при `work_accessible=FALSE` с `dispute_reason`. |
| C4. Закрытие | Все позиции верифицированы, 0 «Оспорено» | `period.closed=TRUE` | `disputed_count==0` |
| D. Расхождение Т1 | `delta!=0`, `work_accessible=TRUE` | `work.status='Подтверждено'`, уведомление ГП, `discrepancy_type=1` | Уведомление отправлено, запись в журнале |
| D. Расхождение Т2 | `delta!=0`, `work_accessible=FALSE`, `dispute_reason`, фото | `work.status='Оспорено'→'Подтверждено'` | Решено до закрытия периода. SLA соблюдён. |
| D. Расхождение Т3 | ≥ N расхождений Типа 2 за последние M периодов | Флаг на дашборде: `'N спорных за M периодов'` + дельта | Флаг активен до ручного снятия директором |
| E. Аналитика | Закрытый период, `fact_volume`, `weight_coef`, `decay_factor` | `pct_ready≤100%`, `forecast_weighted`, `forecast_critical`, `gap`, флаг разрыва | `forecast_critical ≥ forecast_weighted`. Флаг разрыва снимается автоматически. |
| F. UpdateBaseline | Запрос стройконтроля: `work_id`, новый объём, основание, документ | Обновлённый `plan_volume`, пересчёт весов, аудит-лог, версия BoQ | `SUM(weight_coef)==1.0`. Только между периодами. |
| G. Версионирование L2 | Тип изменения, основание, инициатор, директор | Новая версия BoQ в журнале, пересчёт зависимых параметров | Закрытые периоды не пересчитаны. История сохранена. |
| H. Смена ГП | Новое наименование ГП, дата перехода | `obj.GC` обновлён, аудит-лог, новый получатель уведомлений | 0 «Оспорено» перед сменой. Период закрыт. |
| I. Офлайн-синхронизация | Локальная очередь действий с временными метками | Данные применены или конфликт разрешён | Last-write-wins не применён. Закрытые периоды не перезаписаны. |

---

## Часть 4. Таблица тестирования

### 4.1 Блок A — Инициализация

| Тест-ID | Шаг | Входные данные | Ожидаемый результат | Критерий «пройдено» |
|---------|-----|----------------|---------------------|----------------------|
| A-01 | Сумма весовых коэф. | BoQ = 10 позиций, сумма `contract_value` = 100 | `SUM(weight_coef) = 1.000` | Отклонение < 0.001 |
| A-02 | Отсутствие РДЦ | РДЦ не загружен, ССР есть | `weight_coef` рассчитан от ССР | Предупреждение `'временно от ССР'` |
| A-03 | Дублирование видов работ | В ВОР два одинаковых наименования | Система показывает обе строки, предлагает три варианта | Сохранение заблокировано без выбора варианта |
| A-04 | Превышение 50 позиций | BoQ = 55 позиций | Предупреждение о превышении лимита | Предупреждение выведено, ввод не заблокирован |
| A-05 | Заполнены все поля L1 | Все поля паспорта заполнены | L1 залочен | Попытка редактирования — ошибка доступа |

### 4.2 Блок B — 0-отчёт

| Тест-ID | Шаг | Входные данные | Ожидаемый результат | Критерий «пройдено» |
|---------|-----|----------------|---------------------|----------------------|
| B-01 | Иерархия источников | Натурный замер невозможен, есть исполнительная документация | Система принимает исполнительную как источник с пометкой | Источник зафиксирован в карточке |
| B-02 | Погрешность превышена | Замер = 950, документация = 1100, `tolerance_pct` = 5%, plan = 1000 | Флаг `'требует верификации'`, примечание обязательно | Флаг вставлен, 0-отчёт не заблокирован |
| B-03 | Перекрёстная верификация | Позиция `weight_coef=0.15`, один из трёх документов отсутствует | Утверждение директором заблокировано | Директор не может утвердить без всех трёх документов |
| B-04 | Таймер утверждения | 0-отчёт заполнен, директор не утвердил за 5 дней | Авто-уведомление администратору | Уведомление отправлено на день 5, повторяется циклически |
| B-05 | Блокировка первого периода | 0-отчёт не утверждён | Открытие первого периода заблокировано | `period.open = FALSE` до утверждения |
| B-06 | Исправление — случай A | Правка факта: 840 → 870 м³, plan = 1200 (изменение 2.5%) | Администратор вносит правку, последующие периоды пересчитаны | Аудит-лог записан, пересчёт выполнен |
| B-07 | Исправление — случай B | Правка факта: 840 → 1050 м³, plan = 1200 (изменение 17.5%) | Требуется решение директора | Без решения директора правка заблокирована. Закрытые периоды маркированы. |

### 4.3 Блок C — Цикл периода

| Тест-ID | Шаг | Входные данные | Ожидаемый результат | Критерий «пройдено» |
|---------|-----|----------------|---------------------|----------------------|
| C-01 | Плановая пауза без основания | Стройконтроль отмечает паузу, основание не выбрано | Система блокирует сохранение паузы | Без основания пауза не фиксируется |
| C-02 | Плановая пауза — «Иное» | Выбрано «Иное», примечание пустое | Система запрашивает примечание | Без примечания сохранение заблокировано |
| C-03 | ГП не прислал шаблон | Дедлайн истёк, шаблон не получен | Лог: `'ввод без шаблона'`, поля открыты SC | Ввод возможен, примечание зафиксировано |
| C-04 | ГП изменил защищённое поле | Шаблон с изменённой кол.3 | Система отклоняет шаблон | Ошибка валидации при импорте |
| C-05 | Тип 2: `dispute_reason` пустой | `work_accessible=FALSE`, основание не заполнено | Система блокирует перевод в `'Оспорено'` | Без основания флаг `'Спорное'` не сохраняется |
| C-06 | Тип 2: фото не приложено | `work_accessible=FALSE`, фото не загружено | Система блокирует сохранение | Без фото Тип 2 не сохраняется |
| C-07 | Тип 1: `work_accessible=TRUE`, `delta≠ 0` | SC видит 80, ГП заявил 100, работы доступны | Статус `'Подтверждено'`, `discrepancy_type=1` | Уведомление ГП отправлено, закрытие не блокируется |
| C-08 | Закрытие с `'Оспорено'` | 2 позиции в статусе `'Оспорено'` | Кнопка `'Закрыть период'` неактивна | Закрытие заблокировано |
| C-09 | Нормальное закрытие | 0 `'Оспорено'`, все верифицированы | Период закрыт, данные заблокированы | `period.status == 'Closed'` |
| C-10 | Перевыполнение ≤ 5% | Факт = 1050, план = 1000 (5%) | Предупреждение, ввод разрешён | Warning в интерфейсе, примечание опционально |
| C-11 | Перевыполнение 5–20% | Факт = 1150, план = 1000 (15%) | Примечание обязательно, флаг директору | Без примечания ввод заблокирован |
| C-12 | Перевыполнение > 20% | Факт = 1250, план = 1000 (25%) | Жёсткий стоп, ввод заблокирован | Требуется UpdateBaseline или акцепт администратора |

### 4.4 Блок D — Расхождения и SLA

| Тест-ID | Тип | Сценарий | Ожидаемый результат | Критерий «пройдено» |
|---------|-----|----------|---------------------|----------------------|
| D-01 | Тип 1 | SC видит 80, ГП заявил 100, работы видны | SC вносит 80, уведомление ГП, `discrepancy_type=1` | `delta` зафиксирована, уведомление отправлено |
| D-02 | Тип 2 | Гидроизоляция засыпана, SC снимает флаг, вводит основание и фото | Статус `'Оспорено'`, запрос документов ГП | Период не закрывается, `dispute_reason` и фото записаны |
| D-03 | SLA A — нет ответа день 3 | ГП не ответил за 2 дня | День 3: авто-уведомление директору | Директор получил уведомление |
| D-04 | SLA A — принудительное закрытие | ГП не ответил за 5 дней | День 5: SC вносит объём, статус `'Подтверждено (принудительно)'` | Журнал: `'закрыто без ответа ГП, день 5'`. Период разблокирован. |
| D-05 | SLA B — эскалация директору | ГП ответил, SC не принял, день 3 | Авто-эскалация директору с описанием спора | Директор получил уведомление с деталями |
| D-06 | SLA B — потолок день 14 | Директор не принял решение за 14 дней | Система применяет объём стройконтроля | Статус `'Спор не урегулирован'`. Период закрыт. |
| D-07 | Тип 3 — скользящее окно | M=5, N=3. P1(Т2) P2(Т2) P3(Т1) P4(Т2) | Флаг на дашборде после P4 | Флаг: `'3 спорных за 5 периодов'` + накопленная дельта |
| D-08 | Тип 3 — только Тип 1 | 5 периодов подряд, все Тип 1 | Флаг НЕ выставляется | `type2_in_window = 0` |
| D-09 | Тип 3 — снятие флага | Директор урегулировал, снял флаг вручную | Флаг убран, дата и основание записаны | Лог снятия сохранён |

### 4.5 Блок E — Расчёт % готовности и прогноз

| Тест-ID | Шаг | Входные данные | Ожидаемый результат | Критерий «пройдено» |
|---------|-----|----------------|---------------------|----------------------|
| E-01 | % по виду работ | `fact=840`, `plan=1200` | `pct_ready = 70.0%` | Отклонение < 0.1% |
| E-02 | % ограничен 100% | `fact=1300`, `plan=1200` | `pct_ready = 100%`, `fact` сохранён = 1300 | `pct_ready` не превышает 100% |
| E-03 | Взвешенный % объекта | 10 видов работ с разными весами | `obj.pct_ready = SUM(MIN(pct,100)×weight)` | Сумма весов = 1 |
| E-04 | Плановая пауза исключена | P3 — плановая пауза, окно 5 периодов | P3 исключён, темп считается по 4 периодам | Пауза не учитывается в расчёте `pace_weighted` |
| E-05 | Нулевой внеплановый простой | P4: `volume=0`, пауза не отмечена | Предупреждение директору, P4 включён с весом `decay` | Warning на дашборде |
| E-06 | Выброс — плановая концентрация | P5: `volume = pace_weighted × 3`, SC объясняет `'плановая концентрация'` | Вес P5 понижен до 0.5 | Прогноз не перекошен в оптимистичную сторону |
| E-07 | Критический путь | 5 видов, `weight_threshold=0.10`, фасад: `weight=0.25`, `forecast=15 июня` | `forecast_critical = 15 июня`, `bottleneck = 'Фасад'` | `forecast_critical = MAX` по видам с `weight ≥ 0.10` |
| E-08 | Флаг разрыва прогнозов | `forecast_weighted=20 мая`, `forecast_critical=15 июня`, `gap_alert=2 периода` | Флаг `'forecast_gap'` на дашборде с названием вида работ | Флаг снимается автоматически при `gap < 2 периодов` |
| E-09 | Прогноз при нулевом темпе | Все периоды в окне = 0, паузы не отмечены | `forecast_end = 'простой — прогноз невозможен'` | Предупреждение директору |
| E-10 | Расчёт по открытому периоду | Период не закрыт | % по предыдущему закрытому | Пометка `'данные актуальны на [дата]'` |

### 4.6 Блок F — UpdateBaseline

| Тест-ID | Шаг | Входные данные | Ожидаемый результат | Критерий «пройдено» |
|---------|-----|----------------|---------------------|----------------------|
| F-01 | Запрос без основания | `reason = NULL` | Система блокирует запрос | Без основания запрос не создаётся |
| F-02 | Утверждение при открытом периоде | Период P5 открыт, администратор пытается утвердить | Утверждение заблокировано | Сообщение: `'Подождите закрытия P5'` |
| F-03 | Нормальное утверждение | Период закрыт, все условия выполнены | `plan_volume` обновлён, веса пересчитаны, версия BoQ создана | `SUM(weight_coef)==1.0`, аудит-лог записан |
| F-04 | Отклонение с комментарием | Администратор отклоняет без комментария | Система блокирует отклонение | Комментарий обязателен при отклонении |

### 4.7 Блок G — Версионирование L2

| Тест-ID | Шаг | Входные данные | Ожидаемый результат | Критерий «пройдено» |
|---------|-----|----------------|---------------------|----------------------|
| G-01 | Удаление позиции с фактом | Позиция с `fact > 0`, попытка удаления | Удаление заблокировано | Система предлагает: `'Исключить из scope'` или `'Merge'` |
| G-02 | Добавление новой позиции | Новая позиция добавлена в P7 | История начинается с P7, нулевых периодов нет | `fact_history` до P7 — пусто |
| G-03 | Стоимостное изменение | `contract_value` изменилась по одной позиции | Все `weight_coef` пересчитаны | `SUM(weight_coef)==1.0` |
| G-04 | Версия при открытом периоде | Период открыт, попытка создать версию | Заблокировано | Сообщение: `'Подождите закрытия периода'` |

### 4.8 Блок H — Смена ГП

| Тест-ID | Шаг | Входные данные | Ожидаемый результат | Критерий «пройдено» |
|---------|-----|----------------|---------------------|----------------------|
| H-01 | Смена при открытом периоде | Период открыт | Смена заблокирована | Сообщение о необходимости закрыть период |
| H-02 | Смена при наличии `'Оспорено'` | 2 позиции в статусе `'Оспорено'` | Смена заблокирована | Сообщение об урегулировании расхождений |
| H-03 | Нормальная смена | Период закрыт, 0 `'Оспорено'` | `obj.GC` обновлён, аудит-лог, уведомления переназначены | История и журнал расхождений не изменены |

### 4.9 Блок I — Офлайн-синхронизация

| Тест-ID | Шаг | Входные данные | Ожидаемый результат | Критерий «пройдено» |
|---------|-----|----------------|---------------------|----------------------|
| I-01 | Синхронизация при открытом периоде | Офлайн-данные, период открыт | Данные применены с офлайн-временной меткой | Временная метка — дата ввода, не дата синхронизации |
| I-02 | Период закрыт при офлайне | Данные накоплены офлайн, период уже закрыт | Синхронизация заблокирована, уведомление администратору | Администратор принимает решение |
| I-03 | Конфликт данных | Два инженера ввели разные объёмы по одной позиции | Система показывает обе версии с именами и датами | Last-write-wins не применён, выбор за стройконтролем |

---

## Часть 5. Механизм обратной связи и корректировки

| Сбой / аномалия | Признак в системе | Действие по умолчанию | Корректировка |
|-----------------|-------------------|-----------------------|---------------|
| `SUM(weight_coef) ≠ 1.0` | Assert-ошибка | Блокировка запуска системы | Пересчёт стоимостей в РДЦ |
| 0-отчёт не утверждён | `zero_report.status = 'ожидание' > N дней` | Авто-уведомление администратору, циклическое | Директор утверждает или администратор эскалирует |
| ГП не предоставил шаблон | `deadline_missed = TRUE` | SC вносит данные самостоятельно, лог | Предупреждение ГП заранее |
| Тип 2 без основания | `dispute_reason == NULL` | Блокировка сохранения флага | SC обязан указать основание |
| Тип 2 без фото | `photo == NULL` при `work_accessible=FALSE` | Блокировка сохранения | SC обязан загрузить фото |
| SLA A: ГП молчит день 5 | `days_since_dispute >= 5` | SC принудительно закрывает позицию | Период разблокируется |
| SLA B: спор висит день 14 | `days_since_dispute >= 14` | Применяется объём SC, статус `'Спор не урегулирован'` | Период закрывается консервативно |
| `pct_ready > 100%` | `warn_flag = TRUE` | Предупреждение или стоп в зависимости от диапазона | Пересмотр плановых объёмов через UpdateBaseline |
| Флаг Тип 3 не снимается | `flag.active > K периодов` | Флаг видим, % считается по факту | Встреча директора с ГП, эскалация |
| `forecast_critical >> forecast_weighted` | `gap >= forecast_gap_alert` | Флаг `'forecast_gap'` на дашборде | Директор фокусируется на виде-узком месте |
| `M_flag_window` — ложные флаги | Частые флаги при нормальной динамике | Флаг отображается | Администратор увеличивает `M_flag_window` |
| Выброс темпа без объяснения | `volume > pace_weighted × spike_threshold` | Вес периода автоматически понижается до 0.5 | SC объясняет в течение 1 периода |
| Закрытый период нужно изменить | `period.status == 'Closed'` | Изменение заблокировано | Только администратор + основание + дата |
| Офлайн: период закрыт | `sync_blocked = TRUE` | Уведомление администратору | Решение: принять или отклонить данные |

---

## Часть 6. Мини-кейс: сквозной пример

> **Объект:** Складской логистический центр класса А
> **Вид работ:** Устройство монолитной плиты фундамента
> **Плановый объём:** 1 200 м³ · **Договорная стоимость:** 12 000 000 руб. · **Вес:** 0.12
> **0-отчёт:** `fact_0 = 840 м³` (натурный замер, перекрёстная верификация пройдена)
> **Период P1 открыт:** 01.04–07.04.2026

### Шаг 1 — Открытие периода P1

Стройконтроль открывает период P1. Плановая пауза не отмечена. Шаблон сформирован автоматически: `ед.изм.=м³`, `план=1200`, `факт до периода=840`, `остаток=360`, `плановый темп=45 м³/период`.

### Шаг 2 — Получение шаблона от ГП

| Поле | Значение от ГП |
|------|----------------|
| Объём за период (кол.6) | 80 м³ |
| Примечание (кол.7) | Секция B, оси 7–12, бетонирование завершено |

### Шаг 3 — Верификация стройконтролем

SC выехал на объект 03.04. Произведён замер. Фактически сложено **65 м³** (не 80). Перекрытие открыто, замер возможен — оба условия бинарной классификации выполнены.

`delta = 80 − 65 = 15 м³` · `work_accessible = TRUE`

→ Расхождение **Тип 1** (техническое). SC вносит 65 м³, `discrepancy_type=1`. Авто-уведомление ГП отправлено. Период не блокируется.

### Шаг 4 — Закрытие периода и расчёт

| Показатель | Расчёт | Результат |
|------------|--------|-----------|
| Новый фактический объём | 840 + 65 | 905 м³ |
| % готовности вида работ | `MIN(905/1200×100, 100)` | 75.4% |
| Вклад в % объекта | 75.4% × 0.12 | +9.05 п.п. |
| Взвешенный темп (P1, окно=1) | 65 м³ | 65 м³/период |
| Плановый темп | 45 м³/период | Отставание −20 м³/период |
| `forecast_weighted` | (1200−905) / 65 ≈ 4.5 периода | ~5 мая 2026 |
| Входит в критический путь? | `weight=0.12 ≥ 0.10` | Да — учитывается в `forecast_critical` |
| Отклонение прогноза от плана | ~5 мая − 1 мая | +4 дня |

### Шаг 5 — Дашборд директора проекта

- % готовности объекта обновлён по закрытому периоду P1
- Вид работ `'Монолитная плита'`: 75.4%, отставание −20 м³/период, прогноз +4 дня
- Флаг Тип 3: не активен (P1 — первый период, расхождение Типа 1 не учитывается)
- Флаг разрыва прогнозов: не активен (один вид работ, gap = 0)
- Отчёт за период P1 автоматически сформирован

---

> **Итог кейса: алгоритм корректно отработал все ветви.**
>
> - **B:** 0-отчёт утверждён с перекрёстной верификацией (`weight=0.12 ≥ 0.10`)
> - **C3:** `delta≠ 0`, `work_accessible=TRUE` → Тип 1, `discrepancy_type=1`, уведомление ГП
> - **D:** `DetectSystemicFlag()` → Тип 1 не попадает в скользящее окно, флаг не выставляется
> - **E:** `pct_ready=75.4%` (не превышает 100%), взвешенный темп рассчитан с `decay_factor`
> - **E:** `forecast_critical` учитывает позицию (`weight ≥ weight_threshold`)
> - Тесты B-03, C-07, C-09, D-01, D-08, E-01, E-03, E-07 пройдены

---

*Алгоритм разработан на основе Концепции управления ОКС v1.4 · Версия алгоритма 1.3 · 2026*
