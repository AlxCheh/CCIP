# Multi-Agent Ecosystem Audit — 2026-05-07

> **Audit ID:** AUDIT-2026-05-07-A
> **Scope:** `.claude/agents/*` (18 файлов), `.claude/runtime/*`, `.claude/settings*.json`, `CLAUDE.md`, `docs/tasks/*`, `docs/decisions/*`, `packages/database/prisma/schema.prisma`, `apps/`, `infra/`
> **Mode:** Staff Reliability + AI Governance (zero-trust, ruthless-precision)
> **Verdict:** **NOT PRODUCTION-READY — 4 BLOCKERS, 7 CRITICAL, 7 HIGH, 6 MEDIUM, 3 LOW**
> **Status:** Open (требует remediation sprint B-1..B-4 + C-1..C-7)

---

## 0. Executive Summary

Заявленная архитектура multi-agent системы CCIP имеет **существенный дрейф между документированными контрактами и фактическим состоянием репозитория**. Identified four BLOCKER-class defects и семь CRITICAL — каждый из них сам по себе достаточен, чтобы отказать в production sign-off.

Системные паттерны деградации:
1. **Path drift** — 3 разных схемы путей (`CCIP/...`, `docs/...`, абсолютный `W:/Claude/CCIP/...`) сосуществуют без нормализации.
2. **Phantom contract** — agent-файлы массово ссылаются на «State Contract (§15)» при фактическом отсутствии §15 в `CLAUDE.md`. Раздел `## State Update` обрабатывается hook-ом, но входной канал (`session-state.json`) на момент аудита не инициализирован.
3. **Routing gap** — 8 из 18 субагентов отсутствуют в `CLAUDE.md` Intent → Agent таблице; маршрутизация к ним возможна только через прямое указание имени, что нарушает Fast Path.
4. **Schema/agent semantic divergence** — `security-reviewer.md §RBAC matrix` оперирует ролями (`supervisor`, `contractor`), которых **нет** в `enum UserRole` (`schema.prisma:31`). Это означает, что security-co-agent одобрит код с несуществующими ролями.
5. **Non-portable infrastructure** — `.claude/settings.json` содержит абсолютный Windows-путь к hook-скрипту; вся pipeline сломается на любом другом узле.

Pre-pilot risk: при текущем состоянии **запуск пилота M-13 невозможен**, т.к. цепочка `M-12 (infra/k8s/) → M-13` упирается в отсутствующий каталог; `M-M (apps/mobile/)` не имеет цели для имплементации.

---

## 1. Discovery Inventory

| Категория | Найдено | Путь |
|---|---|---|
| Agent definitions | 18 | `.claude/agents/*.md` |
| Runtime artefacts | 5 | `.claude/runtime/{session-state.json, post-agent-hook.js, flush-state.js, execute-dag.js, state-protocol.md}` |
| Settings | 2 | `.claude/settings.json`, `.claude/settings.local.json` |
| Orchestration core | 1 | `CLAUDE.md` (root) |
| Task routing | 10 | `docs/tasks/*.md` |
| ADRs | 14 + index + guide | `docs/decisions/ADR-001..ADR-014` |
| Architecture docs | 14 | `docs/architecture/*.md` + `architecture_v1_0.md` |
| Error registries | 8 | `docs/errors/*.md` |
| Delivery docs | 5 | `docs/delivery/*.md` + `delivery_plan_v1_0.md` |
| Application code | apps/api, apps/web | `apps/api/src/modules/{period,analytics,dispute,sync,zero-report,baseline,admin,objects}/` |
| Database | 1 | `packages/database/prisma/schema.prisma` (28 models, 1 enum) |
| Infrastructure | 1 file | `infra/docker/docker-compose.yml` |
| **Orphan / suspicious** | 3 | `frontend/` (empty), `the roles of subagents/role_06_dba_subagent.md`, `.agents/skills/frontend-design/` |
| **Missing (но referenced)** | 5 | `apps/mobile/`, `infra/k8s/`, `docs/errors_log.md`, `docs/feedback-loop.md`, `docs/proposed-claude-md-changes.md` |

---

## 2. Extracted Assertions

```
A-001  ccip-architect "проверяет соответствие принятым ADR-001..ADR-014"        →  CLAUDE.md/agents/ccip-architect.md:14
A-002  All-agents-state-contract "Input — читать из session-state.json (§15)"   →  10 агентов
A-003  ccip-mobile "Приложение: apps/mobile/"                                   →  ccip-mobile.md:11
A-004  ccip-devops "Kubernetes (этап 12): production манифесты, infra/k8s/"     →  ccip-devops.md:15
A-005  ccip-architect "Все противоречия фиксировать в docs/errors_log.md"       →  ccip-architect.md:32,37
A-006  ccip-routing-planner "agent status из docs/feedback-loop.md"             →  ccip-routing-planner.md:38
A-007  ccip-claude-md-auditor "записать в docs/proposed-claude-md-changes.md"   →  ccip-claude-md-auditor.md:139
A-008  security-reviewer RBAC: director|supervisor|contractor|admin             →  security-reviewer.md:75-78
A-009  Hook PostToolUse → post-agent-hook.js path W:/Claude/CCIP/...            →  .claude/settings.json:9
A-010  state-protocol "atomic tmp→rename"                                       →  state-protocol.md:130
A-011  CLAUDE.md Intent → Agent table = 10 ролей                                →  CLAUDE.md
A-012  ccip-claude-md-auditor: git log -- CCIP/docs/decisions/                  →  ccip-claude-md-auditor.md:21-26
A-013  ccip-backend-aux RBAC: admin, director, stroycontrol, engineer + ГП      →  ccip-backend-aux.md:29-33
A-014  ccip-routing-planner returns JSON plan                                   →  ccip-routing-planner.md:42-79
A-015  Memory M-05b "apps/api/src/modules/dispute-sla/ зарезервирован"          →  MEMORY.md
A-016  ADR-009: roles admin, director, stroycontrol, engineer                   →  ADR-009-rbac-gp-token.md:10
A-017  ccip-architect "tools: Read, Write, Edit, Glob, Grep, Bash"              →  ccip-architect.md:4
A-018  Hook expects parent of __dirname to contain CCIP/ subdir                 →  post-agent-hook.js:19-20
```

