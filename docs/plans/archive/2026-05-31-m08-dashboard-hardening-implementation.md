# M-08 Dashboard Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cover the already-shipped director Dashboard in `apps/web` with Vitest tests and an ESLint flat config so `turbo test` / `turbo lint` include `@ccip/web`.

**Architecture:** The Dashboard implementation already exists (`apps/web/src`). These are **characterization tests** over existing code: write the test, run it, expect it to PASS (green) against the current implementation. A red result means either a test bug or a real defect — investigate, don't blindly "make it pass". Test runner is Vitest (chosen over jest because `services/api.ts` uses `import.meta.env`, which jest can't load without a babel/ts-jest hack); Vitest reuses the existing `vite.config.ts`.

**Tech Stack:** Vite 6 · React 18 · TypeScript 5.7 · React Query 5 · Vitest · @testing-library/react · jsdom · ESLint flat config (typescript-eslint + react plugins).

**Design spec:** `docs/plans/2026-05-31-m08-dashboard-hardening-design.md`

**Branch:** `feat/m-08-dashboard-hardening` (off `main`).

---

## File Structure

**Created:**
- `apps/web/src/test/setup.ts` — jest-dom matcher registration for Vitest
- `apps/web/eslint.config.mjs` — ESLint flat config for the web app
- `apps/web/src/store/__tests__/auth.test.ts`
- `apps/web/src/components/__tests__/RoleGate.test.tsx`
- `apps/web/src/services/__tests__/api.test.ts`
- `apps/web/src/hooks/__tests__/hooks.test.tsx`
- `apps/web/src/components/__tests__/components.test.tsx`
- `apps/web/src/pages/__tests__/DashboardPage.test.tsx`

**Modified:**
- `apps/web/package.json` — devDeps + `test`/`test:watch`/`lint` scripts
- `apps/web/vite.config.ts` — `test` section (jsdom, globals, setupFiles)
- `apps/web/tsconfig.json` — add `vitest/globals` + `@testing-library/jest-dom` types

---

## Task 1: Vitest + ESLint infrastructure

This task is setup (not TDD). It ends green with one smoke test and a passing lint run.

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/vite.config.ts`
- Create: `apps/web/src/test/setup.ts`
- Modify: `apps/web/tsconfig.json`
- Create: `apps/web/eslint.config.mjs`

- [ ] **Step 1: Install dev dependencies**

Run (from repo root):
```bash
pnpm --filter @ccip/web add -D vitest@^2.1.0 @testing-library/react@^16.1.0 @testing-library/jest-dom@^6.6.0 @testing-library/user-event@^14.5.0 jsdom@^25.0.0 eslint@^9.17.0 typescript-eslint@^8.18.0 @eslint/js@^9.17.0 eslint-plugin-react@^7.37.0 eslint-plugin-react-hooks@^5.1.0 globals@^15.14.0
```
Expected: `package.json` gains the devDependencies; pnpm lockfile updates.

- [ ] **Step 2: Add the `test` section to `vite.config.ts`**

Replace the full contents of `apps/web/vite.config.ts` with:
```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3000', rewrite: (p) => p.replace(/^\/api/, '') },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

- [ ] **Step 3: Create the test setup file**

Create `apps/web/src/test/setup.ts`:
```ts
import '@testing-library/jest-dom';
```

- [ ] **Step 4: Add test type roots to `tsconfig.json`**

Replace the full contents of `apps/web/tsconfig.json` with:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Create the ESLint flat config**

Create `apps/web/eslint.config.mjs`:
```js
// @ts-check
import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', 'dist/**', 'vite.config.ts'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
```

- [ ] **Step 6: Add scripts to `package.json`**

In `apps/web/package.json`, set the `scripts` block to:
```json
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "typecheck": "tsc --noEmit",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint . --fix"
  },
```

- [ ] **Step 7: Add a smoke test and verify infra works**

Create `apps/web/src/test/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('vitest infra', () => {
  it('runs and jsdom provides localStorage', () => {
    localStorage.setItem('k', 'v');
    expect(localStorage.getItem('k')).toBe('v');
  });
});
```

Run: `pnpm --filter @ccip/web test`
Expected: PASS (1 test). Confirms jsdom environment + globals work.

Run: `pnpm --filter @ccip/web lint`
Expected: exits 0 (no errors on existing source).

