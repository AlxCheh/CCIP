# M-08 Design Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Применить дизайн-систему «Ledger» к DashboardPage, ObjectDetailPage и PeriodPage, заменив все инлайновые стили на CSS Modules и добавив App Shell (sidebar + topbar).

**Architecture:** Создаём `tokens.css` с CSS-переменными, `AppShell` как layout route через `<Outlet />`, общие компоненты `BackLink`, `StatusPill`, `StepperTabs`, обновлённый `ProgressBar`. Каждая страница получает свой `*.module.css`. GpFormPage не затрагивается.

**Tech Stack:** React 18 · TypeScript 5.7 · Vite 6 (CSS Modules нативно) · CSS Custom Properties · react-router-dom v6 · Vitest + RTL

**Design spec:** `docs/plans/2026-06-02-m08-design-pass.md`
**Approved mockups:** `.superpowers/brainstorm/1226-1780422587/content/variants/`

---

## File Map

| Действие | Файл | Назначение |
|----------|------|------------|
| Modify | `apps/web/index.html` | Добавить EB Garamond weight 500 |
| Create | `apps/web/src/styles/tokens.css` | CSS custom properties + grain |
| Modify | `apps/web/src/main.tsx` | import tokens.css, layout route AppShell |
| Create | `apps/web/src/components/AppShell.tsx` | Sidebar + topbar, `<Outlet />` |
| Create | `apps/web/src/components/AppShell.module.css` | Стили shell |
| Create | `apps/web/src/components/BackLink.tsx` | Ссылка «← Название» |
| Create | `apps/web/src/components/BackLink.module.css` | Стили ссылки |
| Create | `apps/web/src/components/StatusPill.tsx` | Пилюля статуса/разрыва |
| Create | `apps/web/src/components/StatusPill.module.css` | Стили пилюли |
| Modify | `apps/web/src/components/ProgressBar.tsx` | Ledger-стиль бара |
| Create | `apps/web/src/components/ProgressBar.module.css` | Стили бара |
| Create | `apps/web/src/components/StepperTabs.tsx` | Степпер-табы периода |
| Create | `apps/web/src/components/StepperTabs.module.css` | Стили степпера |
| Modify | `apps/web/src/components/__tests__/components.test.tsx` | Тесты новых компонентов |
| Create | `apps/web/src/pages/DashboardPage.module.css` | Стили дашборда |
| Modify | `apps/web/src/pages/DashboardPage.tsx` | CSS Modules, убрать inline |
| Create | `apps/web/src/pages/ObjectDetailPage.module.css` | Стили карточки объекта |
| Modify | `apps/web/src/pages/ObjectDetailPage.tsx` | CSS Modules, убрать inline |
| Create | `apps/web/src/pages/PeriodPage.module.css` | Стили страницы периода |
| Modify | `apps/web/src/pages/PeriodPage.tsx` | CSS Modules, убрать inline |

---

## Task 1: Design Tokens + Fonts

**Files:**
- Modify: `apps/web/index.html`
- Create: `apps/web/src/styles/tokens.css`
- Modify: `apps/web/src/main.tsx`

- [ ] **Step 1: Обновить Google Fonts в `index.html`** — добавить weight 500 для EB Garamond

Заменить строку `<link href="https://fonts.googleapis.com/...">` на:
```html
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
```

- [ ] **Step 2: Создать `apps/web/src/styles/tokens.css`**

```css
:root {
  --cream:   #f5ede0;
  --dark:    #1e1208;
  --dark2:   #2e1a0a;
  --accent:  #d4824a;
  --brown:   #7a5030;
  --brown2:  #9a6040;
  --text:    #3d1f08;
  --rule:    #d8c4a8;
  --err:     #c84a2a;
  --err-bg:  #fde8e4;
  --green:   #4a8a50;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: var(--cream);
  color: var(--text);
  font-family: 'EB Garamond', Georgia, serif;
}
```

- [ ] **Step 3: Импортировать `tokens.css` в `main.tsx`** — добавить первой строкой импорта:

```tsx
import './styles/tokens.css';
```

- [ ] **Step 4: Убедиться, что тесты проходят**

```bash
pnpm --filter @ccip/web test --run
```

Ожидание: все тесты зелёные.

- [ ] **Step 5: Commit**

```bash
git add apps/web/index.html apps/web/src/styles/tokens.css apps/web/src/main.tsx
git commit -m "feat(web): add Ledger design tokens and fonts"
```

---

## Task 2: AppShell — Sidebar + Topbar

**Files:**
- Create: `apps/web/src/components/AppShell.tsx`
- Create: `apps/web/src/components/AppShell.module.css`
- Modify: `apps/web/src/main.tsx`

- [ ] **Step 1: Написать failing тест для AppShell**

Добавить в `apps/web/src/components/__tests__/components.test.tsx`:

```tsx
describe('AppShell', () => {
  it('renders sidebar brand and nav links', () => {
    renderWithProviders(<AppShell />, { route: '/dashboard' });
    expect(screen.getByText('CCIP')).toBeInTheDocument();
    expect(screen.getByText(/Дашборд/i)).toBeInTheDocument();
    expect(screen.getByText(/Объекты/i)).toBeInTheDocument();
    expect(screen.getByText(/Периоды/i)).toBeInTheDocument();
  });

  it('marks dashboard link active on /dashboard route', () => {
    renderWithProviders(<AppShell />, { route: '/dashboard' });
    const link = screen.getByRole('link', { name: /Дашборд/i });
    expect(link).toHaveClass('active');
  });
});
```

Добавить хелпер `renderWithProviders` (если ещё нет) в начало файла:
```tsx
import { MemoryRouter, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from '../AppShell';

function renderWithProviders(ui: React.ReactElement, { route = '/' } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}
```

- [ ] **Step 2: Запустить тест — убедиться в FAIL**

```bash
pnpm --filter @ccip/web test --run components.test
```

Ожидание: `Cannot find module '../AppShell'`

- [ ] **Step 3: Создать `AppShell.module.css`**