---

## 3. Findings (machine-readable)

| ID | Severity | Assertion | Reality | Evidence | Blast Radius |
|----|----------|-----------|---------|----------|--------------|
| **F-001** | **BLOCKER** | A-008: security-reviewer проверяет RBAC по `supervisor`/`contractor` | `enum UserRole = admin,director,stroycontrol,engineer` (`schema.prisma:31-38`) — `supervisor`/`contractor` отсутствуют | `Grep supervisor\|contractor schema.prisma → 0 matches` | Security review одобрит код с несуществующими ролями; cross-tenant escalation риск при production |
| **F-002** | **BLOCKER** | A-009: hook путь | `command: "node W:/Claude/CCIP/.claude/runtime/post-agent-hook.js"` — абсолютный Windows-путь | `.claude/settings.json:9` | Любой clone на другую машину/OS = полная деградация state-protocol; CI невозможен |
| **F-003** | **BLOCKER** | A-002: 10 агентов ссылаются на `State Contract (§15)` | В `CLAUDE.md` нет раздела §15 | `Grep §15\|State Contract CLAUDE.md → 0 matches` | Все агенты, читающие "(§15)", получают broken cross-reference; контракт неизвестен |
| **F-004** | **BLOCKER** | session-state.json как primary input для всех агентов | Файл существует, но `session_id=""`, `task=""`, `intents=[]`, `agent_outputs={}` — uninitialised | `.claude/runtime/session-state.json:1-12` | Все State Contract assertions работают вхолостую; handoff_notes никогда не передаётся |
| **F-005** | CRITICAL | A-003: `apps/mobile/` существует | `Test-Path apps/mobile = MISSING` | Bash verification | `ccip-mobile` не имеет цели; M-M unimplementable; ADR-008/ADR-014 — orphan |
| **F-006** | CRITICAL | A-004: `infra/k8s/` существует | `Test-Path infra/k8s = MISSING` (есть только `infra/docker/docker-compose.yml`) | Bash verification | M-12 phase blocked; pilot M-13 невозможен |
| **F-007** | CRITICAL | A-007: `docs/proposed-claude-md-changes.md` существует | MISSING | Bash verification | Self-modification guard в ccip-claude-md-auditor — теоретическая защита; блокировка автоизменений CLAUDE.md не работает |
| **F-008** | CRITICAL | A-005: `docs/errors_log.md` корректный путь | Реальный путь `docs/errors/errors_log.md`. 6 агентов используют WRONG path: ccip-architect:32,37; ccip-product-owner:33,38; ccip-routing-planner:100; ccip-claude-md-auditor:95,127,148; ccip-doc-writer:54; ccip-session-optimizer:125 | Grep section 5 (см. §9) | Запись об ошибках уйдёт в неверный файл; consistency-checker ищет в правильном — данные сегментированы |
| **F-009** | CRITICAL | A-006: `docs/feedback-loop.md` корректный путь | Реальный путь `docs/tasks/feedback-loop.md`. ccip-routing-planner.md:38,87,88 + general-purpose.md:16,17 используют wrong path | Grep section 5 | Routing planner не сможет прочитать agent status (DEGRADED/SUSPENDED); fallback-логика deactivated |
| **F-010** | CRITICAL | A-011: Intent table покрывает агентов | 10 строк в таблице, 18 файлов агентов. Без записи: ccip-product-owner, ccip-routing-planner, ccip-claude-md-auditor, ccip-navigator-optimizer, ccip-session-optimizer, consistency-checker | CLAUDE.md Intent → Agent → Backup table | ccip-product-owner unreachable; «automatic» агенты не имеют machine-trigger; PO задачи теряются |
| **F-011** | CRITICAL | A-018: hook portable | `post-agent-hook.js:19-20`: ROOT-вычисление assumes parent-of-`.claude` = directory named `CCIP` | Read of post-agent-hook.js | Hook молча fails (silent error — `catch { }` line 91), state не обновляется |
| **F-012** | HIGH | A-014 vs hook parser: planner возвращает JSON, hook ищет `## State Update` Markdown | `post-agent-hook.js:62-74` regex для planner output без markdown-блока fallback `summary = "<agent> completed (no structured block)"` | Read of post-agent-hook.js | План DAG не сохраняется в state; downstream агенты получают пустой `agent_outputs[ccip-routing-planner]` |
| **F-013** | HIGH | A-010: `flush-state.js` атомарен | `state-protocol.md:130` claims tmp→rename. Реализация в `post-agent-hook.js:30` — `fs.writeFileSync` (NOT atomic) | Read of files | Concurrent agent runs или crash → corrupt JSON; broken sessions |
| **F-014** | HIGH | A-012: ccip-claude-md-auditor git paths корректны | `git log --since=… -- CCIP/...` пути работают только если CWD = parent_of_CCIP | ccip-claude-md-auditor.md:21-26 | Auditor либо ничего не находит, либо ошибочно сообщает "no changes — skip"; drift накапливается |
| **F-015** | HIGH | A-015 vs filesystem: dispute path | Memory: `apps/api/src/modules/dispute-sla/ зарезервирован`. Filesystem: `apps/api/src/modules/dispute/dispute.manifest.md` (already exists) | Bash verification + Glob | M-05b может стартовать в неверном модуле, дублируя работу |
| **F-016** | HIGH | ccip-security frontmatter complete | Нет `model:` поля; нет секции `## State Contract` | ccip-security.md:1-5 | Несовместимость с PostToolUse hook → не пишет handoff_notes; immutability/RBAC findings не propagate |
| **F-017** | HIGH | C-004 (Red Team): SLA-worker phantom path | `apps/api/src/sla-scheduler/sla-scheduler.module.ts` задокументирован в delivery, директория не существует | red-team-2026-05-07.md:33-36 | M-05b SLA worker без resolved canonical path; cross-team конфликт |
| **F-018** | HIGH | atomic write для observations | `state-protocol.md:131` — "сбрасывает observations[] через атомарный tmp→rename"; `flush-state.js` не верифицирован | state-protocol.md vs flush-state.js | Same as F-013 risk; observations partial flush |
| **F-019** | MEDIUM | `infra/docker/docker-compose.yml` referenced as `docker-compose.yml` | ccip-devops описывает корневой; реальный — в `infra/docker/`. Также упоминается `infra/k8s/` (отсутствует) | Glob | DevOps задача может создать дубликат |
| **F-020** | MEDIUM | `frontend/` directory orphan | `frontend/src/{components,hooks,pages,services,store}` — все пусты | Bash listing | Frontend агент рискует писать в `frontend/` вместо `apps/web/` |
| **F-021** | MEDIUM | `the roles of subagents/role_06_dba_subagent.md` orphan | Legacy file без отношения к текущей структуре | Glob | Stale ref может быть процитирован |
| **F-022** | MEDIUM | `.agents/skills/frontend-design/` orphan | Это claude-superpowers skill, не CCIP — collision risk имени | Glob | Совпадение имён `.agents` ↔ `.claude/agents` |
| **F-023** | MEDIUM | settings.local.json permissions узок | Allow только `git add *`, `git commit -m ' *` | settings.local.json | Большинство Bash вызовов hit prompt — operational friction |
| **F-024** | MEDIUM | CI/CD конфигов нет | `.github/` существует, но workflows для agent linting не проверены | Bash listing | Drift детектируется только ручным аудитом |
| **F-025** | LOW | tool declarations inconsistent | ccip-product-owner / ccip-doc-writer / ccip-routing-planner / ccip-session-optimizer без Bash; consistency-checker и security-reviewer только Read/Glob/Grep — корректный read-only паттерн | All agent frontmatter | Минимальная путаница |
| **F-026** | LOW | model-field inconsistent | ccip-doc-writer / ccip-claude-md-auditor / consistency-checker — haiku. ccip-security — без model. Остальные — sonnet-4-6 | All agent frontmatter | Performance/cost разница |
| **F-027** | LOW | CLAUDE.md cosmetic refs | `(see Multi-intent §)`, `(see Risk Rules)` — текстовые ссылки без anchor | CLAUDE.md inline | Минорно для readability |