- [ ] **Step 8: Delete the smoke test and commit infra**

Delete `apps/web/src/test/smoke.test.ts` (it was only an infra probe).

```bash
git add apps/web/package.json apps/web/vite.config.ts apps/web/tsconfig.json apps/web/src/test/setup.ts apps/web/eslint.config.mjs pnpm-lock.yaml
git commit -m "test(web): add Vitest + RTL infra and ESLint flat config for @ccip/web"
```

---

## Task 2: `getAuthUser` tests

**Files:**
- Test: `apps/web/src/store/__tests__/auth.test.ts`
- Reference (do not modify): `apps/web/src/store/auth.ts`

- [ ] **Step 1: Write the test**

Create `apps/web/src/store/__tests__/auth.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getAuthUser } from '../auth';

describe('getAuthUser', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when auth_user is absent', () => {
    expect(getAuthUser()).toBeNull();
  });

  it('parses a valid stored user', () => {
    const user = { id: 'u1', email: 'a@b.c', role: 'director' as const };
    localStorage.setItem('auth_user', JSON.stringify(user));
    expect(getAuthUser()).toEqual(user);
  });

  it('returns null on malformed JSON', () => {
    localStorage.setItem('auth_user', '{not json');
    expect(getAuthUser()).toBeNull();
  });
});
```

- [ ] **Step 2: Run and confirm green**

Run: `pnpm --filter @ccip/web test src/store/__tests__/auth.test.ts`
Expected: PASS (3 tests). A failure here means the test mis-describes existing behavior — fix the test.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/store/__tests__/auth.test.ts
git commit -m "test(web): characterize getAuthUser (null/valid/malformed)"
```

---

## Task 3: `RoleGate` tests

**Files:**
- Test: `apps/web/src/components/__tests__/RoleGate.test.tsx`
- Reference (do not modify): `apps/web/src/components/RoleGate.tsx`

- [ ] **Step 1: Write the test**

Create `apps/web/src/components/__tests__/RoleGate.test.tsx`:
```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoleGate } from '../RoleGate';

function setUser(role: string) {
  localStorage.setItem('auth_user', JSON.stringify({ id: 'u1', email: 'a@b.c', role }));
}

