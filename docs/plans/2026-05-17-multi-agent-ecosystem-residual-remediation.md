# Multi-Agent Ecosystem Audit — Residual Remediation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть оставшиеся findings из `docs/audits/multi-agent-ecosystem-2026-05-07.md` после Zero-Drift Compliance §10 (4 inline tasks) и зафиксировать roadmap из 6 sub-планов, требующих отдельных сессий планирования.

**Architecture:** Двухуровневая. **Tier 1** — 4 узких inline-таска (≤ 1 dev-day), все file-only, каждый закрывает конкретный finding или X-риск. **Tier 2** — 6 sub-plan stubs со scope/goal/findings-closed, но БЕЗ task-decomposition (требуют отдельной brainstorming + writing-plans сессии). **Tier 3** — closed/cosmetic, фиксируются справочно. Husky audit-suite (17/17) + CI (nightly-audit.yml, portable-clone.yml, weekly-orphan-scan.yml) защищают от регрессии.

**Tech Stack:** Node.js (audit scripts), JSON (settings), Markdown (ADRs/agents/delivery), Bash/PowerShell (verification commands), git (commits per task).

---

## 0. Status Snapshot (verified 2026-05-17)

Каждый finding из аудита сверен с текущим состоянием репозитория.

### 0.1 BLOCKER status

| ID | Описание | Статус | Доказательство |
|---|---|---|---|
| F-001 | security-reviewer RBAC `supervisor`/`contractor` | **CLOSED** | `grep -E "supervisor\|contractor" .claude/agents/security-reviewer.md` → 0 matches |
| F-002 | settings.json абсолютный путь `W:/Claude/CCIP/...` | **OPEN (Tier 1, Task 1)** | `grep "W:/" .claude/settings.json` → 3 hits (PostToolUse×2, Stop×1). T-25 закрыл prevention (portable-clone CI), но canonicalization самого файла отложена |
| F-003 | `(§15)` cross-reference в 10 агентах при отсутствии §15 | **CLOSED** | `CLAUDE.md` содержит §15 State Contract (lifecycle, contract, sanitizeHandoff, validation) |
| F-004 | session-state.json uninitialised | **CLOSED by design** | Red Team §6 R-001: файл исключён из flow; `post-agent-hook.js:139-142` имеет guard `if (!state.session_id) skip` |

### 0.2 CRITICAL status

| ID | Описание | Статус | Доказательство |
|---|---|---|---|
| F-005 | `apps/mobile/` missing | **DEFERRED (Tier 2, Sub-plan D)** | `test -d apps/mobile` → MISSING; M-M post-pilot |
| F-006 | `infra/k8s/` missing | **DEFERRED (Tier 2, Sub-plan C)** | `test -d infra/k8s` → MISSING; M-12 deferred |
| F-007 | `docs/proposed-claude-md-changes.md` missing | **CLOSED** | `test -f` → EXISTS |
| F-008 | `docs/errors_log.md` path drift в 6 агентах | **CLOSED** | `grep -rE "docs/errors_log\.md" .claude/agents/` → 0 matches; PATH-CANON audit check |
| F-009 | `docs/feedback-loop.md` path drift | **CLOSED** | `grep -rE "docs/feedback-loop\.md" .claude/agents/` → 0 matches |
| F-010 | Intent table coverage (8 missing agents) | **CLOSED** | `CLAUDE.md` содержит "Auxiliary Agents" таблицу с автоматическими триггерами для product-owner, routing-planner, claude-md-auditor, navigator-optimizer, session-optimizer, consistency-checker, security-reviewer, general-purpose |
| F-011 | hook ROOT computation assumes `CCIP/` dirname | **CLOSED** | `post-agent-hook.js:19` → `const ROOT = path.resolve(__dirname, '../..')` — portable |

### 0.3 HIGH status

| ID | Описание | Статус | Доказательство |
|---|---|---|---|
| F-012 | hook parser markdown-only, ignores top-level JSON | **CLOSED by design** | Red Team §6 R-001: planner JSON output вне flow. `post-agent-hook.js:86` markdown extraction — единственный contract; `## State Update` блок обязателен per CLAUDE.md §15 |
| F-013 | non-atomic write в `post-agent-hook.js:30` | **CLOSED** | `post-agent-hook.js:30-46`: tmp → fsync → renameSync + cleanup на failure |
| F-014 | ccip-claude-md-auditor git paths `CCIP/...` | **needs spot-check** (likely CLOSED — see Task 4) | Auditor скрипт проходит nightly-audit.yml; но agent.md content проверить |
| F-015 | `apps/api/src/modules/dispute-sla/` зарезервирован vs реальный `dispute/` | **OPEN (Tier 1, Task 3)** | `ls apps/api/src/modules/dispute*` → обе директории есть; `dispute/dispute.manifest.md` существует, `dispute-sla/` пустая. Memory M-05b: dispute-sla reserved для SLA worker (per Red Team C-004 resolution) — нужно обновить delivery docs |
| F-016 | ccip-security frontmatter без `model:` и §State Contract | **PARTIAL** (Task 2) | `head -20 ccip-security.md`: `model: claude-sonnet-4-6` ✓, tools полные ✓; §State Contract секцию проверить (STATE-CONTRACT audit check проходит 17/17 → секция есть, но verify контент) |
| F-017 | SLA-worker phantom path `apps/api/src/sla-scheduler/` | **OPEN (Tier 1, Task 3 — bundled с F-015)** | Red Team C-004 status: "open"; delivery docs ссылаются на несуществующий `sla-scheduler/` |
| F-018 | atomic write для observations в flush-state.js | **CLOSED** | `grep -E "fsync\|renameSync\|tmp" .claude/runtime/flush-state.js` → tmp + fsync + renameSync + cleanup confirmed |