---

## 4. Severity Distribution

| Severity | Count | IDs |
|---|---|---|
| **BLOCKER** | 4 | F-001, F-002, F-003, F-004 |
| **CRITICAL** | 7 | F-005, F-006, F-007, F-008, F-009, F-010, F-011 |
| **HIGH** | 7 | F-012, F-013, F-014, F-015, F-016, F-017, F-018 |
| **MEDIUM** | 6 | F-019, F-020, F-021, F-022, F-023, F-024 |
| **LOW** | 3 | F-025, F-026, F-027 |

---

## 5. Validation Strategy (regression suite)

### 5.1 Unit validation (Jest / Node-script)
```
T-V-001  agent-frontmatter-schema.test.js     →  каждый .claude/agents/*.md имеет name/description/tools, парсится YAML
T-V-002  agent-tools-allowlist.test.js        →  tools field — подмножество [Read,Write,Edit,Glob,Grep,Bash]
T-V-003  agent-paths-exist.test.js            →  все пути из markdown агентов резолвятся
T-V-004  state-update-block-extraction.test   →  smoke: extractStructured(text)
T-V-005  hook-payload-resolution.test.js      →  resolveAgent(payload) по 18 именам
T-V-006  rbac-roles-vs-schema.test.js         →  fail если в любом agent.md встречаются роли вне {admin,director,stroycontrol,engineer}
T-V-007  claude-md-section-anchors.test.js    →  каждый "(§N)" ref в agent.md существует в CLAUDE.md
T-V-008  intent-table-coverage.test.js        →  каждый файл в .claude/agents/ упомянут
T-V-009  errors-log-path-canonical.test.js    →  fail если встречается `docs/errors_log.md` (без `errors/`)
T-V-010  feedback-loop-path-canonical.test.js →  fail если встречается `docs/feedback-loop.md` (без `tasks/`)
```