describe('RoleGate', () => {
  beforeEach(() => localStorage.clear());

  it('renders children when the role is allowed', () => {
    setUser('admin');
    render(<RoleGate allow={['admin']}>secret</RoleGate>);
    expect(screen.getByText('secret')).toBeInTheDocument();
  });

  it('renders fallback when the role is not allowed', () => {
    setUser('director');
    render(
      <RoleGate allow={['admin']} fallback={<span>denied</span>}>
        secret
      </RoleGate>,
    );
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    expect(screen.getByText('denied')).toBeInTheDocument();
  });

  it('renders nothing when there is no user', () => {
    render(<RoleGate allow={['admin']}>secret</RoleGate>);
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run and confirm green**

Run: `pnpm --filter @ccip/web test src/components/__tests__/RoleGate.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/__tests__/RoleGate.test.tsx
git commit -m "test(web): characterize RoleGate (allow/deny/no-user)"
```

---

## Task 4: axios request interceptor tests

**Files:**
- Test: `apps/web/src/services/__tests__/api.test.ts`
- Reference (do not modify): `apps/web/src/services/api.ts`

- [ ] **Step 1: Write the test**

The interceptor handler is registered on `api.interceptors.request`. Invoke its `fulfilled` callback directly with a minimal config. This also exercises `import.meta.env` resolution in `api.ts` (Vitest handles it natively).

Create `apps/web/src/services/__tests__/api.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { api } from '../api';

interface RequestHandler {
  fulfilled: (config: { headers: Record<string, unknown> }) => { headers: Record<string, unknown> };
}

function runRequestInterceptor(config: { headers: Record<string, unknown> }) {
  const manager = api.interceptors.request as unknown as { handlers: RequestHandler[] };
  return manager.handlers[0].fulfilled(config);
}

describe('api request interceptor', () => {
  beforeEach(() => localStorage.clear());

  it('adds a Bearer Authorization header when a token is present', () => {
    localStorage.setItem('access_token', 'tok123');
    const result = runRequestInterceptor({ headers: {} });
    expect(result.headers.Authorization).toBe('Bearer tok123');
  });

  it('leaves Authorization unset when there is no token', () => {
    const result = runRequestInterceptor({ headers: {} });
    expect(result.headers.Authorization).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run and confirm green**

Run: `pnpm --filter @ccip/web test src/services/__tests__/api.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/services/__tests__/api.test.ts
git commit -m "test(web): characterize axios auth interceptor (token/no-token)"
```

---

## Task 5: React Query hooks tests

**Files:**
- Test: `apps/web/src/hooks/__tests__/hooks.test.tsx`
- Reference (do not modify): `apps/web/src/hooks/useDashboard.ts`, `useObjectDetail.ts`, `useRefreshDashboard.ts`

- [ ] **Step 1: Write the test**

Mock the whole `services/api` module so the hooks call mocked functions. Wrap hooks in a `QueryClientProvider`.

Create `apps/web/src/hooks/__tests__/hooks.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDashboard } from '../useDashboard';
import { useObjectDetail } from '../useObjectDetail';
import { useRefreshDashboard } from '../useRefreshDashboard';
import { dashboardApi, objectsApi, type DashboardResponse, type ObjectDetailResponse } from '../../services/api';

vi.mock('../../services/api', () => ({
  dashboardApi: { list: vi.fn(), refreshDashboard: vi.fn() },
  objectsApi: { detail: vi.fn() },
}));

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function freshClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

const dashboardResponse: DashboardResponse = {
  items: [],
  pagination: { page: 1, pageSize: 50, total: 0 },
  meta: { isStale: false, refreshedAt: null, staleReason: null },
};

describe('dashboard hooks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('useDashboard calls dashboardApi.list with params and returns data', async () => {
    const params = { page: 1, pageSize: 50, sort: 'gapFirst' as const };
    vi.mocked(dashboardApi.list).mockResolvedValue(dashboardResponse);

    const { result } = renderHook(() => useDashboard(params), { wrapper: makeWrapper(freshClient()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(dashboardApi.list).toHaveBeenCalledWith(params);
    expect(result.current.data).toEqual(dashboardResponse);
  });

  it('useObjectDetail calls objectsApi.detail with the id', async () => {
    vi.mocked(objectsApi.detail).mockResolvedValue({} as ObjectDetailResponse);

    const { result } = renderHook(() => useObjectDetail(42), { wrapper: makeWrapper(freshClient()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(objectsApi.detail).toHaveBeenCalledWith(42);
  });

  it('useRefreshDashboard invalidates dashboard and objectDetail queries on success', async () => {
    vi.mocked(dashboardApi.refreshDashboard).mockResolvedValue({ refreshedAt: '2026-01-01T00:00:00Z' });
    const client = freshClient();
    const spy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useRefreshDashboard(), { wrapper: makeWrapper(client) });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(spy).toHaveBeenCalledWith({ queryKey: ['dashboard'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['objectDetail'] });
  });
});
```

- [ ] **Step 2: Run and confirm green**

Run: `pnpm --filter @ccip/web test src/hooks/__tests__/hooks.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/__tests__/hooks.test.tsx
git commit -m "test(web): characterize dashboard/objectDetail/refresh hooks"
```

---

## Task 6: Presentational components tests

**Files:**
- Test: `apps/web/src/components/__tests__/components.test.tsx`
- Reference (do not modify): `StaleBanner.tsx`, `ProgressBar.tsx`, `EmptyCell.tsx`, `RefreshButton.tsx`

- [ ] **Step 1: Write the test**

`RefreshButton` depends on `useRefreshDashboard`; mock that hook so no QueryClient is needed.

Create `apps/web/src/components/__tests__/components.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StaleBanner } from '../StaleBanner';
import { ProgressBar } from '../ProgressBar';
import { EmptyCell } from '../EmptyCell';
import { RefreshButton } from '../RefreshButton';
import { useRefreshDashboard } from '../../hooks/useRefreshDashboard';

vi.mock('../../hooks/useRefreshDashboard', () => ({
  useRefreshDashboard: vi.fn(),
}));

describe('StaleBanner', () => {
  it('renders nothing when not stale', () => {
    const { container } = render(
      <StaleBanner meta={{ isStale: false, refreshedAt: null, staleReason: null }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the warning when stale', () => {
    render(
      <StaleBanner
        meta={{ isStale: true, refreshedAt: new Date().toISOString(), staleReason: 'older_than_30min' }}
      />,
    );
    expect(screen.getByText(/обратитесь к администратору/)).toBeInTheDocument();
  });
});

describe('ProgressBar', () => {
  it('renders a dash when value is null', () => {
    render(<ProgressBar value={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders the percentage with one decimal', () => {
    render(<ProgressBar value={42.5} />);
    expect(screen.getByText('42.5%')).toBeInTheDocument();
  });

  it('clamps values above 100', () => {
    render(<ProgressBar value={150} />);
    expect(screen.getByText('100.0%')).toBeInTheDocument();
  });
});

describe('EmptyCell', () => {
  it.each([null, undefined, ''])('renders a dash for %p', (value) => {
    render(<EmptyCell value={value} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders the value when present', () => {
    render(<EmptyCell value="2026-06-01" />);
    expect(screen.getByText('2026-06-01')).toBeInTheDocument();
  });
});

describe('RefreshButton', () => {
  it('renders the idle label and calls mutate on click', async () => {
    const mutate = vi.fn();
    vi.mocked(useRefreshDashboard).mockReturnValue({ mutate, isPending: false } as unknown as ReturnType<typeof useRefreshDashboard>);
    render(<RefreshButton />);
    await userEvent.click(screen.getByRole('button', { name: 'Обновить данные' }));
    expect(mutate).toHaveBeenCalled();
  });

  it('renders the pending label and is disabled while pending', () => {
    vi.mocked(useRefreshDashboard).mockReturnValue({ mutate: vi.fn(), isPending: true } as unknown as ReturnType<typeof useRefreshDashboard>);
    render(<RefreshButton />);
    expect(screen.getByRole('button', { name: 'Обновление...' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run and confirm green**

Run: `pnpm --filter @ccip/web test src/components/__tests__/components.test.tsx`
Expected: PASS (StaleBanner 2, ProgressBar 3, EmptyCell 4, RefreshButton 2 = 11 tests).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/__tests__/components.test.tsx
git commit -m "test(web): characterize StaleBanner/ProgressBar/EmptyCell/RefreshButton"
```

---

## Task 7: `DashboardPage` component tests

**Files:**
- Test: `apps/web/src/pages/__tests__/DashboardPage.test.tsx`
- Reference (do not modify): `apps/web/src/pages/DashboardPage.tsx`

- [ ] **Step 1: Write the test**

Mock `useDashboard` (controls rendered data) and `react-router-dom`'s `useNavigate`. Keep `localStorage` empty so `RoleGate allow={['admin']}` hides `RefreshButton` (avoids needing a QueryClient).

Create `apps/web/src/pages/__tests__/DashboardPage.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardPage } from '../DashboardPage';
import { useDashboard } from '../../hooks/useDashboard';
import type { DashboardResponse } from '../../services/api';

vi.mock('../../hooks/useDashboard', () => ({ useDashboard: vi.fn() }));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

function dataWithRows(): DashboardResponse {
  return {
    items: [
      {
        objectId: 1,
        name: 'Объект А',
        objectClass: null,
        status: 'active',
        hasAnalytics: true,
        objReadinessPct: 50,
        weightedForecastDate: '2026-07-01',
        criticalPathForecastDate: '2026-08-01',
        gapFlag: false,
      },
    ],
    pagination: { page: 1, pageSize: 50, total: 1 },
    meta: { isStale: false, refreshedAt: new Date().toISOString(), staleReason: null },
  };
}

type UseDashboardReturn = ReturnType<typeof useDashboard>;
function mockReturn(over: Partial<UseDashboardReturn>) {
  return { data: undefined, isLoading: false, isError: false, ...over } as unknown as UseDashboardReturn;
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders a row from the data', () => {
    vi.mocked(useDashboard).mockReturnValue(mockReturn({ data: dataWithRows() }));
    render(<DashboardPage />);
    expect(screen.getByText('Объект А')).toBeInTheDocument();
    expect(screen.getByText('50.0%')).toBeInTheDocument();
  });

  it('renders the empty-state when there are no items', () => {
    const empty = dataWithRows();
    empty.items = [];
    empty.pagination.total = 0;
    vi.mocked(useDashboard).mockReturnValue(mockReturn({ data: empty }));
    render(<DashboardPage />);
    expect(screen.getByText('Нет объектов в организации')).toBeInTheDocument();
  });

  it('renders the stale banner when meta.isStale', () => {
    const stale = dataWithRows();
    stale.meta = { isStale: true, refreshedAt: new Date().toISOString(), staleReason: 'mv_refresh_failed' };
    vi.mocked(useDashboard).mockReturnValue(mockReturn({ data: stale }));
    render(<DashboardPage />);
    expect(screen.getByText(/обратитесь к администратору/)).toBeInTheDocument();
  });

  it('passes the updated sort to useDashboard when the sort select changes', async () => {
    vi.mocked(useDashboard).mockReturnValue(mockReturn({ data: dataWithRows() }));
    render(<DashboardPage />);
    await userEvent.selectOptions(screen.getByDisplayValue('Сначала с разрывом'), 'nameAsc');
    const lastCall = vi.mocked(useDashboard).mock.calls.at(-1)?.[0];
    expect(lastCall).toMatchObject({ sort: 'nameAsc' });
  });

  it('navigates to the object detail page on row click', async () => {
    vi.mocked(useDashboard).mockReturnValue(mockReturn({ data: dataWithRows() }));
    render(<DashboardPage />);
    await userEvent.click(screen.getByText('Объект А'));
    expect(navigateMock).toHaveBeenCalledWith('/objects/1');
  });
});
```

- [ ] **Step 2: Run and confirm green**

Run: `pnpm --filter @ccip/web test src/pages/__tests__/DashboardPage.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/__tests__/DashboardPage.test.tsx
git commit -m "test(web): characterize DashboardPage (rows/empty/stale/sort/nav)"
```

---

## Task 8: Full suite + lint green; record state

**Files:**
- Reference: `turbo.json` (already has `test` and `lint` tasks)

- [ ] **Step 1: Run the web suite and lint in isolation**

Run: `pnpm --filter @ccip/web test`
Expected: PASS — 5 test files, ~24 tests total (auth 3, RoleGate 3, api 2, hooks 3, components 11, DashboardPage 5 — minus smoke which was deleted).

Run: `pnpm --filter @ccip/web lint`
Expected: exits 0.

- [ ] **Step 2: Run the monorepo gates**

Run: `npx turbo test`
Expected: `@ccip/web#test` now appears and passes. (`@ccip/database#test` may still fail on the unrelated pg_cron job — that is PR #9, out of scope; do not let it block, but note it in the commit/PR.)

Run: `npx turbo lint`
Expected: `@ccip/web#lint` passes.

Run: `node tools/audit/audit-suite.js`
Expected: `Summary: 18/18 passed` (pre-commit gate).

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "test(web): wire @ccip/web into turbo test/lint gates"
```

- [ ] **Step 4: Record state**

After this branch merges to `main`, update `docs/project-state.md` footnote ² to mark Dashboard as test-covered. (The footnote currently lives on `feat/m-05c-analytics-mv-refresh`; reconcile during the merge of these doc updates into `main` — do not duplicate-edit it on this branch.)

---

## Self-Review

**Spec coverage** (against `2026-05-31-m08-dashboard-hardening-design.md`):
- §1 Vitest infra → Task 1 (steps 1–4, 6–7) ✓
- §2 ESLint flat config → Task 1 (step 5) ✓
- §3 coverage table: `getAuthUser` → Task 2; `RoleGate` → Task 3; api interceptor → Task 4; hooks → Task 5; presentational components → Task 6; `DashboardPage` → Task 7 ✓
- §4 YAGNI (no Period Cycle / GP Form / E2E) → not in plan ✓
- §5 `gp`↔`engineer` drift → not closed here by design; `RoleGate`/`getAuthUser` tests use existing roles only ✓
- §6 readiness (`turbo test`/`turbo lint` green incl. `@ccip/web`) → Task 8 ✓

**Placeholder scan:** No TBD/TODO; every code step contains full file or block content. ✓

**Type consistency:** Test helpers reuse exported types (`DashboardResponse`, `ObjectDetailResponse`, `DashboardQuery`, `ReturnType<typeof useDashboard>`); mocked module shape (`dashboardApi.list/refreshDashboard`, `objectsApi.detail`) matches `services/api.ts`; query keys (`['dashboard']`, `['objectDetail']`) match the hooks. ✓
