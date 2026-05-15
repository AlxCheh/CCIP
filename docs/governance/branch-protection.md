# Branch Protection — applied state и operational runbook

Документирует фактическое состояние GitHub branch protection rules на ветке `main` репозитория `AlxCheh/CCIP` и процедуру их повторного применения / изменения.

**Source of truth (declarative):** `.github/branch-protection.yml`
**Initial apply:** 2026-05-15 (full protection)
**Soft-mode apply:** 2026-05-15 (PR-review требование отключено — см. ниже)
**Applied via:** `gh api -X PUT repos/AlxCheh/CCIP/branches/main/protection --input <payload>`

## Текущая конфигурация (Solo Soft-Mode)

| Параметр | Значение | Эффект |
|---|---|---|
| `required_status_checks.strict` | `true` | Ветка должна быть up-to-date с `main` до push/merge |
| `required_status_checks.contexts` | `Zero-Drift Audit Suite (ubuntu-latest)`, `Zero-Drift Audit Suite (macos-latest)`, `Zero-Drift Audit Suite (windows-latest)`, `Lint · Typecheck · Prisma · Test` | Все 4 check'а должны быть green до merge (не применяется к admin'у при `enforce_admins:false`) |
| `required_pull_request_reviews` | `null` | **Solo soft-mode** — PR-review требование отключено |
| `enforce_admins.enabled` | `false` | Admins могут обходить правила (см. ниже) |
| `allow_force_pushes.enabled` | `false` | Force-push запрещён для не-admin'ов |
| `allow_deletions.enabled` | `false` | Удаление ветки запрещено для не-admin'ов |

## Operational notes

### Admin bypass
`enforce_admins: false` означает, что admin-роль обходит protection rules. На 2026-05-15 единственный admin — `@AlxChex` (он же единственный CODEOWNER). Это даёт возможность direct-push для emergency fixes.

### Solo soft-mode (текущее состояние)
`required_pull_request_reviews: null` снимает требование approval'а для PR-merge. Причина: пока `@AlxChex` единственный CODEOWNER, любой PR от него попадал бы в тупик — GitHub не разрешает self-approve, а `require_code_owner_reviews:true` требует одобрения от CODEOWNER. Soft-mode разблокирует PR-flow (merge button активен при green CI), сохраняя защиту от force-push, deletion и обязательность зелёного CI для не-admin'ов.

**Что сохраняется в soft-mode:**
- CI должен быть green до merge (4 контекста).
- Force-push в main запрещён (не-admin).
- Удаление main запрещено (не-admin).
- `strict: true` — feature-ветка должна быть up-to-date с main.

**Что отключено в soft-mode:**
- Требование approval'а на PR.
- Привязка к `.github/CODEOWNERS` для approval'ов (файл по-прежнему документирует владение, но не используется GitHub'ом для review-gating).

### Восстановление полной защиты (при росте команды)
Когда в `.github/CODEOWNERS` появится второй ревьювер:

1. Отредактировать `.github/branch-protection.yml` — заменить `required_pull_request_reviews: null` на блок:
   ```yaml
   required_pull_request_reviews:
     required_approving_review_count: 1  # или 2 для dual-review
     dismiss_stale_reviews: true
     require_code_owner_reviews: true
   ```
2. Повторить apply через gh api (см. «Re-apply procedure» ниже) с обновлённым payload.
3. Verify, что в response `required_pull_request_reviews` снова присутствует с нужными значениями.

### Middle-dot в context name
Context `Lint · Typecheck · Prisma · Test` содержит символ U+00B7 (middle-dot). GitHub принял его как есть (без нормализации). Если в будущем переименовать job в `.github/workflows/ci.yml`, синхронно обновить `.github/branch-protection.yml` и переприменить.

### Emergency direct-push
Для срочных фиксов, требующих обхода PR:

```powershell
git push origin main
```

Работает у admin при `enforce_admins:false`. Этот путь следует использовать только для прерывания production incidents; обычный workflow — через PR.

## Re-apply procedure

При изменении `.github/branch-protection.yml` или drift'е настроек на GitHub:

### 1. Подготовить JSON payload из YAML

Содержимое payload должно точно соответствовать `.github/branch-protection.yml`. Минимальный payload для текущего soft-mode:

```json
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Zero-Drift Audit Suite (ubuntu-latest)",
      "Zero-Drift Audit Suite (macos-latest)",
      "Zero-Drift Audit Suite (windows-latest)",
      "Lint · Typecheck · Prisma · Test"
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
```

Замечание: `required_pull_request_reviews.required_approving_review_count` принимает только 1-6; чтобы полностью отключить требование approval'а, поле должно быть `null` (не объект с count:0). При восстановлении PR-review требования заменить `null` на объект с нужными значениями.

Сохранить в `C:\Temp\branch-protection-payload.json` (UTF-8 без BOM — важно для middle-dot).

### 2. Применить через gh CLI

```powershell
gh api -X PUT repos/AlxCheh/CCIP/branches/main/protection --input C:/Temp/branch-protection-payload.json
```

Требования:
- gh CLI ≥ 2.0 установлен и авторизован (`gh auth status` показывает `Logged in to github.com`).
- Token scope: `repo` (или fine-grained PAT с permission `Administration:write` на этом репо).
- У текущего пользователя `admin: true` на репозитории (`gh api repos/AlxCheh/CCIP --jq .permissions.admin`).

### 3. Verify

```powershell
gh api repos/AlxCheh/CCIP/branches/main/protection --jq '{strict: .required_status_checks.strict, contexts: .required_status_checks.contexts, prReviews: .required_pull_request_reviews.required_approving_review_count, codeOwners: .required_pull_request_reviews.require_code_owner_reviews, dismissStale: .required_pull_request_reviews.dismiss_stale_reviews, enforceAdmins: .enforce_admins.enabled, forcePush: .allow_force_pushes.enabled, deletions: .allow_deletions.enabled}'
```

Сравнить с таблицей `Текущая конфигурация` выше. При расхождении — повторить шаг 2 с исправленным payload.

### 4. Cleanup

Удалить временный payload-файл (`Remove-Item C:\Temp\branch-protection-payload.json`).

## Что осталось вне scope этого документа

- **Применение через Terraform** (`terraform-github-provider`) — альтернатива gh CLI; не требует ручного запуска. Выбор delivery mechanism указан в исходном плане `docs/plans/2026-05-12-zero-drift-compliance-section10.md` как out-of-scope §10.
- **Probot / GitHub App для автоматического применения** — рассмотрено, отложено до появления оснований.
- **Zero-bypass mode** (`enforce_admins:true`) — поднять, когда команда вырастет и emergency direct-push больше не нужен; до этого момента оставлять `false`.
- **Required signed commits** (`required_signatures.enabled:true`) — добавить когда GPG key infrastructure будет настроена для всех контрибьюторов.
