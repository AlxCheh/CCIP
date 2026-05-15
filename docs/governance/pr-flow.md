# Pull Request Flow (PR-flow)

Стандартный способ внести изменения в основную ветку через посредника: работа делается в отдельной feature-ветке, открывается запрос на её вливание (Pull Request, PR) в `main`, CI прогоняет проверки, ревьюверы оставляют комментарии, и только после этого изменения попадают в `main`.

Этот документ описывает PR-flow вообще и его применение в репозитории `AlxCheh/CCIP`.

## Связанные документы

- `docs/governance/branch-protection.md` — branch protection rules, которые делают PR-flow осмысленным (CI-gating, force-push lock, опционально approval-требование).
- `.github/CODEOWNERS` — кто владеет какими частями кода (используется, когда `require_code_owner_reviews:true`).
- `.github/workflows/ci.yml` — CI, который должен быть green на feature-ветке до merge.

## Шаги PR-flow

```
1. Создать feature-ветку от main:
     git checkout main
     git pull
     git checkout -b feat/something

2. Сделать изменения, закоммитить локально:
     git add <files>
     git commit -m "feat(scope): краткое описание"

3. Запушить ветку в origin:
     git push -u origin feat/something

4. Открыть Pull Request:
     gh pr create --base main --head feat/something \
        --title "feat(scope): ..." --body "summary..."

5. GitHub запускает CI на ветке (4 required status checks).

6. Reviewer'ы (если требуются) оставляют approve/request-changes.

7. Когда CI green и requirements satisfied:
     gh pr merge <PR-NUMBER> --squash --delete-branch
     # или нажать "Merge pull request" в UI

8. Подтянуть merged изменения локально:
     git checkout main
     git pull
     git branch -d feat/something  # локальная ветка уже не нужна
```

## Сравнение с direct push

| Аспект | Direct push (`git push origin main`) | PR-flow |
|---|---|---|
| Куда попадает коммит | Сразу в `main` | Сначала в feature-ветку, потом в `main` через merge |
| CI проверка ДО `main` | Нет — CI бежит после push'а; если упадёт, main сломан | Да — `main` обновляется только если CI green на PR |
| Review другими | Нет | Да — PR висит видимым, обсуждение построчно |
| Контекст изменения | Только commit message + git log | PR description, комментарии, threading, linked issues |
| Откат проблемы | Сложно — revert-commit в main | Просто — закрыть PR без merge, либо revert-PR |
| Защита от случайного push'а | Нет | Есть — несколько шагов между «я закоммитил» и «это в main» |
| Скорость для тривиального фикса | Быстрее (1 команда) | Дольше (5+ команд) |

## Зачем нужен PR-flow

### Для команды
- **Изоляция работы.** Незаконченные изменения живут в ветке, не ломая `main` для других.
- **Code review.** Второй человек смотрит код до того, как он становится частью истории `main`. Ловит баги, нарушения конвенций, плохие решения.
- **CI gating.** Branch protection требует CI green на ветке до merge — в `main` всегда зелёная история, никто не разгребает «кто сломал build».
- **Audit trail.** PR — аккумулятор обсуждения: что, зачем, какие альтернативы рассмотрели. Через полгода открываешь PR и понимаешь контекст. Git log такого не даёт.
- **Привязка к issues / changelog.** PR можно привязать к issue, автоматически закрыть его при merge, генерировать changelog.

### Для соло-разработчика
PR-flow не даёт review-бенефита (некому ревьюить), но даёт:

1. **CI gating перед main.** Случайно сломали — PR не смержится до green CI. С direct push'ем легко запушить красный коммит.
2. **Откат проще.** «Передумал» — закрыли PR, ветка как драфт.
3. **Backup в origin.** Push в feature-ветку сразу даёт страховку: машина умерла, работа в `origin/feat/...`.

**Минусы для соло:** больше шагов, накапливаются stale-ветки, надо чистить их после merge.

## Когда использовать что

| Сценарий | Рекомендация |
|---|---|
| Опечатка в комментарии, typo в README | Direct push (тривиально, обратимо) |
| Бизнес-логика, схема БД, новый эндпоинт | PR-flow (CI должен пройти, история должна быть понятной) |
| Hotfix production-инцидента | Direct push с явным `hotfix(...)` commit'ом и сразу post-mortem |
| Изменение `.github/`, `.husky/`, audit infra | PR-flow (даже соло — лишний шаг защищает от случайного слома) |
| Эксперимент / WIP | PR-flow (draft PR) — даёт безопасный backup в origin |