### 0.4 MEDIUM / LOW status

| ID | Описание | Статус |
|---|---|---|
| F-019 | docker-compose.yml location ambiguity | **MEDIUM — cosmetic** (Tier 3, не фиксировать без триггера) |
| F-020 | `frontend/` orphan dir | **CLOSED** (removed) |
| F-021 | `the roles of subagents/` orphan | **CLOSED** (removed) |
| F-022 | `.agents/` collision | **CLOSED** (removed) |
| F-023 | settings.local.json permissions узкий | **CLOSED partially** (текущий файл содержит расширенный allowlist на git/audit ops; risk X-12 пересмотрен — `Bash(git commit -m)` без trailing quote — узко) |
| F-024 | CI workflows для agent linting | **CLOSED** (`.github/workflows/`: ci.yml, nightly-audit.yml, portable-clone.yml, weekly-orphan-scan.yml) |
| F-025/026/027 | tools/model/anchor inconsistencies | **Tier 3 — cosmetic** |

### 0.5 Hidden catastrophic risks (X-1..X-12) status

| ID | Описание | Статус |
|---|---|---|
| X-1 | State race на параллельных Agent calls | **PARTIAL — atomic write OK, write-lock нет** (Tier 2, Sub-plan F) |
| X-2 | Prompt injection через handoff в errors_log | **CLOSED** (PATH-CANON + sanitizeHandoff() per state-protocol.md) |
| X-3 | Hook silent crash на non-Win | **CLOSED** (portable ROOT + portable-clone.yml CI) |
| X-4 | Auditor git path CWD assumption | **CLOSED indirectly** (passes nightly-audit on linux-latest runner; verify в Task 4 spot-check) |
| X-5 | Auditor self-modify race | **THEORETICAL OPEN** (LLM-based guard, не machine; Tier 3 — будущая harder guard) |
| X-6 | Cross-tenant DAG leak | **DEFERRED (Tier 2, Sub-plan E)** — зависит от RLS fuzz |
| X-7 | ADR-013 PDF reports orphan | **OPEN (Tier 1, Task 4 — spot-check)** |
| X-8 | dispute-sla memory drift | **OPEN (Tier 1, Task 3 — bundled с F-015)** |
| X-9 | Frontend dual-tree | **CLOSED** |
| X-10 | `.agents` namespace collision | **CLOSED** |
| X-11 | ADR-005 SLA worker config не enforced | **DEFERRED (Tier 2, Sub-plan C)** — depends on K8s scaffold |
| X-12 | settings.local commit allowlist | **CLOSED partially** (actual entries safer than аудит думал) |

### 0.6 Сводка

```
Total findings (F + X):     39
CLOSED via §10 / by design: 27
OPEN — Tier 1 (this plan):   4 (F-002, F-015/017/X-8, F-016, F-014/X-4/X-7 spot-check)
DEFERRED — Tier 2 sub-plans: 6
Cosmetic / Tier 3:           2
```

---

## 1. Sub-Project Decomposition (Scope Check)

Аудит покрывает несколько независимых subsystems. Per `superpowers:writing-plans` scope rule, требуется break-out. Этот план оставляет в scope **только** Tier 1 (4 inline tasks). Tier 2 — 6 sub-plan stubs (см. §6), каждый требует отдельной brainstorming + writing-plans сессии.

| Sub-plan | Domain | Findings closed | Estimated effort |
|---|---|---|---|
| A. §11 Business Correctness gate | PeriodEngine, DisputeSLA, weight_coef, decay_factor regression suite | (validation infrastructure для всех ADR-002/006/010) | 3–5 dev-days |
| B. §12 Operational Readiness gate | DR, RTO/RPO, SLO, load tests, runbooks | Pre-pilot M-13 readiness | 4–6 dev-days |
| C. M-12 K8s scaffold | `infra/k8s/`, deployments, ADR-005 SLA worker manifest | F-006, X-11 | 2–3 dev-days |
| D. M-M Mobile scaffold | `apps/mobile/`, ADR-008/014 implementation | F-005, ADR-013/014 orphan partial | 5–10 dev-days |
| E. RLS fuzz suite | T-R-004 runtime tests для multi-tenancy isolation | X-6 | 2–3 dev-days |
| F. Concurrent hook write-lock | X-1 hard guarantee через advisory file lock | X-1 | 1–2 dev-days |

---

## 2. File Structure (Tier 1)

| Task | Modify | Create | Test |
|---|---|---|---|
| 1 | `.claude/settings.json`, `tools/audit/path-canonical.js` (если absolute-path detector trigger), `CHANGELOG.md` | — | manual: hook fires в session |
| 2 | `.claude/agents/ccip-security.md` (если §State Contract отсутствует), `CHANGELOG.md` | — | `pnpm audit-suite` → STATE-CONTRACT pass |
| 3 | `docs/delivery_plan_v1_0.md`, `docs/delivery/phase-4-7-backend-modules.md`, `apps/api/src/modules/dispute-sla/.gitkeep` (если папка пустая и не tracked), `CHANGELOG.md` | возможно `docs/decisions/ADR-015-sla-worker-canonical-path.md` (если решение требует ADR) | manual: `grep sla-scheduler docs/delivery*` → 0 |
| 4 | `CHANGELOG.md` | возможно `docs/decisions/index.md` patch (если ADR-013 не упомянут) | manual: `grep ADR-013 .claude/agents/*.md` → ≥1 |

