# Onboarding

Короткие инструкции для новых разработчиков CCIP по настройке Claude Code.

## 1. Personal Claude Code settings — `.claude/settings.local.json`

`.claude/settings.local.json` находится в `.gitignore` и **не коммитится**. У каждого разработчика свой. Шаблон лежит в `docs/onboarding/settings.local.template.json`.

**Установка:**

```bash
cp docs/onboarding/settings.local.template.json .claude/settings.local.json
```

Затем откройте `.claude/settings.local.json` и при необходимости подгоните:

- `enabledPlugins.superpowers@claude-plugins-official` — `true` если хотите получать skills из marketplace плагина; `false` если у вас локальная копия skills в `~/.claude/skills/` (см. §3 ниже).
- `disabledMcpjsonServers` — добавьте имена MCP-серверов, которые лично вам не нужны.

Удалите все `_comment_*` и `_doc_*` ключи из вашего `.claude/settings.local.json` перед запуском — они валидны как additional properties, но засоряют конфиг.

## 2. Shared Claude Code settings — `.claude/settings.json`

Этот файл tracked, содержит:
- `hooks` — обязательные runtime-хуки для всей команды.
- `permissions.allow` — список безопасных Bash-команд (`node tools/audit/*`, ограниченный `git`) которые не требуют permission prompt.
- `enabledPlugins` — дефолтное состояние плагинов; ваш personal `settings.local.json` может переопределить.

**Не меняйте `settings.json` под свои нужды** — изменение влияет на всю команду. Personal preferences идут в `settings.local.json`.

## 3. Superpowers skills (опционально, для тех кто хочет работать без зависимости от marketplace)

Plugin `superpowers@claude-plugins-official` поставляет skills (writing-plans, executing-plans, subagent-driven-development и т.д.). Альтернативный путь — single-copy в global user-skills:

```bash
# Источник лежит в plugin cache:
#   ~/.claude/plugins/cache/claude-plugins-official/superpowers/<version>/skills/
# Назначение — global user skills (резолвится во всех проектах):
#   ~/.claude/skills/

cp -r ~/.claude/plugins/cache/claude-plugins-official/superpowers/5.1.0/skills/. ~/.claude/skills/
```

> На Windows под Git Bash тильда `~` раскрывается в `%USERPROFILE%` (обычно `C:\Users\<you>`); под PowerShell — используйте `$HOME` (например, `Copy-Item -Recurse "$HOME\.claude\plugins\cache\claude-plugins-official\superpowers\5.1.0\skills\*" "$HOME\.claude\skills\"`).

После этого можно поставить `enabledPlugins.superpowers@claude-plugins-official: false` в своём `settings.local.json` — skills продолжат работать из global копии, но без авто-обновлений из marketplace.