### 5.2 ADR consistency
```
T-A-001  adr-numbering-contiguous.test.js     →  ADR-001..ADR-014 без пропусков
T-A-002  adr-references-resolve.test.js       →  каждое упоминание ADR-NNN резолвится
T-A-003  adr-009-roles-match-schema.test.js   →  ADR-009 §RBAC список == enum UserRole
T-A-004  adr-007-immutability-revoke.test.js  →  миграция содержит REVOKE UPDATE,DELETE ON period_work_items
T-A-005  adr-005-sla-worker-replicas.test.js  →  k8s manifest для sla-worker имеет replicas:1 + strategy: Recreate
```

### 5.3 Context integrity
```
T-C-001  context-policy-tlevels.test.js       →  T1..T4 соответствуют agent-decl
T-C-002  bounded-context-deps-dag.test.js     →  никаких циклов в DAG
T-C-003  document-routing-paths.test.js       →  все пути CLAUDE.md "Document Routing" существуют
T-C-004  state-protocol-fields.test.js        →  session-state.json имеет все обязательные поля
T-C-005  session-state-init-after-flush.test  →  после flush observations[]=[]
```

### 5.4 Orchestration path
```
T-O-001  routing-contract-completeness.test
T-O-002  intent-resolves-to-agent.test.js
T-O-003  module-id-coverage.test.js           →  M-01..M-13 + M-M все имеют primary_agent
T-O-004  co-agent-graph-acyclic.test.js
T-O-005  fast-path-no-planner.test.js
T-O-006  planner-intents-threshold.test.js
T-O-007  hook-firing-on-agent-call.test.js    →  E2E: вызов Agent → hook updates state
```

### 5.5 Dead reference detectors
```
T-D-001  dead-paths-in-agents.scan.js
T-D-002  dead-paths-in-docs.scan.js
T-D-003  orphan-directories.scan.js           →  фиксирует frontend/, the roles of subagents/, infra/k8s/
T-D-004  orphan-agent-files.scan.js
T-D-005  orphan-docs.scan.js
```

### 5.6 Runtime simulation (E2E)
```
T-R-001  e2e-agent-call-state-update.test     →  spawn Claude Code → state[agent_outputs.X].summary != ""
T-R-002  e2e-stop-hook-flush.test
T-R-003  e2e-portable-hook.test               →  hook работает при clone в директорию НЕ-CCIP
T-R-004  e2e-rbac-roles-match.test            →  spawn security-reviewer на роль='supervisor', expect verdict=BLOCK
T-R-005  e2e-handoff-injection.test
```

### 5.7 Prompt inheritance
```
T-P-001  agents-system-prompt-format.test
T-P-002  prompt-injection-sanitization.test
T-P-003  state-update-block-required.test
```

### 5.8 Dependency drift
```
T-DR-01  schema-prisma-vs-arch-data-layer
T-DR-02  agent-adr-references-vs-index
T-DR-03  delivery-paths-vs-actual-modules
```

---

## 6. CI Enforcement Recommendations

### 6.1 GitHub Actions (`.github/workflows/agent-audit.yml`)
```yaml
name: agent-audit
on:
  pull_request:
    paths:
      - '.claude/agents/**'
      - 'CLAUDE.md'
      - 'docs/decisions/**'
      - 'docs/tasks/**'
      - 'packages/database/prisma/schema.prisma'
  schedule:
    - cron: '0 5 * * *'
jobs:
  agent-validation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: pnpm install
      - run: node tools/audit/agent-frontmatter.js
      - run: node tools/audit/path-resolver.js
      - run: node tools/audit/rbac-vs-schema.js          # FAILS BUILD if security-reviewer mentions role not in schema.prisma
      - run: node tools/audit/intent-coverage.js
      - run: node tools/audit/dead-refs.js
      - run: node tools/audit/cross-doc-anchors.js
```

### 6.2 Pre-commit hook (`.husky/pre-commit`)
```sh
#!/usr/bin/env sh
if git diff --cached --name-only | grep -qE '\.claude/agents/.*\.md$|^CLAUDE\.md$'; then
  node tools/audit/path-canonical.js --staged
  node tools/audit/section-anchors.js --staged
fi
```

### 6.3 Schema enforcement rules
```
SE-1  enum UserRole in schema.prisma — единственный источник ролей.
SE-2  Любое упоминание role-имени в .claude/agents/ ИЛИ docs/decisions/ ДОЛЖНО быть в этом enum (исключение: ГП — только UI-флаг).
SE-3  Изменение enum UserRole требует:
        a) обновления security-reviewer.md §RBAC
        b) обновления ADR-009 §RBAC-декораторы
        c) обновления ccip-backend-aux.md §RBAC матрица
SE-4  CI gate: schema-change → block merge без security-reviewer ACK.
```

