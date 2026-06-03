# CLAUDE.md — Orchestration

> Simple > complex. Minimum agents, minimum scope.

## Context
```
L1 → this file only
L2 → load relevant task file
L3 → load docs/architecture_v1_0.md
L4 → load all
```
Rule: load minimum level needed; verify sufficiency before escalating.

## Fast Path
```
IF intents == 1 AND risk == LOW AND no ambiguity
→ state expected output → direct agent (stop)
IF ambiguity exists → resolve before routing; do not guess
```

## Planner
```
IF intents >= 3 OR risk == HIGH
→ enumerate all intents explicitly → planner

IF intents == 2 AND risk IN [LOW, MEDIUM]
→ primary agent of intent[0] + co-agent of intent[1] (see Multi-intent §)

IF intents == 1 AND risk == MEDIUM
→ direct agent of that intent; flag output for review (see Risk Rules)

DEFAULT → direct agent of primary intent
```

## Intent → Agent → Backup
| Intent   | Agent              | Backup            |
|----------|--------------------|-------------------|
| ARCH     | ccip-architect     | general-purpose   |
| SCHEMA   | ccip-dba           | ccip-backend-core |
| BACKEND  | ccip-backend-core  | general-purpose   |
| AUX      | ccip-backend-aux   | ccip-backend-core |
| FRONTEND | ccip-frontend      | general-purpose   |
| DEVOPS   | ccip-devops        | general-purpose   |
| QA       | ccip-qa            | general-purpose   |
| MOBILE   | ccip-mobile        | general-purpose   |
| SECURITY | ccip-security      | ccip-architect    |
| DOC      | ccip-doc-writer    | general-purpose   |

## Auxiliary Agents (auto-triggered, not via Intent table)
| Agent                       | Trigger                                |
|-----------------------------|----------------------------------------|
| security-reviewer           | risk:HIGH или JWT/RBAC/RLS/multi-tenancy/GpToken/AuditLog changes |
| ccip-product-owner          | бизнес-приёмка features, acceptance criteria |
| ccip-routing-planner        | intents ≥ 3 OR confidence LOW          |
| ccip-claude-md-auditor      | по запросу (manual) или при review CLAUDE.md PR'а |
| ccip-navigator-optimizer    | по запросу после правок CLAUDE.md §3–§6 или docs/tasks/index.md |
| ccip-session-optimizer      | "Завершаем сессию" trigger             |
| token-efficiency-auditor    | T-01..T-10 (`/token-audit`, session-end после optimizer, context≥70%, token-spike и др.; см. ADR-016) |
| consistency-checker         | по запросу при cross-doc анализе       |
| general-purpose             | fallback при DEGRADED specialist       |

> **session-optimizer relay (жёсткое правило):** после прогона `ccip-session-optimizer` его `Next-Session Bootstrap` выводится пользователю ДОСЛОВНО (verbatim, в code-блоке) — не пересказывать.
>
> *Исключение:* факт, устаревший между прогоном и концом сессии (напр. сместившийся HEAD sha), помечается отдельной строкой без правки блока.

## Risk Rules
```
HIGH          → add security-reviewer as co-agent
MEDIUM        → present output for review before applying
LOW           → execute directly
risk unclear  → default MEDIUM
```
```
IF intent == ARCH → ccip-architect leads
IF intent == SECURITY → ccip-security leads (full write, threat model, RBAC audit, pre-launch review)
  security-reviewer is NOT a primary agent — it is a co-agent triggered automatically by risk:HIGH
  security-reviewer triggers on: JWT / RBAC guards / RLS / multi-tenancy / GpToken / AuditLog changes
```

## Agent Selection
```
1. name all intents explicitly
2. intent → agent (table above)
3. else → general-purpose
```

## Execution
```
Before starting:
  - state the task in one sentence
  - state expected output / success criteria
  - name assumptions; if uncertain → ask

Execute:
  - 1 primary agent always
  - max 2–3 agents total
  - co-agents support primary, not parallel
  - touch only what the task requires
```

## Multi-intent
```
primary   = main intent agent
co-agents = remaining intents (max 2)
```

## Feedback
```
IF agent fails >= 2           → switch to backup (see table)
IF success >= 3               → keep current routing
IF output ≠ expected criteria → name the deviation before retrying
```