## Применение в `AlxCheh/CCIP`

### Текущая конфигурация ветки `main`
- `required_status_checks.strict: true` — feature-ветка должна быть up-to-date с `main` до merge.
- 4 required contexts: `Zero-Drift Audit Suite (ubuntu-latest)`, `Zero-Drift Audit Suite (macos-latest)`, `Zero-Drift Audit Suite (windows-latest)`, `Lint · Typecheck · Prisma · Test`.
- `required_pull_request_reviews: null` — solo soft-mode, approval не требуется.
- `enforce_admins: false` — `@AlxChex` может обходить (direct push к `main` всё ещё работает).
- `allow_force_pushes: false`, `allow_deletions: false`.

Это значит: PR-flow в репозитории работает (merge button активен при green CI). Direct push тоже работает (admin bypass).

### Husky pre-commit
Каждый локальный `git commit` (в любой ветке) прогоняет `pnpm audit-suite`. Если что-то fail — commit заблокирован. Это значит:

- В feature-ветке вы не сможете закоммитить broken state.
- Audit-failure ловится локально до push'а — economна на CI minutes.

### Команды для типового workflow

**Создать feature-ветку:**
```powershell
git checkout main
git pull
git checkout -b feat/<scope>
```

**Закоммитить и запушить:**
```powershell
git add <files>
git commit -m "feat(<scope>): <description>"
# Husky запускает audit-suite. Если 17/17 green — commit прошёл.
git push -u origin feat/<scope>
```

**Открыть PR (gh CLI):**
```powershell
& "C:\Program Files\GitHub CLI\gh.exe" pr create `
    --base main `
    --head feat/<scope> `
    --title "feat(<scope>): <description>" `
    --body "Summary..."
```

После создания PR команда возвращает URL. Откройте его в браузере, чтобы видеть CI прогресс и комментарии.

**Проверить статус PR:**
```powershell
& "C:\Program Files\GitHub CLI\gh.exe" pr status
& "C:\Program Files\GitHub CLI\gh.exe" pr checks <PR-NUMBER>
```

**Merge:**
```powershell
& "C:\Program Files\GitHub CLI\gh.exe" pr merge <PR-NUMBER> --squash --delete-branch
```

Опции merge:
- `--merge` — обычный merge commit (сохраняет историю feature-ветки)
- `--squash` — squash всех commit'ов feature-ветки в один на main (чище для коротких PR)
- `--rebase` — rebase коммитов на main (линейная история)

`--delete-branch` удаляет ветку в origin после merge (рекомендуется, чтобы не накапливать stale).

**Подтянуть merged изменения локально:**
```powershell
git checkout main
git pull
git branch -d feat/<scope>  # удалить локальную ветку
```

## Типичные ошибки

### Забыли pull перед созданием ветки
```
git checkout -b feat/x  # main устарел
# ... коммиты ...
git push -u origin feat/x
# PR создан, CI прогнал, но при merge GitHub просит rebase (strict:true)
```
**Fix:** `git checkout main && git pull` перед `git checkout -b`.

### CI fails после push'а
- Запустить локально то же, что и CI: `pnpm audit-suite && pnpm test:audit && pnpm turbo typecheck lint test`.
- Husky должен был поймать audit-suite-failure ещё локально. Если не поймал — посмотреть, не использовали ли `--no-verify`.

### PR висит без CI
Branch protection требует, чтобы все 4 required contexts отрепортились. Если CI не запустился (например, workflow триггерится только на `push: branches: [main, develop]`, а вы создали ветку `feat/x`) — нужно обновить триггер workflow или открыть PR (workflow триггерится также на `pull_request`).

### Стиль commit message
Project использует Conventional Commits:
```
<type>(<scope>): <subject>
```
Типы: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, `perf`.
Scope — модуль / зона: `audit`, `governance`, `agents`, `api`, `frontend`, `db` и т.д.
Subject — императив в нижнем регистре, без точки в конце, до 72 символов.

См. историю `git log --oneline -20` для образцов.

## См. также

- `docs/governance/branch-protection.md` — что именно защищено и как переприменить rules.
- `CHANGELOG.md` — Keep-a-Changelog формат; commits с `closes F-NNN` требуют entry.
- `.github/workflows/ci.yml` — что прогоняется на CI и в каком порядке.
- `docs/audits/quarterly-runbook.md` — что делать раз в квартал поверх непрерывного PR-flow.