```css
.frame { display: flex; height: 100vh; overflow: hidden; }

/* ── Sidebar ── */
.sidebar {
  width: 212px;
  background: var(--dark);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 1;
}

.brand { padding: 18px 20px 16px; border-bottom: 1px solid #3a2510; }
.logo { display: flex; align-items: center; gap: 9px; }
.mark { width: 9px; height: 9px; background: var(--accent); border-radius: 50%; flex-shrink: 0; }
.brandName { font-family: 'Space Mono', monospace; font-size: 15px; font-weight: 700; color: #f5ede0; letter-spacing: 2px; }
.brandSub { font-family: 'Space Mono', monospace; font-size: 7px; letter-spacing: 3px; text-transform: uppercase; color: var(--brown); margin: 6px 0 0 18px; }

.nav { padding: 12px 10px; display: flex; flex-direction: column; gap: 1px; }
.navLink {
  display: flex; align-items: center; gap: 10px; padding: 9px 12px;
  font-family: 'Space Mono', monospace; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase;
  color: #8a7158; text-decoration: none; border-left: 2px solid transparent;
}
.navLink:hover { color: #b89070; }
.navLink.active { color: var(--accent); background: rgba(212,130,74,.08); border-left-color: var(--accent); }
.badge {
  margin-left: auto; background: var(--accent); color: var(--dark);
  font-size: 9px; padding: 1px 6px; border-radius: 99px; letter-spacing: 0;
}

.who { margin-top: auto; padding: 14px 20px; border-top: 1px solid #3a2510; }
.whoName { font-family: 'EB Garamond', serif; font-size: 15px; color: #e7d6bf; }
.whoRole { font-family: 'Space Mono', monospace; font-size: 8px; letter-spacing: 2px; text-transform: uppercase; color: var(--brown); margin-top: 3px; }

/* ── Main area ── */
.main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

.topbar {
  background: var(--dark); padding: 9px 24px;
  display: flex; justify-content: space-between; align-items: center;
  flex-shrink: 0;
}
.topbarLeft { font-family: 'Space Mono', monospace; font-size: 8px; letter-spacing: 3px; text-transform: uppercase; color: var(--accent); }
.topbarRight { font-family: 'Space Mono', monospace; font-size: 8px; color: var(--brown); }

.content { flex: 1; overflow: auto; }

/* grain overlay */
.grain {
  position: fixed; inset: 0; pointer-events: none; z-index: 100; opacity: .05; mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
```

- [ ] **Step 4: Создать `AppShell.tsx`**

```tsx
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { getAuthUser } from '../store/auth';
import s from './AppShell.module.css';

const NAV = [
  { to: '/dashboard', label: 'Дашборд',      icon: '▦' },
  { to: '/objects',   label: 'Объекты',       icon: '◳' },
  { to: '/periods',   label: 'Периоды',       icon: '◷' },
  { to: '/discrepancies', label: 'Расхождения', icon: '⚖', badge: 0 },
  { to: '/settings',  label: 'Настройки',     icon: '⚙' },
];

export function AppShell() {
  const user = getAuthUser();
  const { pathname } = useLocation();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className={s.frame}>
      <div className={s.grain} aria-hidden />

      <aside className={s.sidebar}>
        <div className={s.brand}>
          <div className={s.logo}>
            <span className={s.mark} />
            <span className={s.brandName}>CCIP</span>
          </div>
          <div className={s.brandSub}>Система учёта</div>
        </div>

        <nav className={s.nav}>
          {NAV.map(({ to, label, icon, badge }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                [s.navLink, isActive || pathname.startsWith(to + '/') ? s.active : ''].join(' ')
              }
            >
              {icon}&nbsp; {label}
              {badge != null && badge > 0 && (
                <span className={s.badge}>{badge}</span>
              )}
            </NavLink>
          ))}
        </nav>

        {user && (
          <div className={s.who}>
            <div className={s.whoName}>{user.name ?? user.email}</div>
            <div className={s.whoRole}>{user.role}</div>
          </div>
        )}
      </aside>

      <div className={s.main}>
        <header className={s.topbar}>
          <span className={s.topbarLeft}>Стройконтроль · Система учёта</span>
          <span className={s.topbarRight}>{today}</span>
        </header>
        <div className={s.content}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Подключить AppShell как layout route в `main.tsx`**

Заменить блок `<Routes>` на:

```tsx
import { AppShell } from './components/AppShell';
// ...

<Routes>
  <Route path="/" element={<Navigate to="/dashboard" replace />} />
  <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
    <Route path="/dashboard" element={<DashboardPage />} />
    <Route path="/objects/:id" element={<ObjectDetailPage />} />
    <Route path="/periods/:id" element={<PeriodPage />} />
  </Route>
  <Route path="/gp/:token" element={<GpFormPage />} />
  <Route path="/forbidden" element={<ForbiddenPage />} />
  <Route path="*" element={<Navigate to="/dashboard" replace />} />
</Routes>
```

Примечание: `ProtectedRoute` теперь оборачивает `AppShell`, а не каждую страницу отдельно.

- [ ] **Step 6: Запустить тесты**

```bash
pnpm --filter @ccip/web test --run
```

Ожидание: AppShell тесты зелёные, остальные не сломаны.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/AppShell.tsx apps/web/src/components/AppShell.module.css apps/web/src/main.tsx apps/web/src/components/__tests__/components.test.tsx
git commit -m "feat(web): add AppShell layout with Ledger sidebar and topbar"
```

---

## Task 3: BackLink + StatusPill

**Files:**
- Create: `apps/web/src/components/BackLink.tsx`
- Create: `apps/web/src/components/BackLink.module.css`
- Create: `apps/web/src/components/StatusPill.tsx`
- Create: `apps/web/src/components/StatusPill.module.css`
- Modify: `apps/web/src/components/__tests__/components.test.tsx`

- [ ] **Step 1: Написать failing тесты**

Добавить в `components.test.tsx`:

```tsx
import { BackLink } from '../BackLink';
import { StatusPill } from '../StatusPill';

describe('BackLink', () => {
  it('renders link with label and arrow', () => {
    renderWithProviders(<BackLink to="/dashboard" label="Дашборд" />);
    expect(screen.getByRole('link', { name: /← Дашборд/i })).toBeInTheDocument();
  });
});

describe('StatusPill', () => {
  it('renders gap variant', () => {
    render(<StatusPill variant="gap">разрыв</StatusPill>);
    expect(screen.getByText('разрыв')).toBeInTheDocument();
  });

  it('renders ok variant', () => {
    render(<StatusPill variant="ok">в плане</StatusPill>);
    expect(screen.getByText('в плане')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — убедиться в FAIL**

```bash
pnpm --filter @ccip/web test --run components.test
```

- [ ] **Step 3: Создать `BackLink.module.css`**

```css
.link {
  font-family: 'Space Mono', monospace;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--dark);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--dark);
  padding-bottom: 2px;
}
.link:hover { opacity: .75; }
```

- [ ] **Step 4: Создать `BackLink.tsx`**

```tsx
import { Link } from 'react-router-dom';
import s from './BackLink.module.css';

type Props = { to: string; label: string };

export function BackLink({ to, label }: Props) {
  return (
    <Link to={to} className={s.link}>
      ← {label}
    </Link>
  );
}
```

- [ ] **Step 5: Создать `StatusPill.module.css`**

```css
.pill {
  font-family: 'Space Mono', monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  padding: 3px 9px;
  border: 1px solid;
  white-space: nowrap;
  display: inline-block;
}
.gap  { color: var(--accent); border-color: rgba(212,130,74,.5); background: rgba(212,130,74,.08); }
.ok   { color: var(--green);  border-color: rgba(74,138,80,.5);  background: rgba(74,138,80,.08);  }
.done { color: var(--brown);  border-color: var(--rule); }
.err  { color: var(--err);    border-color: rgba(200,74,42,.4);  background: var(--err-bg); }
```

- [ ] **Step 6: Создать `StatusPill.tsx`**

```tsx
import s from './StatusPill.module.css';

type Variant = 'gap' | 'ok' | 'done' | 'err';
type Props = { variant: Variant; children: React.ReactNode };