---

## 3. Tier 1 — Inline Tasks

---

### Task 1: Canonicalize hook paths в `.claude/settings.json` (F-002)

**Files:**
- Modify: `.claude/settings.json` (lines 9, 13, 23)
- Modify: `CHANGELOG.md` (Unreleased § Fixed)

**Context:** Текущие 3 hook commands используют абсолютный путь `W:/Claude/CCIP/...`. Это ломает любой clone на другой машине / Linux / macOS / CI runner вне Windows. T-25 закрыл prevention infrastructure (portable-clone.yml nightly), но сам файл всё ещё не portable — он держится в allowlist'е `path-canonical.js` (`.claude/settings.json` явно whitelisted with comment "hook commands могут быть absolute (но это §10.3 цель → пометить TODO)").

**Approach:** Claude Code hooks выполняются с CWD = project root (где находится `.claude/`). Заменить абсолютные пути на относительные `node .claude/runtime/<script>.js`. После замены — удалить запись `.claude/settings.json` из ALLOWLIST в `path-canonical.js` (но проверить что нет других абсолютных путей в файле).

- [ ] **Step 1.1: Прочитать текущий `.claude/settings.json` и подтвердить отсутствие других абсолютных путей**

Run: `node -e "const j=require('fs').readFileSync('.claude/settings.json','utf8'); console.log(j); if(/W:|C:\\\\|/home\\//.test(j.replace(/node W:\\/[^\"]+/g,''))) console.error('OTHER ABS PATHS PRESENT')"`

Expected: вывод файла; никаких "OTHER ABS PATHS" warning. Если есть — escalate user (вне scope task).

- [ ] **Step 1.2: Заменить 3 hook commands на относительные пути**

Edit `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Agent",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/runtime/post-agent-hook.js"
          },
          {
            "type": "command",
            "command": "node .claude/runtime/verify-evidence-log.js"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/runtime/flush-state.js"
          }
        ]
      }
    ]
  },
  "enabledPlugins": {
    "superpowers@claude-plugins-official": true
  }
}
```

- [ ] **Step 1.3: Запустить smoke-проверку — hook fires в текущей сессии**

Это сложно проверить unit-тестом, поэтому опираемся на следующий Agent call. После commit (Step 1.6) → следующее `Agent` invocation должно обновить `.claude/runtime/session-state.json` (timestamp `started_at` или `observations` length).

Smoke до commit: `node .claude/runtime/post-agent-hook.js < /dev/null` → должно завершиться без ошибки (will print stderr `[post-agent-hook] malformed payload` — это OK, hook accepts pipe input).

PowerShell вариант: `'{}' | node .claude/runtime/post-agent-hook.js` → exit code 0.

- [ ] **Step 1.4: Удалить запись из ALLOWLIST в `tools/audit/path-canonical.js`**

После замены `.claude/settings.json` больше не содержит абсолютных путей → ALLOWLIST entry устарела.

Edit `tools/audit/path-canonical.js` (around line 23):

```js
const ALLOWLIST = [
  // '.claude/settings.json' entry удалена — файл canonicalized в T1 task
  'docs/plans/2026-05-12-zero-drift-compliance-section10.md', // plan doc — contains literal examples
  'tools/audit/__fixtures__/path-bad.md',                     // test fixture — intentionally bad
  'docs/audits/multi-agent-ecosystem-2026-05-07.md',          // audit report — documents found violations
  '.claude/agents/ccip-session-optimizer.md',                 // describes bad patterns as anti-examples
  '.claude/agents/consistency-checker.md',                    // table labels, not executable paths
  'docs/refactor/session-optimizer-skill-scope.md',           // planning doc — project-relative labels
];
```

- [ ] **Step 1.5: Прогнать audit-suite — должен пройти**

Run: `pnpm audit-suite`

Expected: `=== Summary: 17/17 passed ===`. PATH-CANON OK значит ни `.claude/settings.json`, ни другие файлы больше не содержат abs paths.

Если PATH-CANON FAIL — diagnose: какой файл flagged? Возможно потеряли другой entry из ALLOWLIST. Roll back step 1.4 и обсудить.

- [ ] **Step 1.6: Update CHANGELOG.md**

В `## [Unreleased]` → `### Fixed`:

```markdown
- `.claude/settings.json` hooks теперь используют относительные пути (`node .claude/runtime/*.js`) вместо абсолютного `W:/Claude/CCIP/...` — closes F-002. ALLOWLIST entry удалена из `tools/audit/path-canonical.js`.
```

- [ ] **Step 1.7: Commit**

```bash
git add .claude/settings.json tools/audit/path-canonical.js CHANGELOG.md
git commit -m "fix(hooks): portable relative paths in .claude/settings.json — closes F-002"
```

Expected: Husky audit-suite 17/17, commit succeeds.

---

### Task 2: Verify §State Contract в `ccip-security.md` (F-016)

**Files:**
- Read-only: `.claude/agents/ccip-security.md`
- Modify (conditional): `.claude/agents/ccip-security.md` (если §State Contract отсутствует)
- Modify (conditional): `CHANGELOG.md`

**Context:** F-016 указывал на отсутствие `model:` поля и `## State Contract` секции. Frontmatter уже содержит `model: claude-sonnet-4-6`. STATE-CONTRACT audit check (часть 17/17) проходит → секция должна быть. Этот task — verification + добавление если выявлено отсутствие.

- [ ] **Step 2.1: Прочитать ccip-security.md полностью + проверить наличие `## State Contract`**

Run: `grep -c "^## State Contract" .claude/agents/ccip-security.md`

Expected: `1` (one occurrence). Если `0` — переход к Step 2.2 (добавить). Если `≥1` — переход к Step 2.4 (close task, no changes needed).

- [ ] **Step 2.2 (conditional): Добавить §State Contract в конец файла**

Если Step 2.1 вернул `0`, добавить в конец `ccip-security.md`:

````markdown

## State Contract

В конце вывода обязательно блок (per CLAUDE.md §15):

```markdown
## State Update
```json
{
  "summary": "≤ 3 предложения о сделанном — какие findings выявлены, какой severity",
  "artifacts": ["ADR-NNN.md", "apps/api/src/path/file.ts"],
  "handoff_notes": "Что нужно знать следующему агенту: severity:critical → BLOCK; required ACK перед merge"
}
```
````

Note: вложенный fence escape (` ``` ` внутри ` ```` `) — обязателен per Markdown rendering.

- [ ] **Step 2.3 (conditional): Verify audit-suite still passes**

Run: `pnpm audit-suite`
Expected: 17/17 passed. STATE-CONTRACT и AGENT-FM specifically — OK.

- [ ] **Step 2.4: Update CHANGELOG (only if Step 2.2 fired)**

В `## [Unreleased]` → `### Fixed`:
```markdown
- `.claude/agents/ccip-security.md` теперь содержит §State Contract секцию per CLAUDE.md §15 — closes F-016 (residual gap не покрытый STATE-CONTRACT audit check).
```

- [ ] **Step 2.5: Commit (only if Step 2.2 fired)**

```bash
git add .claude/agents/ccip-security.md CHANGELOG.md
git commit -m "docs(agents): ccip-security §State Contract section — closes F-016"
```

Иначе (Step 2.1 нашёл секцию): закрыть task без коммита, отметить в session notes "F-016 confirmed CLOSED — STATE-CONTRACT audit covers; no edit needed".

---

### Task 3: Canonicalize SLA worker path в delivery docs (F-015 + F-017 + X-8 + Red Team C-004)

**Files:**
- Modify: `docs/delivery_plan_v1_0.md` (~ line 291 GP, line 321 SLA scheduler)
- Modify: `docs/delivery/phase-4-7-backend-modules.md` (~ line 51 GP, line 81 SLA scheduler)
- Create (conditional): `apps/api/src/modules/dispute-sla/.gitkeep` (если папка пустая и не tracked в git)
- Modify (optional): `docs/decisions/ADR-015-sla-worker-canonical-path.md` — **только если** нужен formal ADR (см. Step 3.6)
- Modify: `docs/decisions/index.md` (если ADR-015 создан)
- Modify: `CHANGELOG.md`

**Context:** Phantom paths в delivery docs:
- `apps/api/src/gp/gp.module.ts` — НЕ существует; GP submission уже в `apps/api/src/modules/period/`
- `apps/api/src/sla-scheduler/sla-scheduler.module.ts` — НЕ существует; per memory M-05b canonical path = `apps/api/src/modules/dispute-sla/`

Red Team §6 C-004 status: "open, Owner: ccip-doc-writer (после ARCH-решения)". Memory M-05b закрепило решение: `dispute-sla/` зарезервирован. То есть ARCH-решение УЖЕ принято (через memory), осталось propagate в delivery docs.

- [ ] **Step 3.1: Прочитать релевантные секции delivery docs**

Run:
```bash
grep -nE "sla-scheduler|src/gp/" docs/delivery_plan_v1_0.md docs/delivery/phase-4-7-backend-modules.md
```

Expected: 4 hits (per audit F-017 evidence). Зафиксировать line numbers для аккуратной правки.

- [ ] **Step 3.2: Прочитать `dispute.manifest.md` чтобы понять scope existing `dispute/`**

Run: `cat apps/api/src/modules/dispute/dispute.manifest.md`

Цель: убедиться что `dispute/` и `dispute-sla/` — different scope (НЕ duplicate). Ожидаемо: `dispute/` = dispute handler, `dispute-sla/` = SLA worker (BullMQ job для просроченных disputes). Если manifest показывает overlap — escalate (требуется реальный ARCH-decision, не просто doc fix).

- [ ] **Step 3.3: Заменить phantom paths в `delivery_plan_v1_0.md`**

Edit `docs/delivery_plan_v1_0.md`:

- Заменить `apps/api/src/gp/gp.module.ts` → `apps/api/src/modules/period/` (с пояснением "GP submission через gpToken-ветвь openPeriod, M-05a")
- Заменить `apps/api/src/sla-scheduler/sla-scheduler.module.ts` → `apps/api/src/modules/dispute-sla/` (с пояснением "SLA worker, M-05b; зарезервирован per memory M-05b и Red Team §6 C-004 resolution")

- [ ] **Step 3.4: Заменить phantom paths в `phase-4-7-backend-modules.md`**

Edit `docs/delivery/phase-4-7-backend-modules.md` — те же замены что в Step 3.3.

- [ ] **Step 3.5: Verify `dispute-sla/` directory tracked**

Run: `git ls-files apps/api/src/modules/dispute-sla/ | head -1`

Если empty (директория не tracked) → создать `.gitkeep`:
```bash
echo "# Reserved для SLA worker per memory M-05b и delivery_plan_v1_0.md M-05b" > apps/api/src/modules/dispute-sla/.gitkeep
```

Если уже tracked — пропустить.

- [ ] **Step 3.6 (conditional): Решить, нужен ли formal ADR-015**

Decision criteria:
- **Да, нужен ADR-015**, если: (a) memory M-05b — единственный источник решения о canonical path, (b) future onboarding должен видеть это в `docs/decisions/`, (c) есть архитектурные нюансы (BullMQ vs in-process scheduling, replicas:1 per ADR-005).
- **Нет, не нужен**, если: (a) решение тривиально (just path rename), (b) ADR-005 уже покрывает SLA worker invariants, (c) обновление delivery docs + manifest.md достаточно.

**Recommendation:** написать short ADR-015 (≤30 строк) — closes Red Team C-004 properly и устраняет dependency на memory как единственный SoT.

Если ADR-015 решено создать:

Create `docs/decisions/ADR-015-sla-worker-canonical-path.md`:

```markdown
---
adr: ADR-015
status: Принято
impl_anchors:
  - apps/api/src/modules/dispute-sla/
  - docs/delivery_plan_v1_0.md (M-05b)
  - docs/delivery/phase-4-7-backend-modules.md
related: ADR-005, ADR-007
---

# ADR-015 — SLA Worker Canonical Path

**Статус:** Принято
**Замещает:** delivery_plan_v1_0.md phantom path `apps/api/src/sla-scheduler/`

## Решение
SLA worker (M-05b) реализуется в `apps/api/src/modules/dispute-sla/`. Замещает несуществующий путь `apps/api/src/sla-scheduler/`, упомянутый в delivery docs до 2026-05-17.

## Контекст
Делivery docs (`delivery_plan_v1_0.md:321`, `phase-4-7-backend-modules.md:81`) ссылались на `apps/api/src/sla-scheduler/sla-scheduler.module.ts`. Реальная структура проекта — `apps/api/src/modules/<name>/`. Сам модуль не был создан; путь — phantom (Red Team C-004, multi-agent-ecosystem F-017).

Memory M-05b (2026-05-XX) зафиксировала: `apps/api/src/modules/dispute-sla/` зарезервирован для SLA worker. Этот ADR кодифицирует решение в SoT.

## Контракт
- Модуль `apps/api/src/modules/dispute-sla/` — единственный canonical SLA worker location.
- Существующий `apps/api/src/modules/dispute/` — DisputeService (handler API), не SLA worker.
- ADR-005 invariants (replicas:1, strategy:Recreate) применяются к deployment этого модуля.
- ADR-007 invariants (period immutability) — SLA worker не модифицирует period_work_items напрямую; только пишет в audit_log и dispute updates.

## Отклонённые альтернативы
| Альтернатива | Причина |
|---|---|
| `apps/api/src/sla-scheduler/` (top-level) | Нарушает конвенцию `src/modules/<name>/` всего проекта |
| Слияние с `apps/api/src/modules/dispute/` | Разные runtime concerns: handler (HTTP) vs worker (BullMQ); ADR-005 reliability требования отличаются |
```

И обновить `docs/decisions/index.md`: добавить строку про ADR-015.

- [ ] **Step 3.7: Verify audit-suite passes**

Run: `pnpm audit-suite`
Expected: 17/17. DEAD-REF specifically — больше нет ссылок на phantom paths.

Если ADR-015 создан: ADR-ANCHOR и ORPHAN-ADR checks должны учесть его (вероятно уже учитывают через glob `ADR-*.md`).

- [ ] **Step 3.8: Update CHANGELOG**

В `## [Unreleased]` → `### Changed`:
```markdown
- delivery docs: phantom paths `apps/api/src/gp/gp.module.ts` и `apps/api/src/sla-scheduler/sla-scheduler.module.ts` заменены на canonical `apps/api/src/modules/period/` и `apps/api/src/modules/dispute-sla/` — closes F-015, F-017, Red Team C-004. ADR-015 кодифицирует SLA worker canonical path.
```

(Если ADR-015 не создавался — убрать упоминание из CHANGELOG.)

- [ ] **Step 3.9: Commit**

```bash
git add docs/delivery_plan_v1_0.md docs/delivery/phase-4-7-backend-modules.md CHANGELOG.md
git add apps/api/src/modules/dispute-sla/.gitkeep   # only if Step 3.5 created it
git add docs/decisions/ADR-015-sla-worker-canonical-path.md docs/decisions/index.md   # only if Step 3.6 created
git commit -m "fix(delivery): canonical SLA worker path — closes F-015 F-017 RT-C-004"
```

---

### Task 4: Spot-checks для F-014, X-4, X-7 (auditor paths + ADR-013 orphan)

**Files:**
- Read-only: `.claude/agents/ccip-claude-md-auditor.md`, all `.claude/agents/*.md`
- Modify (conditional): `.claude/agents/ccip-backend-core.md` или другой agent, ссылающийся на ADR-013
- Modify: `CHANGELOG.md`

**Context:** Три потенциально остающиеся issue, требующие быстрой проверки:
- **F-014**: ccip-claude-md-auditor использует `git log -- CCIP/...` paths; нужно подтвердить что переписаны на относительные.
- **X-4**: тот же risk что F-014 — нужно подтверждение через CI (nightly-audit runs на ubuntu-latest, поэтому `CCIP/...` paths упали бы → если CI green, значит OK).
- **X-7**: ADR-013 (PDF reports) — никто не цитирует. Нужно либо подцепить из соответствующего модуля, либо отметить Deprecated.

- [ ] **Step 4.1: Проверить ccip-claude-md-auditor paths (F-014 / X-4)**

Run: `grep -nE "CCIP/|W:/" .claude/agents/ccip-claude-md-auditor.md`

Expected: 0 matches (paths должны быть относительными). Если есть matches — поправить:
- Заменить `git log -- CCIP/docs/...` → `git log -- docs/...`
- Заменить `git log -- CCIP/.claude/...` → `git log -- .claude/...`

И добавить explicit guard в начале agent.md: "Все git команды выполняются от project root (где `.git/`); paths относительные".

- [ ] **Step 4.2: Проверить ADR-013 orphan status (X-7)**

Run: `grep -rE "ADR-013" .claude/agents/ docs/decisions/index.md 2>/dev/null | head -10`

Expected behavior:
- Если ≥1 hit в `.claude/agents/` — orphan **CLOSED**, переход к Step 4.4.
- Если 0 hits, но есть в `docs/decisions/index.md` — orphan **PARTIAL**, переход к Step 4.3.
- Если 0 hits везде — критично, escalate (возможно ADR-013 надо deprecate).

- [ ] **Step 4.3 (conditional): Прикрепить ADR-013 к owning agent**

ADR-013 (PDF reports) логически принадлежит ccip-backend-core (генерация) или ccip-backend-aux (delivery). Прочитать `docs/decisions/ADR-013-*.md` чтобы определить owner.

Add reference в frontmatter `impl_anchors:` или в body соответствующего `.claude/agents/<agent>.md`:

Пример (если owner = backend-aux):
```markdown
- **PDF reports (ADR-013):** генерация PDF отчётов по периодам — endpoint `/admin/periods/:id/report.pdf`, использует Puppeteer (см. ADR-013 §Контракт).
```

- [ ] **Step 4.4: Verify audit-suite passes**

Run: `pnpm audit-suite`
Expected: 17/17, особенно ORPHAN-ADR check.

- [ ] **Step 4.5: Update CHANGELOG (если были изменения)**

В `## [Unreleased]` → `### Fixed` (collapse в одну запись если несколько spot-checks fired):
```markdown
- ccip-claude-md-auditor: git paths canonicalized (relative, не `CCIP/...`) — closes F-014, X-4.
- ADR-013 (PDF reports) подключён к ccip-<agent>.md — closes X-7.
```

- [ ] **Step 4.6: Commit (если были изменения)**

```bash
git add .claude/agents/ccip-claude-md-auditor.md .claude/agents/ccip-<agent>.md CHANGELOG.md
git commit -m "chore(agents): residual spot-checks — closes F-014 X-4 X-7"
```

Если Step 4.1 и 4.2 нашли что всё уже CLOSED — no commit, отметить в session notes.

---

## 4. Verification после Tier 1

После всех 4 tasks:

```bash
pnpm audit-suite                                                    # 17/17
git log --oneline 8da044c..HEAD | head -10                          # ≤6 новых коммитов (T-22 reorg + Tier 1)
grep -rE "W:/|/c/Users/" .claude/ tools/                            # 0 matches (Task 1)
grep -rE "sla-scheduler|src/gp/" docs/delivery* 2>/dev/null          # 0 matches (Task 3)
grep -c "^## State Contract" .claude/agents/ccip-security.md         # 1 (Task 2)
grep -rE "ADR-013" .claude/agents/ | head -5                         # ≥1 (Task 4)
```

CI после push (если применимо): nightly-audit.yml + portable-clone.yml + weekly-orphan-scan.yml должны быть green на следующем scheduled run.

---

## 5. Out of Scope для Tier 1 (Tier 3 — cosmetic / closed)

Фиксируется только справочно, fix не требуется:

- **F-019** docker-compose.yml location — minor doc, добавить sentence в `ccip-devops.md` "при необходимости". Триггер: следующий ccip-devops dispatch может добавить попутно.
- **F-025/026/027** tools/model/anchor inconsistencies — пройти audit `tools/audit/audit-suite.js` и `tools/audit/agent-frontmatter.js`; cosmetic; добавить L-1/L-2 в backlog для будущего refactor sprint.
- **X-5** auditor self-modify race — LLM-based guard остаётся; для machine-enforcement нужен hardened audit (например, schema-validated diff). Записать как future risk.
- **X-12** settings.local allowlist — current entries уже tighter чем audit оценил.

---

## 6. Tier 2 — Sub-plan Stubs (требуют отдельных сессий)

Каждый stub содержит достаточно information для **separate** brainstorming + writing-plans run. **НЕ** task-decomposable inline.

---

### Sub-plan A: §11 Business Correctness Gate

**Goal:** Установить runtime regression suite для бизнес-инвариантов PeriodEngine, DisputeSLA, weight_coef trigger, decay_factor analytics.

**Why:** Memory zero_drift_section10_state: "§11 Business Correctness gate — отдельный план". Pre-pilot M-13 sign-off зависит от прохождения §11 + §12.

**Scope:**
- PeriodEngine state machine integration tests (open → submitted → closed → reopened)
- DisputeSLA flow regression (dispute → SLA timer → auto-resolve / escalate)
- weight_coef trigger correctness (BoQ weight redistribution на period close)
- decay_factor calculation для analytics (exponential decay correctness)

**Findings closed indirect:** ADR-002 (advisory locks runtime verification), ADR-006 (BoQ versioning correctness), ADR-011 (analytics precomputation correctness).

**Primary agent:** ccip-qa
**Co-agents:** ccip-backend-core (consultation), ccip-product-owner (acceptance criteria), ccip-dba (data integrity scenarios)

**Estimated effort:** 3–5 dev-days.

**Brainstorming questions для будущей сессии:**
1. Какие из A-01..I-03 tests из `algorithm_v1_3.md` Part 4 уже реализованы vs missing?
2. Какой test DB strategy: shared Postgres container + truncate-between-tests, или per-test schema?
3. Какие assertions для weight_coef trigger — checksum approach или full BoQ comparison?

---

### Sub-plan B: §12 Operational Readiness Gate

**Goal:** Pre-pilot M-13 ops requirements: DR procedures, RTO/RPO targets, SLO definition, load tests, runbooks.

**Why:** Memory zero_drift_section10_state: "§12 Operational Readiness gate — отдельный план". Pilot M-13 sign-off requires ops readiness.

**Scope:**
- Disaster Recovery runbook (Postgres backup + restore drill)
- RTO ≤ 4h, RPO ≤ 15min targets — verify achievable
- SLO catalog (API latency p95, BullMQ job processing, sync conflict resolution)
- Load test scenarios (period close для 1000-item BoQ, sync с 100 mobile users, dispute storm)
- Oncall runbooks (Auth failures, DB connection pool exhaustion, SLA worker stuck job)

**Findings closed indirect:** F-006 (k8s — depends on Sub-plan C), ADR-005 reliability invariants, X-11.

**Primary agent:** ccip-devops
**Co-agents:** ccip-dba (backup/restore), ccip-qa (load tests), ccip-security (incident response)

**Estimated effort:** 4–6 dev-days.

**Brainstorming questions:**
1. SLO target source — concept_oks_v1_5.md commitments, или новые targets?
2. Load test tool: k6, Artillery, или Locust?
3. Backup retention: 7d daily + 4w weekly + 12m monthly enough?

---

### Sub-plan C: M-12 K8s Scaffold

**Goal:** Создать `infra/k8s/` с production-ready manifests, включая ADR-005 SLA worker (replicas:1, strategy:Recreate).

**Why:** Closes F-006 (infra/k8s missing) + X-11 (ADR-005 unenforceable). Unblocks Sub-plan B (load tests) и pilot M-13.

**Scope:**
- `infra/k8s/base/` — common deployments, services, configmaps
- `infra/k8s/overlays/dev/`, `infra/k8s/overlays/staging/`, `infra/k8s/overlays/prod/` (Kustomize)
- SLA worker deployment с invariants: `replicas: 1`, `strategy: { type: Recreate }`
- API deployment (rolling update, HPA)
- Postgres deployment / StatefulSet (или managed RDS reference)
- Redis с AOF (StatefulSet + PVC)
- Ingress + TLS (cert-manager reference)

**Findings closed:** F-006, X-11 (machine-enforced ADR-005), partial ADR-005/008/014 deployment context.

**Primary agent:** ccip-devops
**Co-agents:** ccip-architect (ADR-005 enforcement validation), ccip-security (Secrets management)

**Estimated effort:** 2–3 dev-days.

---

### Sub-plan D: M-M Mobile App Scaffold

**Goal:** Создать `apps/mobile/` (React Native + WatermelonDB) с базовой структурой; реализовать ADR-008 (WatermelonDB) и ADR-014 (push notifications) ground truth.

**Why:** Closes F-005 (apps/mobile missing); делает ADR-008/014 не orphan; разрешает ccip-mobile agent работать на реальной цели.

**Scope:**
- Expo + React Native setup
- WatermelonDB schema (mirror server's domain entities)
- Offline queue для sync operations
- Photo capture с geotag + EXIF retention (compliance)
- Push notification handler (DeviceToken model уже в schema.prisma)
- Sync controller (HTTP polling/long-poll)

**Findings closed:** F-005, partial ADR-013/014 orphan reduction.

**Primary agent:** ccip-mobile
**Co-agents:** ccip-backend-aux (sync API contract), ccip-architect (offline-first architecture validation)

**Estimated effort:** 5–10 dev-days (полная имплементация — намного больше, scaffold — 5–10).

**Brainstorming questions:**
1. Expo managed vs bare workflow?
2. WatermelonDB schema generation: manual mirror, или introspect от Prisma?
3. Push: FCM + APNS direct, или через unified service?

---

### Sub-plan E: RLS Fuzz Suite (T-R-004)

**Goal:** Runtime tests для multi-tenancy isolation; RLS policies fuzz testing.

**Why:** Memory zero_drift_section10_state: "RLS fuzz (T-R-004) + AuditLog partman rotation — описаны как stub в T-22/T-23, ушли в план `2026-05-XX-rls-fuzz-and-auditlog-rotation.md`". X-6 (cross-tenant DAG leak) частично зависит от RLS verification.

**Scope:**
- pgTAP RLS policy assertions (для каждой tenant-scoped таблицы)
- Fuzz: создать N users в M tenants, attempt cross-tenant access через каждый endpoint
- Property-based test: invariant `count(rows visible to user U in tenant T) == count(rows where row.tenant_id == T)`
- Integration с CI db-integration job

**Findings closed:** T-R-004 from audit §5.6, X-6 (cross-tenant verification).

**Primary agent:** ccip-qa
**Co-agents:** ccip-security (RLS policy review), ccip-dba (pgTAP setup)

**Estimated effort:** 2–3 dev-days.

---

### Sub-plan F: Concurrent Hook Write-Lock

**Goal:** Hard guarantee против lost observations при параллельных Agent calls (X-1).

**Why:** Current `post-agent-hook.js` использует tmp + fsync + renameSync, что атомарно для single write но НЕ предотвращает race при двух concurrent hook invocations: оба читают state, оба пишут — последний wins.

**Scope:**
- Advisory file lock (через `proper-lockfile` или native `flock`-equivalent на Windows)
- Retry loop с jitter (5-10 attempts, ~50ms each)
- Lock timeout: 2s max; на timeout — log warning в stderr, skip write (не блокировать parent session)
- Integration test: 20 concurrent hook invocations → `observations.length == 20`

**Findings closed:** X-1 hard guarantee.

**Primary agent:** ccip-backend-core (runtime engineering)
**Co-agents:** ccip-qa (concurrency test design)

**Estimated effort:** 1–2 dev-days.

---

## 7. Self-Review (skill-required)

Проверка плана против spec (`docs/audits/multi-agent-ecosystem-2026-05-07.md`):

**1. Spec coverage:**
- F-001..F-027 — все 27 findings ✓ (§0.1–§0.4, статус каждого зафиксирован).
- X-1..X-12 — все 12 hidden risks ✓ (§0.5).
- B-1..B-4, C-1..C-7, H-1..H-7, M-1..M-6, L-1..L-2 remediation backlog (§11 аудита) — покрыто mapping в §0.1-0.4 (каждый F-NNN линкует на B/C/H/M/L item).
- Validation strategy §5 (T-V-001..T-V-010, T-A-001..T-A-005 итд) — закрыто audit-suite §10 (17 checks); residual specifically: T-R-004 → Sub-plan E.
- CI Enforcement §6 — закрыто (ci.yml, nightly-audit.yml, portable-clone.yml, weekly-orphan-scan.yml).
- §7 Risk Heatmap — addressed в §0.5 mapping.
- §13 Production Readiness verdict — план обеспечивает path к conditional GO post-Sub-plan A+B+C.

**Gaps identified after spec re-read:**
- Audit §6.4 ADR Linting (AL-1..AL-5) — частично закрыто ADR-IMMUT audit check; AL-4 (Reviewer human-name) — convention-only, не machine-enforceable. Не критично.
- Audit §6.5 Context Integrity (CI-1..CI-5) — закрыто (PATH-CANON, SECTION-ANCHOR, etc.).
- Audit §6.6 Orchestration Graph (OG-1..OG-4) — OG-1/OG-2 (planner JSON schema) — поскольку planner JSON исключён из flow per Red Team R-001, неактуально. OG-3 (hook accepts both formats) — закрыто by design. OG-4 (DAG cycle detection) — verify execute-dag.js (не в scope, runtime feature).
- Audit §6.7 Stale Reference Detectors (SR-1..SR-4) — закрыто (weekly-orphan-scan.yml + nightly-audit.yml).
- Audit §6.8 Runtime Assertions (RA-1..RA-5) — RA-1/RA-2 закрыты (portable ROOT, atomic write); RA-3 (initialize-session) — by design no-op per R-001; RA-4/RA-5 (logging) — verify но low priority.

**2. Placeholder scan:**
- Нет "TBD", "TODO", "implement later" в Tier 1 task steps.
- Conditional steps (Task 2 Step 2.2, Task 3 Step 3.6, Task 4 Steps 4.1/4.3) явно помечены `(conditional)` с criteria.
- Sub-plan stubs (Tier 2) явно помечены как "требуют отдельной сессии" — это **намеренно** не task-decomposable inline.

**3. Type consistency:**
- Все file paths абсолютные относительно repo root.
- Commit subjects следуют conventional format (fix/chore/docs/feat + scope + "closes F-XXX").
- `closes T-NN` vs `closes F-NNN` — корректное использование (T-NN для tasks из delivery, F-NNN для audit findings).
- ALLOWLIST формат в Task 1 Step 1.4 совпадает с текущим `tools/audit/path-canonical.js` структурой.

**4. Estimated overall effort:** Tier 1 — ≤ 1 dev-day. Tier 2 — 17–29 dev-days suma (но parallelizable, не critical path для T-22).

---

## 8. Execution Handoff

Plan complete и saved to `docs/plans/2026-05-17-multi-agent-ecosystem-residual-remediation.md`.

**Tier 1** (4 tasks) — готов к execution. Два варианта:

**1. Subagent-Driven (recommended для multi-domain tasks)** — fresh ccip-* subagent per task, review между tasks, fast iteration. Routing:
- Task 1 → ccip-devops (settings.json, ALLOWLIST)
- Task 2 → ccip-security (own frontmatter)
- Task 3 → ccip-doc-writer (delivery docs) + optional ccip-architect (ADR-015 decision)
- Task 4 → ccip-claude-md-auditor (self-spot-check) или general-purpose

**2. Inline Execution** — последовательно в текущей сессии через `superpowers:executing-plans`. Подходит если хочется держать context в одном месте.

**Tier 2** sub-plans (A–F) — каждый требует **отдельной** brainstorming + writing-plans сессии. Рекомендуемый порядок приоритизации:
- **Перед M-13 pilot (mandatory):** A (§11 correctness) + B (§12 ops) + C (K8s scaffold) + E (RLS fuzz)
- **Не блокирует M-13 pilot:** D (Mobile — post-pilot per delivery plan) + F (concurrent hook lock — quality-of-life)

**Which approach for Tier 1?**