### 6.4 ADR linting
```
AL-1  Каждый ADR-NNN.md имеет: Status, Date, Deciders, Context, Decision, Consequences
AL-2  ADR-NNN не редактируется после Status: Accepted (CODEOWNERS + PR gate)
AL-3  Новый ADR обязан обновить decisions/index.md + bounded-context-deps.md
AL-4  Ретроспективный ADR: `Supersedes: ADR-MMM` + `Reviewer: <human-name>`
AL-5  ADR risk-tag (R-NN) — единый реестр (TODO: docs/decisions/risks.md)
```

### 6.5 Context integrity policies
```
CI-1  L-уровни (CLAUDE.md) и T-уровни (context-policy.md) — одно primary; второе ссылается. ccip-navigator-optimizer мониторит drift.
CI-2  «Sources of context» в agent.md — пути проходят T-V-003.
CI-3  Любая «§N» отсылка резолвится (T-V-007).
CI-4  errors_log canonical = `docs/errors/errors_log.md` (T-V-009).
CI-5  feedback-loop canonical = `docs/tasks/feedback-loop.md` (T-V-010).
```

### 6.6 Orchestration graph validators
```
OG-1  Routing contract — formal grammar; routing валиден ⇔ все required-поля resolved.
OG-2  ccip-routing-planner output JSON validates against schema (publish docs/schemas/execution-plan.schema.json).
OG-3  hook PostToolUse parser принимает оба формата: `## State Update` markdown И top-level JSON.
OG-4  DAG cycle detection: для каждого agent-handoff §3 — depended_by-graph не имеет циклов.
```

### 6.7 Stale reference detectors
```
SR-1  weekly cron: scan repo за orphan dirs
SR-2  pre-merge: новый файл в .claude/agents/ без записи в Intent table → block
SR-3  monthly: scan agent.md за упоминания версий против actual files
SR-4  ADR Status=Deprecated — отметка в decisions/index.md и в каждом цитировавшем agent.md
```

### 6.8 Mandatory runtime assertions
```
RA-1  hook path в settings.json — относительный; ROOT через git rev-parse --show-toplevel
RA-2  hook writeState — atomic: tmp file + fs.renameSync (consistent с state-protocol.md)
RA-3  hook стартует с initialize-session: если session_id="" — заполнить
RA-4  flush-state.js логирует success/skip в stderr → попадает в Stop-output
RA-5  Любое неполученное handoff_notes ≥ 2 раза подряд — emit warning в errors_log
```

---

## 7. Risk Heatmap

```
                  Reproducibility   Auditability   Functional    Security