export function StatusPill({ variant, children }: Props) {
  return <span className={`${s.pill} ${s[variant]}`}>{children}</span>;
}
```

- [ ] **Step 7: Запустить тесты**

```bash
pnpm --filter @ccip/web test --run components.test
```

Ожидание: все зелёные.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/BackLink.tsx apps/web/src/components/BackLink.module.css apps/web/src/components/StatusPill.tsx apps/web/src/components/StatusPill.module.css apps/web/src/components/__tests__/components.test.tsx
git commit -m "feat(web): add BackLink and StatusPill Ledger components"
```

---

## Task 4: ProgressBar redesign

**Files:**
- Create: `apps/web/src/components/ProgressBar.module.css`
- Modify: `apps/web/src/components/ProgressBar.tsx`

- [ ] **Step 1: Написать тест**

Добавить в `components.test.tsx`:

```tsx
import { ProgressBar } from '../ProgressBar';

describe('ProgressBar', () => {
  it('renders percentage text', () => {
    render(<ProgressBar value={70} />);
    expect(screen.getByText('70%')).toBeInTheDocument();
  });

  it('renders dash when value is null', () => {
    render(<ProgressBar value={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — убедиться, что тесты зелёные (компонент уже есть)**

```bash
pnpm --filter @ccip/web test --run components.test
```

- [ ] **Step 3: Создать `ProgressBar.module.css`**

```css
.wrap { display: flex; align-items: center; gap: 9px; }
.track { flex: 1; height: 5px; background: var(--rule); min-width: 60px; }
.fill  { height: 5px; background: var(--accent); transition: width .3s; }
.pct   { font-family: 'Space Mono', monospace; font-size: 11px; color: var(--brown); width: 34px; text-align: right; font-variant-numeric: tabular-nums; }
.empty { font-family: 'Space Mono', monospace; font-size: 12px; color: var(--rule); }
```

- [ ] **Step 4: Обновить `ProgressBar.tsx`**

```tsx
import s from './ProgressBar.module.css';

type Props = { value: number | null };

export function ProgressBar({ value }: Props) {
  if (value === null) return <span className={s.empty}>—</span>;
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className={s.wrap}>
      <div className={s.track}>
        <div className={s.fill} style={{ width: `${pct}%` }} />
      </div>
      <span className={s.pct}>{Math.round(pct)}%</span>
    </div>
  );
}
```

- [ ] **Step 5: Запустить тесты**

```bash
pnpm --filter @ccip/web test --run
```

Ожидание: все зелёные (включая существующие snapshot/RTL тесты ProgressBar).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/ProgressBar.tsx apps/web/src/components/ProgressBar.module.css apps/web/src/components/__tests__/components.test.tsx
git commit -m "feat(web): redesign ProgressBar with Ledger tokens"
```

---

## Task 5: StepperTabs component

**Files:**
- Create: `apps/web/src/components/StepperTabs.tsx`
- Create: `apps/web/src/components/StepperTabs.module.css`
- Modify: `apps/web/src/components/__tests__/components.test.tsx`

- [ ] **Step 1: Написать failing тест**

```tsx
import { StepperTabs } from '../StepperTabs';

const STEPS = ['Открыт', 'ГП подал данные', 'Верификация', 'Закрыт'] as const;
type Step = typeof STEPS[number];

describe('StepperTabs', () => {
  it('renders all 4 steps', () => {
    render(<StepperTabs steps={STEPS} current="ГП подал данные" />);
    STEPS.forEach(s => expect(screen.getByText(s)).toBeInTheDocument());
  });

  it('applies active class only to current step label', () => {
    render(<StepperTabs steps={STEPS} current="Верификация" />);
    expect(screen.getByText('Верификация').className).toMatch(/activeLabel/);
    expect(screen.getByText('Открыт').className).not.toMatch(/activeLabel/);
  });
});
```

- [ ] **Step 2: Run — убедиться в FAIL**

```bash
pnpm --filter @ccip/web test --run components.test
```

- [ ] **Step 3: Создать `StepperTabs.module.css`**

```css
.stepper { display: flex; border-bottom: 2px solid var(--dark); }

.step { flex: 1; padding: 12px 16px 10px; display: flex; flex-direction: column; gap: 5px; }

.num {
  font-family: 'Space Mono', monospace;
  font-size: 7px; letter-spacing: 2px; text-transform: uppercase;
}
.label {
  font-family: 'Space Mono', monospace;
  font-size: 11px; font-weight: 700; letter-spacing: .5px;
  display: inline-block;
}

/* done */
.step.done .num   { color: var(--brown); }
.step.done .label { color: var(--brown); }

/* active */
.step.active .num   { color: var(--err); }
.step.active .label {
  color: var(--err);
  border: 1.5px solid var(--err);
  background: var(--err-bg);
  padding: 3px 8px;
}
/* alias used in test selector */
.activeLabel { color: var(--err); border: 1.5px solid var(--err); background: var(--err-bg); padding: 3px 8px; }

/* ahead */
.step.ahead .num   { color: var(--rule); }
.step.ahead .label { color: var(--rule); }
```

- [ ] **Step 4: Создать `StepperTabs.tsx`**

```tsx
import s from './StepperTabs.module.css';

type Props<T extends string> = {
  steps: readonly T[];
  current: T;
};

const STATUS_ORDER = ['Открыт', 'ГП подал данные', 'Верификация', 'Закрыт'] as const;

export function StepperTabs<T extends string>({ steps, current }: Props<T>) {
  const currentIdx = steps.indexOf(current);

  return (
    <div className={s.stepper}>
      {steps.map((step, i) => {
        const state =
          i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'ahead';
        const num = String(i + 1).padStart(2, '0');
        return (
          <div key={step} className={`${s.step} ${s[state]}`}>
            <span className={s.num}>{num}</span>
            <span className={`${s.label} ${state === 'active' ? s.activeLabel : ''}`}>
              {step}
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Запустить тесты**

```bash
pnpm --filter @ccip/web test --run components.test
```

Ожидание: все зелёные.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/StepperTabs.tsx apps/web/src/components/StepperTabs.module.css apps/web/src/components/__tests__/components.test.tsx
git commit -m "feat(web): add StepperTabs Ledger component"
```

---

## Task 6: DashboardPage redesign

**Files:**
- Create: `apps/web/src/pages/DashboardPage.module.css`
- Modify: `apps/web/src/pages/DashboardPage.tsx`

- [ ] **Step 1: Запустить существующие тесты дашборда — убедиться, что они зелёные**

```bash
pnpm --filter @ccip/web test --run DashboardPage.test
```

- [ ] **Step 2: Создать `DashboardPage.module.css`**