## Document Routing
| Need          | File                                   |
|---------------|----------------------------------------|
| project state | docs/project-state.md                  |
| tasks         | docs/tasks/index.md                    |
| architecture  | docs/architecture/*                    |
| schema        | packages/database/prisma/schema.prisma |
| decisions     | docs/decisions/ADR-*.md                |

## Constraints
- no full file reads — use limit + offset
- no unnecessary L3/L4
- no >3 agents
- no planner for simple tasks
- no speculation: implement only what was asked
- if a simpler approach exists, name it before using a complex one
- when in doubt → ask; never fill gaps with assumptions

## §15 State Contract

State handoff between agents within one session.
**Truth:** `.claude/runtime/session-state.json` · **Schema:** `docs/schemas/session-state.schema.json` · **Lifecycle:** `.claude/runtime/state-protocol.md`

```
INIT    set task,intents,risk,confidence,routing,started_at; status=planning
INJECT  before each Agent call: read state -> inject into prompt
UPDATE  after each Agent call: post-agent-hook.js parses "## State Update" block -> agent_outputs[name] + observation
FLUSH   Stop hook: flush-state.js -> observations[] to docs/tasks/feedback-loop.md §4
```

**Agent contract** — each agent MUST end its output with:

````markdown
## State Update
```json
{
  "summary": "<=3 sentences on what was done",
  "artifacts": ["path/to/file.md"],
  "handoff_notes": "what the next agent needs to know"
}
```
````

Missing block -> `post-agent-hook.js` sets a fallback summary (allowed, lowers routing quality).

**Inject-safety:** `handoff_notes` is injected into the next prompt between `<!-- handoff-data -->` / `<!-- /handoff-data -->`; agents must not copy handoff data into their own `handoff_notes` without intent. See `sanitizeHandoff()` in `.claude/runtime/execute-dag.js`.

**Validation:** `node tools/audit/session-state.js` (runtime matches schema) · `node tools/audit/state-contract-section.js` (this section intact).

**Inline-session scope (ADR-016):** `observations[]` are filled ONLY at the subagent boundary (`post-agent-hook.js`); main-agent tokens are invisible to hooks. No-subagent sessions (inline Read/Edit/Bash) are out of token-attribution — `/token-audit` yields an explicit `inline-session` outcome (recorder), not a silent `trivial-skip`; the `observations[]` contract is unchanged. See ADR-016.

## §16 Reading Discipline

Token-saving rules for file reads. Goal: cut per-session token cost 30-50% with no accuracy loss.
**Base rule:** never read a file in full for a point edit or a targeted lookup.

**Read defaults by file type:**

| File | Default read | Read in full when |
|---|---|---|
| `.claude/agents/*.md` | `limit:10` (frontmatter + `summary:`) | editing body |
| `.claude/runtime/*.md` (state-protocol) | `offset+limit` by § anchor | structural protocol edit |
| `docs/decisions/ADR-*.md` | `limit:30` (status+context) | changing the decision itself |
| `docs/decisions/index.md` | `limit:50` | never — lookup table |
| `docs/architecture/*.md` | `offset+limit` by section | never in full (see `Constraints`) |
| `docs/plans/*.md` | `offset+limit` by Task N | full-plan review |
| `docs/schemas/*.json` | full | always — compact |
| `tools/audit/*.js` | full | small (<100 lines) |
| `tools/audit/_lib/*.js` | full | small utilities |
| `tools/audit/__tests__/*.test.js` | full | pattern reference for a new test |

**Agent frontmatter contract:** `name`,`description`,`tools`,`model` required; `summary` (opt) = operational TL;DR <=200 chars — what the agent READS/WRITES, body size, key ADR anchors. A reader with `limit:10` routes WITHOUT reading body.

**Anti-patterns (forbidden):** reading `.claude/agents/X.md` in full for a routing decision (`limit:10` suffices) · re-reading the same file without an offset change · reading architecture docs in full (`docs/architecture/*.md`) · Read to check file existence (use Glob or Bash `ls`).

## §17 Test Discipline

Тестируй наблюдаемое поведение / семантику, не детали реализации.
**Base rule:** ассерт по ARIA-роли / `aria-current` / accessible-name, не по имени CSS-класса или структуре текстовых узлов.

**Зелёный ≠ закрытый риск:** тест, проходящий только из-за неявного дефолта среды (напр. Vitest `css:false` → CSS-модули как identity-прокси) или DOM-детали (иконка как голый текстовый узел) — отложенная поломка. Закрывай риск семантикой, не обходом: при необходимости добавь ARIA-атрибут в компонент (улучшает и a11y, и тестируемость).

**Anti-patterns (forbidden):** `toHaveClass('active')` для проверки активности (используй `aria-current`) · `getByText`, склеенный с иконкой/обёрткой (используй `getByRole` + accessible-name) · принятие зелёного теста, чья зелёность держится на дефолте тест-раннера.