BLOCKER  F-001    -                 -              -             ███████  (cross-tenant role bypass)
BLOCKER  F-002    ███████           ██             ██            ██       (CI broken on non-Win)
BLOCKER  F-003    ██                ███████        ███           ██       (broken cross-refs)
BLOCKER  F-004    ███████           ███████        ███████       █        (state never engaged)
CRITICAL F-005    █                 ██             ███████       █        (mobile blocked)
CRITICAL F-006    █                 ██             ███████       █        (k8s blocked)
CRITICAL F-007    ██                ███████        ██            █        (auto-modify guard absent)
CRITICAL F-008    ███               ███████        █             █        (errors_log split)
CRITICAL F-009    ██                ████           █             █        (feedback-loop split)
CRITICAL F-010    █                 █████          █████         █        (PO unreachable)
CRITICAL F-011    ██████            ██             ██            █        (hook NOT portable)
HIGH     F-012-F-018 (см. §3)
```

---

## 8. Dependency Graph Summary (declared vs actual)

```
DECLARED                                          ACTUAL
agents/* ─→ session-state.json ─→ flush-state    agents → session-state (uninitialised) → flush rare
agents/* ─→ docs/errors_log.md                   agents → docs/errors_log.md  ← MISSING
ccip-mobile ─→ apps/mobile/                      ccip-mobile → ∅
ccip-devops ─→ infra/k8s/                        ccip-devops → ∅ (есть только infra/docker/)
ccip-routing-planner ─→ docs/feedback-loop.md    planner → docs/feedback-loop.md ← MISSING
ccip-claude-md-auditor ─→ proposed-changes.md    auditor → ∅
ccip-product-owner ─→ Intent table               PO → ∅ (no row)
security-reviewer.RBAC ─→ schema.prisma roles    reviewer.RBAC ⊥ schema.prisma (mismatch)
hook ─→ /CCIP/.claude/runtime/...                hook → assumes parent dir literally named CCIP
```

---

## 9. Context Integrity Matrix

| Agent | Reads (claimed) | Reads (verified) | Writes (claimed) | Writes (verified) |
|---|---|---|---|---|
| ccip-architect | architecture_v1_0.md, architecture/*, decisions/*, errors_log.md | OK except `errors_log.md` (wrong path) | architecture/*, decisions/*, errors_log.md | broken to wrong path |
| ccip-backend-core | algorithm_v1_3.md, period-engine.md, schema.prisma | OK | apps/api/src/* | OK |
| ccip-backend-aux | auth-security.md, sync-engine.md, ADR-009/012, schema.prisma | OK | apps/api/src/auth/, sync/ | OK |
| ccip-dba | schema.prisma, data-layer.md, ADR-001/004/010 | OK | schema.prisma, migrations/* | OK |
| ccip-frontend | concept_oks_v1_5.md, core-platform.md, algorithm_v1_3.md | OK | apps/web/src/* | OK |
| ccip-mobile | sync-engine.md, ADR-003/008/014, concept_oks_v1_5.md | OK (docs OK) | apps/mobile/src/* | **DEAD: no apps/mobile/** |
| ccip-devops | ADR-001/005, phase-8-13, architecture_v1_0.md | OK | infra/k8s/, docker-compose.yml | **DEAD: infra/k8s/ missing**; docker-compose.yml в `infra/docker/` |
| ccip-qa | algorithm_v1_3.md Part 4, ADR-002/003/007, phase-8-13 | OK | tests/* | OK |
| ccip-security | ADR-007/009/010/012, auth-security.md | OK | (no writes — frontmatter без State Contract) | N/A |
| ccip-product-owner | concept_oks_v1_5.md, algorithm_v1_3.md, delivery_plan_v1_0.md, errors_log.md | OK except errors_log.md | docs/* | broken-path |
| ccip-doc-writer | docs/, CLAUDE.md, errors_log.md | OK except errors_log.md | docs/* | broken-path |
| ccip-routing-planner | CLAUDE.md, project-state.md, tasks/index.md, **docs/feedback-loop.md** | DEAD (real: docs/tasks/feedback-loop.md) | (no writes) | N/A |
| ccip-claude-md-auditor | CLAUDE.md, .claude/agents/*, decisions/, delivery/, architecture/, **proposed-changes.md** | OK except proposed-changes (missing) | CLAUDE.md (limited), errors_log, proposed-changes | proposed-changes target missing |
| ccip-navigator-optimizer | CLAUDE.md §3-6, tasks/index.md, decisions/index.md, errors/errors_log.md | OK | CLAUDE.md (limited), tasks/index.md, errors_log | OK |
| ccip-session-optimizer | (only in-session history) | OK | docs/errors_log.md | broken-path |
| consistency-checker | architecture/, decisions/, schema.prisma, errors/errors_log.md | OK | docs/errors/errors_log.md | OK |
| security-reviewer | (только полученные artifacts) | OK | (no writes) | N/A |
| general-purpose | session-state.json, errors/errors_log.md | OK | * | OK |

---

## 10. ADR Compliance Matrix

| ADR | Cited by agents | Cited correctly | Schema-compliant | Code-compliant |
|---|---|---|---|---|
| ADR-001 NestJS+Prisma | architect, dba, devops | ✓ | ✓ | ✓ |
| ADR-002 advisory locks | architect, backend-core | ✓ (md5 formula corrected per Red Team) | ✓ | unverified at runtime |
| ADR-003 conflict resolution | mobile, qa, backend-aux | ✓ | n/a | unverified |
| ADR-004 MV staleness | architect, backend-core, dba | ✓ | ✓ | ✓ (mv-staleness.service.ts) |
| ADR-005 SLA worker reliability | architect, backend-core, devops | ✓ | n/a | ⚠ infra/k8s/ missing → unenforceable |
| ADR-006 BoQ versioning | backend-core | ✓ | ✓ | ✓ |
| ADR-007 period immutability | architect, backend-core, dba, security | ✓ | ✓ | ⚠ unverified REVOKE in migrations |
| ADR-008 WatermelonDB | mobile | ✓ | n/a | ⚠ apps/mobile/ missing |
| ADR-009 RBAC + GP token | backend-aux, security | ✓ in source list, **WRONG roles in security-reviewer.md** | ✓ schema enum aligns | partial (apps/api/src/common/guards/) |
| ADR-010 audit_log partitioning | backend-aux, dba, security | ✓ | ✓ AuditLog model | unverified pg_partman |
| ADR-011 analytics precomputation | backend-core, dba | ✓ | ✓ | ✓ (analytics module) |
| ADR-012 multi-tenancy | architect, backend-aux, security | ✓ | ✓ (tenant_id widely) | unverified RLS |
| ADR-013 PDF reports | (not cited) | ⚠ ORPHAN | n/a | unverified |
| ADR-014 push notifications | backend-aux, mobile | ✓ | ✓ DeviceToken model | ⚠ apps/mobile/ missing |

---

## 11. Required Remediation Backlog

```
[BLOCKER]
B-1  Fix security-reviewer.md:75-78 — replace {director, supervisor, contractor, admin} with canonical {admin, director, stroycontrol, engineer}
B-2  Replace settings.json:9 absolute path with portable form (${workspaceFolder} or env CCIP_ROOT). Same for Stop hook (line 18)
B-3  Add §15 "State Contract" section to CLAUDE.md OR remove "(§15)" refs from 10 agent.md files
B-4  Either (a) remove State Contract sections from agents, or (b) add session-init in pre-agent hook

[CRITICAL]
C-1  Decide: scaffold apps/mobile/ now OR defer M-M and remove ccip-mobile from M-M routing
C-2  Scaffold infra/k8s/ for M-12 before unblock pilot
C-3  Create docs/proposed-claude-md-changes.md (empty file with header)
C-4  Path-canonicalise: `docs/errors_log.md` → `docs/errors/errors_log.md` в 6 агентах
C-5  Fix `docs/feedback-loop.md` → `docs/tasks/feedback-loop.md` в ccip-routing-planner + general-purpose
C-6  Add ccip-product-owner to Intent table; add "Auxiliary Agents" section listing automatic auditors
C-7  Make hook portable: process.env.CCIP_ROOT || path.resolve(__dirname, '../..'); drop 'CCIP/' segment

[HIGH]
H-1  Update post-agent-hook.js — accept BOTH `## State Update` markdown AND top-level JSON
H-2  Implement atomic write in post-agent-hook.js (tmp+rename) — match state-protocol.md
H-3  Update ccip-claude-md-auditor.md — use git rev-parse / relative paths
H-4  Re-evaluate dispute path: rename apps/api/src/modules/dispute/ → dispute-sla/ OR update memory
H-5  Add `model: claude-sonnet-4-6` + State Contract section to ccip-security.md
H-6  Resolve C-004 (Red Team) — create canonical sla-scheduler module; update delivery
H-7  Verify flush-state.js implementation matches state-protocol.md atomic-write claim

[MEDIUM]
M-1  Remove orphan dirs: frontend/, the roles of subagents/, .agents/skills/* (после verification)
M-2  Add expanded settings.local.json permissions: pnpm/npm/node basics, prisma
M-3  Create .github/workflows/agent-audit.yml per §6.1
M-4  Document tool-allowlist policy: read-only agents intentionally lack Bash
M-5  Add docs/architecture, docs/decisions/index.md в CLAUDE.md Document Routing
M-6  Document infra path: docker-compose.yml at root vs infra/docker/

[LOW]
L-1  Audit all agents for tools/model consistency
L-2  Anchor all CLAUDE.md "(see X)" refs to actual section names
```

---

## 12. Suggested Regression Suite Layout

```
tools/audit/
├── agent-frontmatter.js         (T-V-001, T-V-002)
├── path-resolver.js              (T-V-003, T-D-001, T-D-002)
├── rbac-vs-schema.js             (T-V-006, T-A-003)        ← BLOCKING
├── intent-coverage.js            (T-V-008, T-G-001)
├── dead-refs.js                  (T-D-001..T-D-005)
├── path-canonical.js             (T-V-009, T-V-010)        ← pre-commit
├── section-anchors.js            (T-V-007)                 ← pre-commit
├── adr-numbering.js              (T-A-001..T-A-005)
├── orchestration-dag.js          (T-O-001..T-O-006)
├── e2e/
│   ├── agent-call-state.js       (T-R-001)
│   ├── stop-hook-flush.js        (T-R-002)
│   ├── portable-hook.js          (T-R-003)
│   ├── rbac-runtime.js           (T-R-004)
│   └── handoff-injection.js      (T-R-005)
└── lint/
    ├── adr-status-immutable.js   (AL-2)
    └── schema-roles-sync.js      (SE-3)

.github/workflows/
├── agent-audit.yml
└── adr-gate.yml

.husky/
├── pre-commit
└── pre-push
```

---

## 13. Production Readiness Verdict

> **❌ NOT READY for pilot M-13 / production deployment.**
>
> Justification: 4 BLOCKER findings, любого из которых достаточно для отказа:
>
> 1. **F-001 (security-reviewer broken RBAC)** — security review будет одобрять код с ролями, которых нет в системе.
> 2. **F-002 (non-portable hook)** — environment-bound; CI/CD невозможен.
> 3. **F-003 (broken §15 cross-reference)** — 10 агентов читают «(§15)», которого нет в CLAUDE.md.
> 4. **F-004 (state never engaged)** — handoff_notes не записывается ни в одну сессию (session_id="").
>
> Минимальный fix-list для условного "go" (после remediation B-1..B-4 и C-1..C-7): прохождение test suite §5 + успешный smoke-run E2E теста T-R-001.
>
> Estimated effort: **2.5 — 4 dev-days**.

---

## 14. Reproducible Validation Steps (manual)

```bash
cd W:/Claude/CCIP

# F-001 BLOCKER — RBAC mismatch
grep -E "supervisor|contractor" .claude/agents/security-reviewer.md   # MATCHES (broken)
grep -A2 "enum UserRole" packages/database/prisma/schema.prisma       # canonical roles

# F-003 BLOCKER — broken §15
grep -c "§15" .claude/agents/*.md
grep -c "§15\|State Contract" CLAUDE.md                               # 0 occurrences

# F-005..F-007 CRITICAL — missing dirs
test -d apps/mobile || echo "MISSING apps/mobile"
test -d infra/k8s || echo "MISSING infra/k8s"
test -f docs/proposed-claude-md-changes.md || echo "MISSING proposed-changes"

# F-008 CRITICAL — broken errors_log path
grep -nE "docs/errors_log\.md" .claude/agents/*.md                    # 6 hits
test -f docs/errors_log.md || echo "ABSENT (real: docs/errors/errors_log.md)"

# F-002 BLOCKER — non-portable hook
grep -E "W:/Claude" .claude/settings.json                             # confirms abs path

# F-004 — state uninit
cat .claude/runtime/session-state.json | grep -E "session_id|task"   # empty strings
```

---

## 15. Operational Risk Assessment

| Risk dimension | Pre-fix | Post-fix (B-1..B-4 + C-1..C-7) | Notes |
|---|---|---|---|
| Reproducibility (CI/CD on team machine) | ❌ broken on non-Win | ✅ portable | F-002 fix essential |
| Auditability (drift detection) | ❌ no automation | ⚠ partial (CI added) | needs T-CI-001..005 |
| Functional completeness | ❌ M-M, M-12 dead ends | ⚠ scaffold-only | full impl ≥ 4 sprints |
| Security posture | ❌ broken RBAC review | ✅ corrected after F-001 fix | mandatory before pilot |
| Multi-agent orchestration | ❌ state never engaged | ⚠ engaged but needs E2E proof | T-R-001 critical |
| Documentation truth-source | ⚠ split paths, broken refs | ✅ canonical | 1 day fix |
| Pilot M-13 readiness | ❌ NO-GO | ⚠ conditional GO post-fix | min. 2.5 days |

---

## 16. Most Likely Hidden Catastrophic Failures (NOT documented)

> Read between the lines. Каждая запись — потенциальный sev:critical incident, которого нет в `docs/errors/`, `docs/audits/`, и который не выскочит до production.

**X-1. State race на параллельных Agent calls** — `post-agent-hook.js:30` использует non-atomic write. Если одна сессия запускает 2 sub-agent в параллель и оба завершаются в окне < 1ms, hook fires дважды; second write читает stale state и затирает first agent's `agent_outputs`. Симптом: handoff_notes одного из агентов исчезает молча. Detection blind spot: silent error в hook (`catch {}` line 91).

**X-2. Prompt injection через handoff_notes цитирование в errors_log** — `state-protocol.md:120` декларирует `sanitizeHandoff()`. Но: ccip-doc-writer и ccip-architect пишут handoff в `docs/errors_log.md` (broken path: ↦ создаст файл `errors_log.md` сначала). Если *consistency-checker* затем читает этот файл и его содержимое попадает в его prompt без sanitization, attacker может через handoff внедрить instructions. **Sanitization работает только при чтении из state, не при чтении из markdown error-log.**

**X-3. Hook silent crash на не-windows** — hook путь `W:/Claude/CCIP/...` на Linux/macOS пройдёт, command не найдёт файл. Claude Code default: hook errors silent. Симптом: production session работает, а observations + agent_outputs не пишутся. **Не детектируется визуально**.

**X-4. Git history rewriting через ccip-claude-md-auditor's `git log -- CCIP/...`** — если auditor запущен из неправильного CWD, git log вернёт пустой ответ → "no changes — skip full audit". Drift накапливается тихо. Через 6 месяцев — ADR-NNN не упомянут нигде в orchestration.

**X-5. ccip-claude-md-auditor self-modification race** — guard декларирует "записывать proposed-changes; не применять автоматически". Файл `docs/proposed-claude-md-changes.md` отсутствует. Auditor попытается записать → создаст файл → но MAY попутно отредактировать CLAUDE.md (правила говорят: можно менять Document Routing, Intent table). Если haiku hallucinates "Document Routing" как routing-критическое правило, изменения попадут в Production CLAUDE.md без human review. **Текущая guard зависит от LLM, не от machine enforcement.**

**X-6. Cross-tenant leak через DAG step injection** — execute-dag.js получает session-state.json. Если один из агентов пишет artifacts вне своего tenant scope, а security-reviewer пропускает (из-за F-001 broken RBAC), и downstream агент использует эти artifacts как trusted — leak возможен. Невидим при unit-тестах.

**X-7. ADR-013 (PDF reports) — silent orphan** — ни один агент не цитирует ADR-013, ни один модуль не имплементирует. Когда задача "генерация PDF" появится в backlog, она пройдёт через general-purpose (по fallback), который не имеет ADR-context — реализация будет drifting.

**X-8. dispute-sla path memory drift** — `MEMORY.md` указывает зарезервированный путь `apps/api/src/modules/dispute-sla/`, но фактический модуль в `apps/api/src/modules/dispute/` уже создан. M-05b sub-agent при cold-start прочитает memory и попытается работать в неверном пути. **Memory как источник правды конфликтует с filesystem.**

**X-9. Frontend dual-tree confusion** — `/frontend/src/...` (пустые) сосуществуют с `apps/web/src/...` (реальный код). Если ccip-frontend работает с low context (T2: только phase file), он может прочитать manifest со ссылкой на старый frontend/ и записать туда. Detection: только manual review.

**X-10. .agents/skills/frontend-design/ namespace collision** — `.agents/` (root) ≠ `.claude/agents/` (project). При misconfigured pattern-search агент может прочитать стороннюю skill вместо project agent.

**X-11. ADR-005 SLA worker config NOT enforced (yet)** — ADR-005 диктует `replicas: 1, strategy: Recreate`. `infra/k8s/` отсутствует ⇒ нечего проверять. Когда manifests появятся, без CI gate можно случайно поставить `replicas: 2` — ADR-005 invariant ломается с потерей delayed SLA jobs.

**X-12. settings.local.json allowlist permits `git commit -m ' *`** — leading single quote позволяет произвольные дальнейшие arguments. Combined с агентом, способным crafting prompts → agent может коммитить в чужие ветки или с произвольным message. Требует pen-test перед pilot.

---

**Audit signature**: ruthless-precision | zero-trust | concrete-evidence-only
**Next action**: schedule remediation sprint covering B-1..B-4 + C-1..C-7 within 2.5–4 dev-days. Re-run audit after merge.