```css
/* ── Page layout ── */
.page { padding: 0 28px 28px; }

/* ── Hero ── */
.hero { display: flex; justify-content: space-between; align-items: flex-end; padding: 22px 0 16px; }
.heroLeft {}
.kick { font-family: 'Space Mono', monospace; font-size: 8px; letter-spacing: 3px; text-transform: uppercase; color: var(--brown2); margin-bottom: 8px; }
.h1 { font-family: 'EB Garamond', serif; font-size: 38px; font-weight: 500; line-height: 1; color: var(--text); }
.meta { font-family: 'EB Garamond', serif; font-style: italic; font-size: 13px; color: var(--brown2); margin-top: 7px; }
.refreshBtn {
  font-family: 'Space Mono', monospace; font-size: 9px; letter-spacing: 2px; text-transform: uppercase;
  background: var(--dark); color: var(--accent); border: none; padding: 11px 18px; cursor: pointer;
}
.refreshBtn:hover { background: var(--dark2); }

/* ── KPI band ── */
.kpis {
  display: grid; grid-template-columns: repeat(4, 1fr);
  border-top: 2px solid var(--dark); border-bottom: 2px solid var(--dark);
  margin: 0 -28px;
}
.kpi { padding: 16px 22px; border-right: 1px solid var(--rule); }
.kpi:last-child { border-right: none; }
.kpiLabel { font-family: 'Space Mono', monospace; font-size: 8px; letter-spacing: 2px; text-transform: uppercase; color: var(--brown2); }
.kpiValue { font-family: 'Space Mono', monospace; font-size: 30px; font-weight: 700; margin-top: 8px; font-variant-numeric: tabular-nums; color: var(--text); }
.kpiValue.err { color: var(--err); }
.kpiValue.acc { color: var(--accent); }

/* ── Toolbar ── */
.toolbar {
  display: flex; align-items: flex-end; justify-content: space-between;
  padding: 12px 0; border-bottom: 1px solid var(--rule);
}
.checkLabel { display: flex; align-items: center; gap: 6px; font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: var(--brown); cursor: pointer; }
.sortWrap { display: flex; flex-direction: column; gap: 3px; }
.sortLabel { font-family: 'Space Mono', monospace; font-size: 7px; letter-spacing: 2px; text-transform: uppercase; color: var(--brown2); }
.sortSelect {
  background: transparent; border: none; border-bottom: 1px solid var(--brown);
  color: var(--text); font-family: 'Space Mono', monospace; font-size: 11px;
  padding: 3px 0; outline: none; cursor: pointer;
}

/* ── Table ── */
.tableWrap { padding: 0; }
table.table { width: 100%; border-collapse: collapse; }
.table thead th {
  font-family: 'Space Mono', monospace; font-size: 8px; letter-spacing: 2px; text-transform: uppercase;
  color: var(--dark); text-align: left; padding: 12px 0 8px;
  border-bottom: 2px solid var(--dark); font-weight: 700; white-space: nowrap;
}
.table thead th.r { text-align: right; }
.table tbody td { padding: 13px 0; border-bottom: 1px solid var(--rule); vertical-align: middle; }
.table tbody tr:last-child td { border-bottom: none; }
.table tbody tr { cursor: pointer; }
.table tbody tr:hover td { background: rgba(30,18,8,.02); }
.table tbody tr.hasGap td:first-child { box-shadow: inset 3px 0 0 var(--accent); padding-left: 10px; }
.table td.r { text-align: right; }

.objName { font-family: 'EB Garamond', serif; font-size: 18px; color: var(--text); }
.objSub  { font-family: 'Space Mono', monospace; font-size: 9px; letter-spacing: .5px; color: var(--brown); margin-top: 3px; }
.statusDot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; margin-right: 6px; }
.statusText { font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; }
.forecast { font-family: 'Space Mono', monospace; font-size: 12px; font-variant-numeric: tabular-nums; }
.forecast.late { color: var(--err); }
.forecastSub { font-family: 'Space Mono', monospace; font-size: 9px; color: var(--brown); margin-top: 2px; font-variant-numeric: tabular-nums; }

/* ── Footer ── */
.foot { display: flex; justify-content: flex-end; align-items: center; gap: 8px; padding: 14px 0; border-top: 2px solid var(--dark); }
.pageBtn {
  font-family: 'Space Mono', monospace; font-size: 9px; letter-spacing: 1px; text-transform: uppercase;
  padding: 8px 14px; border: 1px solid var(--rule); background: transparent; color: var(--brown); cursor: pointer;
}
.pageBtn.dark { background: var(--dark); color: var(--accent); border-color: var(--dark); }
.pageBtn:disabled { opacity: .4; cursor: not-allowed; }

/* ── States ── */
.loading { font-family: 'Space Mono', monospace; font-size: 11px; color: var(--brown2); padding: 40px 0; text-align: center; }
.error   { font-family: 'Space Mono', monospace; font-size: 11px; color: var(--err); padding: 20px 0; }
.empty   { font-family: 'EB Garamond', serif; font-style: italic; font-size: 16px; color: var(--brown2); padding: 40px 0; text-align: center; }
```

- [ ] **Step 3: Переписать `DashboardPage.tsx` с CSS Modules**

```tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDashboard } from '../hooks/useDashboard';
import { StaleBanner } from '../components/StaleBanner';
import { ProgressBar } from '../components/ProgressBar';
import { StatusPill } from '../components/StatusPill';
import { RoleGate } from '../components/RoleGate';
import { RefreshButton } from '../components/RefreshButton';
import type { DashboardQuery } from '../services/api';
import s from './DashboardPage.module.css';

const STATUS_LABELS: Record<string, string> = {
  active: 'Активный', paused: 'Приостановлен', closed: 'Завершён',
};
const STATUS_COLORS: Record<string, string> = {
  active: 'var(--green)', paused: 'var(--accent)', closed: 'var(--brown)',
};

function formatRefreshed(iso: string | null): string {
  if (!iso) return 'нет данных';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин назад`;
  return `${Math.floor(mins / 60)} ч назад`;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState<DashboardQuery>({ page: 1, pageSize: 50, sort: 'gapFirst' });
  const { data, isLoading, isError } = useDashboard(query);

  function setParam<K extends keyof DashboardQuery>(key: K, value: DashboardQuery[K]) {
    setQuery(q => ({ ...q, [key]: value, page: 1 }));
  }

  const totalPages = data ? Math.ceil(data.pagination.total / (query.pageSize ?? 50)) : 1;
  const page = query.page ?? 1;

  return (
    <div className={s.page}>
      <StaleBanner meta={data?.meta ?? null} />

      <div className={s.hero}>
        <div className={s.heroLeft}>
          <div className={s.kick}>
            Портфель{data ? ` · ${data.pagination.total} объектов` : ''}
          </div>
          <h1 className={s.h1}>Дашборд</h1>
          {data && (
            <div className={s.meta}>
              обновлено: {formatRefreshed(data.meta.refreshedAt)}
            </div>
          )}
        </div>
        <RoleGate allow={['admin']}>
          <RefreshButton className={s.refreshBtn} />
        </RoleGate>
      </div>

      {data && (
        <div className={s.kpis}>
          <div className={s.kpi}>
            <div className={s.kpiLabel}>Объектов всего</div>
            <div className={s.kpiValue}>{data.pagination.total}</div>
          </div>
          <div className={s.kpi}>
            <div className={s.kpiLabel}>С разрывом плана</div>
            <div className={`${s.kpiValue} ${s.err}`}>
              {String(data.items.filter(r => r.gapFlag).length).padStart(2, '0')}
            </div>
          </div>
          <div className={s.kpi}>
            <div className={s.kpiLabel}>Средняя готовность</div>
            <div className={s.kpiValue}>
              {data.items.length > 0
                ? Math.round(data.items.filter(r => r.objReadinessPct != null)
                    .reduce((a, r) => a + (r.objReadinessPct ?? 0), 0) /
                    data.items.filter(r => r.objReadinessPct != null).length) + '%'
                : '—'}
            </div>
          </div>
          <div className={s.kpi}>
            <div className={s.kpiLabel}>Просрочка SLA</div>
            <div className={`${s.kpiValue} ${s.acc}`}>—</div>
          </div>
        </div>
      )}

      <div className={s.toolbar}>
        <label className={s.checkLabel}>
          <input
            type="checkbox"
            checked={query.gapOnly ?? false}
            onChange={e => setParam('gapOnly', e.target.checked || undefined)}
          />
          Только с разрывом
        </label>
        <div className={s.sortWrap}>
          <span className={s.sortLabel}>Сортировка</span>
          <select
            className={s.sortSelect}
            value={query.sort ?? 'gapFirst'}
            onChange={e => setParam('sort', e.target.value as DashboardQuery['sort'])}
          >
            <option value="gapFirst">Сначала с разрывом</option>
            <option value="readinessAsc">Готовность ↑</option>
            <option value="readinessDesc">Готовность ↓</option>
            <option value="forecastAsc">Прогноз ↑</option>
            <option value="forecastDesc">Прогноз ↓</option>
            <option value="nameAsc">Название А–Я</option>
          </select>
        </div>
      </div>

      {isLoading && <div className={s.loading}>Загрузка...</div>}
      {isError  && <div className={s.error}>Ошибка загрузки данных.</div>}

      {data && data.items.length === 0 && (
        <div className={s.empty}>Нет объектов в организации</div>
      )}

      {data && data.items.length > 0 && (
        <>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Объект</th>
                  <th>Статус</th>
                  <th>Готовность</th>
                  <th className={s.r}>Прогноз</th>
                  <th className={s.r}>Разрыв</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map(row => (
                  <tr
                    key={row.objectId}
                    className={row.gapFlag ? s.hasGap : ''}
                    onClick={() => void navigate(`/objects/${row.objectId}`)}
                  >
                    <td>
                      <div className={s.objName}>{row.name}</div>
                      <div className={s.objSub}>{row.objectClass ?? ''}</div>
                    </td>
                    <td>
                      <span
                        className={s.statusDot}
                        style={{ background: STATUS_COLORS[row.status] ?? 'var(--brown)' }}
                      />
                      <span className={s.statusText}>
                        {STATUS_LABELS[row.status] ?? row.status}
                      </span>
                    </td>
                    <td>
                      {row.hasAnalytics
                        ? <ProgressBar value={row.objReadinessPct} />
                        : <span style={{ color: 'var(--rule)' }}>—</span>}
                    </td>
                    <td className={s.r}>
                      {row.hasAnalytics && row.weightedForecastDate ? (
                        <>
                          <div className={`${s.forecast} ${row.gapFlag ? s.late : ''}`}>
                            {new Date(row.weightedForecastDate).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                          </div>
                          {row.criticalPathForecastDate && (
                            <div className={s.forecastSub}>
                              крит.&nbsp;{new Date(row.criticalPathForecastDate).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                            </div>
                          )}
                        </>
                      ) : (
                        <span style={{ color: 'var(--rule)' }}>—</span>
                      )}
                    </td>
                    <td className={s.r}>
                      {row.hasAnalytics
                        ? row.gapFlag
                          ? <StatusPill variant="gap">разрыв</StatusPill>
                          : <StatusPill variant="ok">в плане</StatusPill>
                        : <span style={{ color: 'var(--rule)' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={s.foot}>
            <button
              className={s.pageBtn}
              disabled={page <= 1}
              onClick={() => setQuery(q => ({ ...q, page: (q.page ?? 1) - 1 }))}
            >
              ← Назад
            </button>
            <button
              className={`${s.pageBtn} ${s.dark}`}
              disabled={page >= totalPages}
              onClick={() => setQuery(q => ({ ...q, page: (q.page ?? 1) + 1 }))}
            >
              Вперёд →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Обновить `RefreshButton` и `StaleBanner` — добавить поддержку `className` prop**

В `RefreshButton.tsx` добавить `className?: string` в Props и передать в кнопку.
В `StaleBanner.tsx` принять `meta: StalenessMeta | null` вместо `meta: StalenessMeta` (handle null).

- [ ] **Step 5: Запустить тесты**

```bash
pnpm --filter @ccip/web test --run
```

Ожидание: все зелёные. Если тест проверяет старый className — обновить селектор на `getByRole`/`getByText`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/DashboardPage.tsx apps/web/src/pages/DashboardPage.module.css apps/web/src/components/RefreshButton.tsx apps/web/src/components/StaleBanner.tsx
git commit -m "feat(web): redesign DashboardPage with Ledger CSS Modules"
```

---

## Task 7: ObjectDetailPage redesign

**Files:**
- Create: `apps/web/src/pages/ObjectDetailPage.module.css`
- Modify: `apps/web/src/pages/ObjectDetailPage.tsx`

- [ ] **Step 1: Запустить тесты ObjectDetailPage перед изменениями**

```bash
pnpm --filter @ccip/web test --run ObjectDetailPage.test
```

- [ ] **Step 2: Создать `ObjectDetailPage.module.css`**

```css
.page { padding: 0 28px 28px; }

/* back link */
.back { padding: 16px 0 0; display: block; }

/* hero */
.hero { padding: 14px 0 16px; border-bottom: 2px solid var(--dark); }
.heroTitle { font-family: 'EB Garamond', serif; font-size: 32px; font-weight: 500; margin: 0 0 8px; line-height: 1.05; display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.heroMeta { font-family: 'Space Mono', monospace; font-size: 9px; letter-spacing: 1px; color: var(--brown2); }

/* kpi band */
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); border-top: 1px solid var(--rule); border-bottom: 2px solid var(--dark); margin: 0 -28px; }
.kpi { padding: 14px 22px; }
.kpiLabel { font-family: 'Space Mono', monospace; font-size: 8px; letter-spacing: 2px; text-transform: uppercase; color: var(--brown2); }
.kpiValue { font-family: 'Space Mono', monospace; font-size: 22px; font-weight: 700; margin-top: 6px; font-variant-numeric: tabular-nums; }
.kpiValue.err { color: var(--err); }
.kpiNoAnalytics { font-family: 'EB Garamond', serif; font-style: italic; font-size: 14px; color: var(--brown2); padding: 16px 0; }

/* разрыв R3 pill */
.gapPill { font-family: 'Space Mono', monospace; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding: 5px 12px; border: 1.5px solid var(--err); color: var(--err); background: var(--err-bg); display: inline-block; margin-top: 10px; }
.gapSub { font-family: 'Space Mono', monospace; font-size: 9px; color: var(--brown2); margin-top: 7px; letter-spacing: .5px; }
.noGap { font-family: 'Space Mono', monospace; font-size: 14px; color: var(--green); margin-top: 6px; }

/* sections */
.section { margin-top: 20px; }
.secHead { display: flex; align-items: baseline; justify-content: space-between; padding-bottom: 7px; border-bottom: 2px solid var(--dark); }
.secTitle { font-family: 'Space Mono', monospace; font-size: 9px; letter-spacing: 3px; text-transform: uppercase; color: var(--dark); font-weight: 700; }

/* period row */
.periodRow { display: flex; align-items: center; justify-content: space-between; padding: 14px 0; border-bottom: 1px solid var(--rule); }
.periodName { font-family: 'EB Garamond', serif; font-size: 18px; }
.periodSub  { font-family: 'Space Mono', monospace; font-size: 9px; letter-spacing: 1px; color: var(--brown2); margin-top: 3px; }
.periodActions { display: flex; align-items: center; gap: 12px; }
.openLink { font-family: 'Space Mono', monospace; font-size: 9px; letter-spacing: 1px; text-transform: uppercase; color: var(--accent); text-decoration: none; padding: 8px 14px; border: 1px solid rgba(212,130,74,.4); }

/* boq row */
.boqRow { display: flex; align-items: baseline; gap: 16px; padding: 14px 0; border-bottom: 1px solid var(--rule); }
.boqVersion { font-family: 'EB Garamond', serif; font-size: 18px; }
.boqCount   { font-family: 'Space Mono', monospace; font-size: 9px; color: var(--brown2); }

/* open period button */
.openPeriodBtn { font-family: 'Space Mono', monospace; font-size: 9px; letter-spacing: 2px; text-transform: uppercase; background: var(--dark); color: var(--accent); border: none; padding: 11px 18px; cursor: pointer; margin-top: 14px; }
.openPeriodBtn:disabled { opacity: .5; cursor: not-allowed; }

/* tables */
.table { width: 100%; border-collapse: collapse; }
.table thead th { font-family: 'Space Mono', monospace; font-size: 8px; letter-spacing: 2px; text-transform: uppercase; color: var(--dark); text-align: left; padding: 12px 0 7px; border-bottom: 2px solid var(--dark); font-weight: 700; }
.table tbody td { font-family: 'EB Garamond', serif; font-size: 15px; padding: 11px 0; border-bottom: 1px solid var(--rule); vertical-align: middle; }
.table tbody tr:last-child td { border-bottom: none; }
.monoCell { font-family: 'Space Mono', monospace; font-size: 11px; font-variant-numeric: tabular-nums; }
.errCell  { color: var(--err); }
.emptyCell { color: var(--rule); }
```

- [ ] **Step 3: Переписать `ObjectDetailPage.tsx` с CSS Modules**

```tsx
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useOpenPeriod } from '../hooks/useOpenPeriod';
import { getAuthUser } from '../store/auth';
import { useObjectDetail } from '../hooks/useObjectDetail';
import { StaleBanner } from '../components/StaleBanner';
import { ProgressBar } from '../components/ProgressBar';
import { BackLink } from '../components/BackLink';
import { StatusPill } from '../components/StatusPill';
import s from './ObjectDetailPage.module.css';

const PERIOD_STATUS_LABELS: Record<string, string> = {
  open: 'Открыт', gp_submitted: 'Генподрядчик подал данные',
  verification: 'Верификация', closed: 'Закрыт',
};

const OBJ_STATUS_LABELS: Record<string, string> = {
  active: 'Активный', paused: 'Приостановлен', closed: 'Завершён',
};

export function ObjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const objectId = parseInt(id ?? '0', 10);
  const { data, isLoading, isError } = useObjectDetail(objectId);
  const navigate = useNavigate();
  const openPeriod = useOpenPeriod();
  const user = getAuthUser();
  const canAct = user?.role === 'stroycontrol' || user?.role === 'admin';

  if (isLoading) return <div className={s.page}><div style={{ padding: '40px 0', fontFamily: 'Space Mono, monospace', fontSize: 11, color: 'var(--brown2)' }}>Загрузка...</div></div>;
  if (isError || !data) return <div className={s.page}><div style={{ padding: '20px 0', fontFamily: 'Space Mono, monospace', fontSize: 11, color: 'var(--err)' }}>Объект не найден.</div></div>;

  const { object: obj, participants, activeBoq, currentPeriod, hasAnalytics, current, history, meta } = data;

  return (
    <div className={s.page}>
      <div className={s.back}><BackLink to="/dashboard" label="Дашборд" /></div>

      <StaleBanner meta={meta} />

      <div className={s.hero}>
        <h1 className={s.heroTitle}>
          {obj.name}
          <StatusPill variant={obj.status === 'active' ? 'ok' : 'done'}>
            {OBJ_STATUS_LABELS[obj.status] ?? obj.status}
          </StatusPill>
        </h1>
        <div className={s.heroMeta}>
          {[obj.objectClass, obj.address, obj.permitNumber && `Разрешение: ${obj.permitNumber}`]
            .filter(Boolean).join(' · ')}
        </div>
      </div>

      {/* KPI band */}
      <div className={s.kpis}>
        <div className={s.kpi}>
          <div className={s.kpiLabel}>Готовность</div>
          {hasAnalytics
            ? <ProgressBar value={current?.objReadinessPct ?? null} />
            : <div className={s.kpiNoAnalytics}>Нет данных — закройте первый период</div>}
        </div>
        <div className={s.kpi}>
          <div className={s.kpiLabel}>Прогноз (взвеш.)</div>
          <div className={`${s.kpiValue} ${current?.gapFlag ? s.err : ''}`}>
            {current?.weightedForecastDate
              ? new Date(current.weightedForecastDate).toLocaleDateString('ru-RU')
              : '—'}
          </div>
        </div>
        <div className={s.kpi}>
          <div className={s.kpiLabel}>Прогноз (крит. путь)</div>
          <div className={`${s.kpiValue} ${current?.gapFlag ? s.err : ''}`}>
            {current?.criticalPathForecastDate
              ? new Date(current.criticalPathForecastDate).toLocaleDateString('ru-RU')
              : '—'}
          </div>
        </div>
        <div className={s.kpi}>
          <div className={s.kpiLabel}>Разрыв прогнозов</div>
          {current?.gapFlag
            ? <>
                <div className={s.gapPill}>Разрыв есть</div>
                <div className={s.gapSub}>Прогнозы расходятся</div>
              </>
            : <div className={s.noGap}>✓ Нет</div>}
        </div>
      </div>

      {/* Current period */}
      {currentPeriod && (
        <div className={s.section}>
          <div className={s.secHead}><span className={s.secTitle}>Текущий период</span></div>
          <div className={s.periodRow}>
            <div>
              <div className={s.periodName}>Период № {currentPeriod.periodNumber}</div>
              <div className={s.periodSub}>Открыт: {new Date(currentPeriod.openedAt).toLocaleDateString('ru-RU')}</div>
            </div>
            <div className={s.periodActions}>
              <StatusPill variant="gap">
                {PERIOD_STATUS_LABELS[currentPeriod.status] ?? currentPeriod.status}
              </StatusPill>
              <a className={s.openLink} onClick={() => void navigate(`/periods/${currentPeriod.id}`)}>
                Открыть →
              </a>
            </div>
          </div>
        </div>
      )}

      {!currentPeriod && canAct && (
        <div className={s.section}>
          <div className={s.secHead}><span className={s.secTitle}>Период</span></div>
          <button
            className={s.openPeriodBtn}
            onClick={() => openPeriod.mutate(objectId, { onSuccess: p => navigate(`/periods/${p.id}`) })}
            disabled={openPeriod.isPending}
          >
            {openPeriod.isPending ? 'Открываем...' : 'Открыть период'}
          </button>
        </div>
      )}

      {/* Active BoQ */}
      {activeBoq && (
        <div className={s.section}>
          <div className={s.secHead}><span className={s.secTitle}>Активный BoQ</span></div>
          <div className={s.boqRow}>
            <span className={s.boqVersion}>Версия {activeBoq.versionNumber}</span>
            <span className={s.boqCount}>{activeBoq.itemsCount} позиций</span>
          </div>
        </div>
      )}

      {/* Participants */}
      {participants.length > 0 && (
        <div className={s.section}>
          <div className={s.secHead}><span className={s.secTitle}>Участники</span></div>
          <table className={s.table}>
            <thead><tr><th>Роль</th><th>Организация</th><th>Контакт</th><th>С</th></tr></thead>
            <tbody>
              {participants.map((p, i) => (
                <tr key={i}>
                  <td>{p.role}</td>
                  <td>{p.orgName}</td>
                  <td>{p.contactPerson ?? <span className={s.emptyCell}>—</span>}</td>
                  <td className={s.monoCell}>{p.validFrom}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* History */}
      <div className={s.section}>
        <div className={s.secHead}>
          <span className={s.secTitle}>История периодов ({history.length})</span>
        </div>
        {history.length === 0
          ? <div className={s.boqRow}><span className={s.boqCount}>Нет закрытых периодов</span></div>
          : (
            <table className={s.table}>
              <thead>
                <tr><th>Период</th><th>Закрыт</th><th>Готовность</th><th>Прогноз (взвеш.)</th><th>Разрыв</th><th>BoQ</th></tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.periodId}>
                    <td className={s.monoCell}>#{h.periodNumber}</td>
                    <td className={s.monoCell}>{h.closedAt ? new Date(h.closedAt).toLocaleDateString('ru-RU') : '—'}</td>
                    <td><ProgressBar value={h.objectReadinessPct} /></td>
                    <td className={`${s.monoCell} ${h.gapFlag ? s.errCell : ''}`}>
                      {h.weightedForecastDate ? new Date(h.weightedForecastDate).toLocaleDateString('ru-RU') : '—'}
                    </td>
                    <td>{h.gapFlag
                      ? <StatusPill variant="gap">⚠</StatusPill>
                      : <span style={{ color: 'var(--green)', fontFamily: 'Space Mono, monospace', fontSize: 11 }}>✓</span>}
                    </td>
                    <td className={s.monoCell}>{h.boqVersionNumber}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Запустить тесты**

```bash
pnpm --filter @ccip/web test --run
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/ObjectDetailPage.tsx apps/web/src/pages/ObjectDetailPage.module.css
git commit -m "feat(web): redesign ObjectDetailPage with Ledger CSS Modules"
```

---

## Task 8: PeriodPage redesign

**Files:**
- Create: `apps/web/src/pages/PeriodPage.module.css`
- Modify: `apps/web/src/pages/PeriodPage.tsx`

- [ ] **Step 1: Создать `PeriodPage.module.css`**

```css
.page { padding: 0 28px 28px; }
.back { padding: 16px 0 0; display: block; }

/* hero */
.hero { padding: 14px 0 18px; border-bottom: 2px solid var(--dark); }
.h1   { font-family: 'EB Garamond', serif; font-size: 32px; font-weight: 500; margin: 0; }
.meta { font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: 1px; color: var(--brown2); margin-top: 6px; }

/* close bar */
.closeBar { display: flex; align-items: center; gap: 14px; padding: 14px 0 12px; border-bottom: 1px solid var(--rule); margin-bottom: 4px; }
.closeBtn { font-family: 'Space Mono', monospace; font-size: 9px; letter-spacing: 2px; text-transform: uppercase; background: var(--dark); color: var(--accent); border: none; padding: 11px 20px; cursor: pointer; }
.closeBtn:disabled { background: var(--rule); color: var(--brown2); cursor: not-allowed; }
.closeHint  { font-family: 'Space Mono', monospace; font-size: 10px; letter-spacing: .5px; color: var(--err); }
.errorMsg   { font-family: 'Space Mono', monospace; font-size: 10px; color: var(--err); margin-bottom: 8px; }

/* table */
.table { width: 100%; border-collapse: collapse; }
.table thead th {
  font-family: 'Space Mono', monospace; font-size: 8px; letter-spacing: 2px; text-transform: uppercase;
  color: var(--dark); text-align: left; padding: 11px 0 7px; border-bottom: 2px solid var(--dark); font-weight: 700; white-space: nowrap;
}
.table thead th.r { text-align: right; }
.table thead th.c { text-align: center; }
.table tbody td { padding: 12px 0; border-bottom: 1px solid var(--rule); vertical-align: middle; }
.table tbody tr:last-child td { border-bottom: none; }
.table tbody tr.hasDisc td { background: rgba(200,74,42,.04); }
.table td.r { text-align: right; }
.table td.c { text-align: center; }

.tdCode { font-family: 'Space Mono', monospace; font-size: 10px; color: var(--brown2); letter-spacing: .5px; padding-right: 12px; white-space: nowrap; }
.tdName { font-family: 'EB Garamond', serif; font-size: 17px; }
.tdUnit { font-family: 'Space Mono', monospace; font-size: 12px; color: var(--brown2); }
.tdNum  { font-family: 'Space Mono', monospace; font-size: 12px; font-variant-numeric: tabular-nums; }
.tdNum.empty { color: var(--rule); }

/* SC input */
.scInput { display: flex; align-items: center; gap: 6px; justify-content: flex-end; }
.scField {
  width: 70px; background: transparent; border: none; border-bottom: 2px solid var(--accent);
  color: var(--text); font-family: 'Space Mono', monospace; font-size: 13px;
  text-align: right; padding: 2px 0; outline: none;
}
.scOk {
  font-family: 'Space Mono', monospace; font-size: 8px; letter-spacing: 1px; text-transform: uppercase;
  background: var(--dark); color: var(--accent); border: none; padding: 5px 9px; cursor: pointer;
}
.scOk:disabled { opacity: .5; cursor: not-allowed; }
```

- [ ] **Step 2: Переписать `PeriodPage.tsx` с CSS Modules**

```tsx
import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { usePeriodDetail } from '../hooks/usePeriodDetail';
import { useUpsertFact } from '../hooks/useUpsertFact';
import { useClosePeriod } from '../hooks/useClosePeriod';
import { getAuthUser } from '../store/auth';
import { BackLink } from '../components/BackLink';
import { StepperTabs } from '../components/StepperTabs';
import { StatusPill } from '../components/StatusPill';
import s from './PeriodPage.module.css';

const STEPS = ['Открыт', 'ГП подал данные', 'Верификация', 'Закрыт'] as const;
type Step = typeof STEPS[number];

const STATUS_TO_STEP: Record<string, Step> = {
  open: 'Открыт', gp_submitted: 'ГП подал данные',
  verification: 'Верификация', closed: 'Закрыт',
};

const ERROR_LABELS: Record<string, string> = {
  PERIOD_ALREADY_OPEN:      'По объекту уже открыт период',
  ZERO_REPORT_NOT_APPROVED: 'Нулевой отчёт не утверждён',
  OPEN_DISCREPANCIES_EXIST: 'Есть незакрытые расхождения',
  PERIOD_WRONG_STATUS:      'Недопустимый статус для этого действия',
  PERIOD_LOCK_TIMEOUT:      'Таймаут блокировки — попробуйте ещё раз',
};

function extractError(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const msg = (err as { response: { data: { message?: string } } }).response?.data?.message;
    if (typeof msg === 'string') return ERROR_LABELS[msg] ?? msg;
  }
  return 'Произошла ошибка';
}

export function PeriodPage() {
  const { id } = useParams<{ id: string }>();
  const periodId = parseInt(id ?? '0', 10);
  const { data, isLoading, isError } = usePeriodDetail(periodId);
  const upsertFact  = useUpsertFact(periodId);
  const closePeriod = useClosePeriod(periodId);
  const [editValues, setEditValues] = useState<Record<number, string>>({});

  if (isLoading) return <div className={s.page}><div style={{ padding: '40px 0', fontFamily: 'Space Mono, monospace', fontSize: 11, color: 'var(--brown2)' }}>Загрузка...</div></div>;
  if (isError || !data)  return <div className={s.page}><div style={{ padding: '20px 0', fontFamily: 'Space Mono, monospace', fontSize: 11, color: 'var(--err)' }}>Период не найден.</div></div>;

  const user      = getAuthUser();
  const canAct    = user?.role === 'stroycontrol' || user?.role === 'admin';
  const canEdit   = data.status === 'gp_submitted' || data.status === 'verification';
  const showEdit  = canAct && canEdit;
  const canClose  = data.status === 'verification' && data.openDiscrepancyCount === 0;
  const currentStep = STATUS_TO_STEP[data.status] ?? 'Открыт';

  function handleFactSubmit(boqItemId: number) {
    const scVolume = parseFloat(editValues[boqItemId] ?? '');
    if (isNaN(scVolume)) return;
    upsertFact.mutate(
      { boqItemId, scVolume },
      { onSuccess: () => setEditValues(v => ({ ...v, [boqItemId]: '' })) },
    );
  }

  return (
    <div className={s.page}>
      <div className={s.back}>
        <BackLink to={`/objects/${data.objectId}`} label={`Объект #${data.objectId}`} />
      </div>

      <div className={s.hero}>
        <h1 className={s.h1}>Период № {data.periodNumber}</h1>
        <div className={s.meta}>Открыт · {data.status}</div>
      </div>

      <StepperTabs steps={STEPS} current={currentStep} />

      {canAct && (
        <div className={s.closeBar}>
          <button
            className={s.closeBtn}
            onClick={() => closePeriod.mutate()}
            disabled={!canClose || closePeriod.isPending}
          >
            {closePeriod.isPending ? 'Закрытие...' : 'Закрыть период'}
          </button>
          {data.status === 'verification' && data.openDiscrepancyCount > 0 && (
            <span className={s.closeHint}>
              Есть {data.openDiscrepancyCount} открытых расхождений
            </span>
          )}
          {data.status !== 'verification' && data.status !== 'closed' && (
            <span className={s.closeHint}>
              Закрытие доступно только на этапе «Верификация»
            </span>
          )}
        </div>
      )}

      {closePeriod.isError && <div className={s.errorMsg}>{extractError(closePeriod.error)}</div>}
      {upsertFact.isError  && <div className={s.errorMsg}>{extractError(upsertFact.error)}</div>}

      <table className={s.table}>
        <thead>
          <tr>
            <th>Код</th>
            <th>Наименование</th>
            <th className={s.c}>Ед.</th>
            <th className={s.r}>План</th>
            <th className={s.r}>Объём ГП</th>
            <th className={s.r}>Объём SC</th>
            <th className={s.r}>Расхождение</th>
            {showEdit && <th className={s.r}>Ввод SC</th>}
          </tr>
        </thead>
        <tbody>
          {data.positions.map(pos => (
            <tr
              key={pos.boqItemId}
              className={pos.discrepancyStatus === 'discrepancy' ? s.hasDisc : ''}
            >
              <td className={s.tdCode}>{pos.workCode}</td>
              <td className={s.tdName}>{pos.name}</td>
              <td className={`${s.tdUnit} ${s.c}`}>{pos.unit}</td>
              <td className={`${s.tdNum} ${s.r}`}>{pos.planVolume}</td>
              <td className={`${s.tdNum} ${s.r}`}>
                {pos.gpVolume ?? <span className={`${s.tdNum} ${s.empty}`}>—</span>}
              </td>
              <td className={`${s.tdNum} ${s.r}`}>
                {pos.scVolume ?? <span className={`${s.tdNum} ${s.empty}`}>—</span>}
              </td>
              <td className={s.r}>
                {pos.discrepancyStatus === null
                  ? <span className={`${s.tdNum} ${s.empty}`}>—</span>
                  : pos.discrepancyStatus === 'confirmed'
                    ? <StatusPill variant="ok">✓ Подтверждено</StatusPill>
                    : <StatusPill variant="err">⚠ Расхождение</StatusPill>}
              </td>
              {showEdit && (
                <td>
                  <div className={s.scInput}>
                    <input
                      type="number"
                      aria-label={`scVolume-${pos.boqItemId}`}
                      value={editValues[pos.boqItemId] ?? ''}
                      onChange={e => setEditValues(v => ({ ...v, [pos.boqItemId]: e.target.value }))}
                      className={s.scField}
                      min={0}
                    />
                    <button
                      className={s.scOk}
                      onClick={() => handleFactSubmit(pos.boqItemId)}
                      disabled={upsertFact.isPending}
                    >
                      ОК
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Запустить все тесты**

```bash
pnpm --filter @ccip/web test --run
```

Ожидание: все зелёные.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/PeriodPage.tsx apps/web/src/pages/PeriodPage.module.css
git commit -m "feat(web): redesign PeriodPage with Ledger CSS Modules"
```

---

## Self-Review

**Spec coverage:**
- ✓ Tokens → Task 1
- ✓ App Shell (sidebar, topbar) → Task 2
- ✓ BackLink → Task 3
- ✓ StatusPill → Task 3
- ✓ ProgressBar → Task 4
- ✓ StepperTabs → Task 5
- ✓ DashboardPage (hero, KPI, toolbar, table, footer) → Task 6
- ✓ ObjectDetailPage (hero, KPI с R3 разрывом, секции) → Task 7
- ✓ PeriodPage (stepper-табы, таблица, SC input) → Task 8
- ✓ GP Form не затронута
- ✓ Бэкенд-зависимость (periodNumber) задокументирована — objectClass используется вместо

**Placeholder scan:** нет TBD, TODO, «add appropriate styles» — все CSS классы прописаны.

**Type consistency:** `StatusPill variant` — 'gap' | 'ok' | 'done' | 'err' — используется одинаково во всех задачах. `StepperTabs steps/current` — readonly string[] + string — консистентно. `BackLink to/label` — string/string.

**Замечание:** `RefreshButton` ожидает `className` prop (Task 6, Step 4) — если компонент не принимает его, добавить в том же коммите.
