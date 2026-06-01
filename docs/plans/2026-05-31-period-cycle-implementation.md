# Period Cycle (стройконтроль) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Period Cycle UI for `stroycontrol` — open a period, enter SC facts, and close it — backed by a new `GET /periods/:id/detail` endpoint that returns BoQ positions merged with period facts.

**Architecture:** Backend-first: add `getDetail()` to `PeriodService` (fetches BoQ items for the period's version and joins them with `periodFacts`), then wire `/periods/:id/detail` in the controller. Frontend builds `periodApi`, four React Query hooks, a `PeriodPage` at `/periods/:id`, and a small update to `ObjectDetailPage` (replace MVP stub with real link + open-period action).

**Tech Stack:** NestJS + Prisma (backend) · Vite 6 · React 18 · TS 5.7 · React Query 5 · Vitest + RTL (frontend tests) · jest (backend tests).

**Branch:** `feat/m-08-period-cycle` (already created from `main`).

**Design spec:** `docs/plans/2026-05-31-period-cycle-design.md`

---

## File Structure

**Backend — modified:**
- `apps/api/src/modules/period/period.service.ts` — add `getDetail()` method
- `apps/api/src/modules/period/period.controller.ts` — add `GET :id/detail` endpoint
- `apps/api/src/modules/period/__tests__/period.service.spec.ts` — add `getDetail` tests

**Frontend — new:**
- `apps/web/src/services/__tests__/period-api.test.ts`
- `apps/web/src/hooks/usePeriodDetail.ts`
- `apps/web/src/hooks/useOpenPeriod.ts`
- `apps/web/src/hooks/useUpsertFact.ts`
- `apps/web/src/hooks/useClosePeriod.ts`
- `apps/web/src/hooks/__tests__/period-hooks.test.tsx`
- `apps/web/src/pages/PeriodPage.tsx`
- `apps/web/src/pages/__tests__/PeriodPage.test.tsx`
- `apps/web/src/pages/__tests__/ObjectDetailPage.test.tsx`

**Frontend — modified:**
- `apps/web/src/services/api.ts` — add `PeriodPosition`, `PeriodDetailResponse`, `periodApi`
- `apps/web/src/pages/ObjectDetailPage.tsx` — replace MVP stub, fix vocab drift, add open-period action
- `apps/web/src/main.tsx` — add `/periods/:id` route

---

## Task 1: Backend — `getDetail` service method + controller endpoint (TDD)

**Files:**
- Test: `apps/api/src/modules/period/__tests__/period.service.spec.ts`
- Modify: `apps/api/src/modules/period/period.service.ts`
- Modify: `apps/api/src/modules/period/period.controller.ts`

- [ ] **Step 1: Write the failing tests**

Add the following `describe('getDetail', ...)` block to `apps/api/src/modules/period/__tests__/period.service.spec.ts`, after the existing `describe('findById', ...)` block. The `prisma.discrepancy.count` mock already exists in the `beforeEach` setup (line ~107–109).

```typescript
// ─── getDetail ──────────────────────────────────────────────────────────────

describe('getDetail', () => {
  const boqItems = [
    {
      id: BOQ_ITEM_ID,
      workCode: 'C-01',
      name: 'Earthworks',
      unit: 'm3',
      planVolume: '200',
    },
    {
      id: BOQ_ITEM_ID + 1,
      workCode: 'C-02',
      name: 'Concrete',
      unit: 'm3',
      planVolume: '100',
    },
  ];

  const periodWithDetail = {
    ...makePeriod({ status: 'verification' }),
    boqVersion: { boqItems },
    periodFacts: [
      {
        boqItemId: BOQ_ITEM_ID,
        gpVolume: '150',
        scVolume: '140',
        discrepancyType: 1,
        discrepancyStatus: 'open',
        acceptedVolume: null,
      },
    ],
  };

  it('returns merged positions for the period BoQ version', async () => {
    (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValueOnce({
      organizationId: ORG_ID,
    });
    (prisma.period.findFirst as jest.Mock).mockResolvedValueOnce(
      periodWithDetail,
    );
    (prisma.discrepancy.count as jest.Mock).mockResolvedValueOnce(1);

    const result = await service.getDetail(PERIOD_ID, ACTOR_ID);

    expect(result.id).toBe(PERIOD_ID);
    expect(result.status).toBe('verification');
    expect(result.positions).toHaveLength(2);
    expect(result.positions[0]).toMatchObject({
      boqItemId: BOQ_ITEM_ID,
      workCode: 'C-01',
      name: 'Earthworks',
      unit: 'm3',
      planVolume: 200,
      gpVolume: 150,
      scVolume: 140,
      discrepancyType: 1,
      discrepancyStatus: 'open',
      acceptedVolume: null,
    });
    expect(result.positions[1]).toMatchObject({
      boqItemId: BOQ_ITEM_ID + 1,
      gpVolume: null,
      scVolume: null,
      discrepancyStatus: null,
    });
    expect(result.openDiscrepancyCount).toBe(1);
  });

  it('throws NotFoundException when period is not in actor organisation', async () => {
    (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValueOnce({
      organizationId: ORG_ID,
    });
    (prisma.period.findFirst as jest.Mock).mockResolvedValueOnce(null);

    await expect(service.getDetail(PERIOD_ID, ACTOR_ID)).rejects.toThrow(
      NotFoundException,
    );
  });
});
```

- [ ] **Step 2: Run the failing tests**

```bash
pnpm --filter @ccip/api test -- --testPathPattern="period.service.spec"
```
Expected: **FAIL** — `TypeError: service.getDetail is not a function` (method doesn't exist yet).

- [ ] **Step 3: Implement `getDetail` in `period.service.ts`**

Add the following method to `PeriodService`, after the `findById` method (around line 126):

```typescript
// ─── getDetail ──────────────────────────────────────────────────────────────

async getDetail(periodId: number, actorId: number) {
  const actor = await this.prisma.user.findUniqueOrThrow({
    where: { id: actorId },
    select: { organizationId: true },
  });

  const period = await this.prisma.period.findFirst({
    where: {
      id: periodId,
      object: { organizationId: actor.organizationId },
    },
    include: {
      boqVersion: {
        include: {
          boqItems: {
            select: {
              id: true,
              workCode: true,
              name: true,
              unit: true,
              planVolume: true,
            },
            orderBy: { id: 'asc' },
          },
        },
      },
      periodFacts: {
        select: {
          boqItemId: true,
          gpVolume: true,
          scVolume: true,
          discrepancyType: true,
          discrepancyStatus: true,
          acceptedVolume: true,
        },
      },
    },
  });

  if (!period) throw new NotFoundException('PERIOD_NOT_FOUND');

  const factMap = new Map(
    period.periodFacts.map((f) => [f.boqItemId, f]),
  );

  const positions = period.boqVersion.boqItems.map((item) => {
    const f = factMap.get(item.id);
    return {
      boqItemId: item.id,
      workCode: item.workCode,
      name: item.name,
      unit: item.unit ?? '',
      planVolume: Number(item.planVolume),
      gpVolume: f?.gpVolume != null ? Number(f.gpVolume) : null,
      scVolume: f?.scVolume != null ? Number(f.scVolume) : null,
      discrepancyType: f?.discrepancyType ?? null,
      discrepancyStatus: f?.discrepancyStatus ?? null,
      acceptedVolume: f?.acceptedVolume != null ? Number(f.acceptedVolume) : null,
    };
  });

  const openDiscrepancyCount = await this.prisma.discrepancy.count({
    where: { periodFact: { periodId }, status: 'open' },
  });

  return {
    id: period.id,
    periodNumber: period.periodNumber,
    status: period.status as 'open' | 'gp_submitted' | 'verification' | 'closed',
    openedAt: period.openedAt.toISOString(),
    closedAt: period.closedAt?.toISOString() ?? null,
    objectId: period.objectId,
    boqVersionId: period.boqVersionId,
    positions,
    openDiscrepancyCount,
  };
}
```

- [ ] **Step 4: Add the controller endpoint in `period.controller.ts`**

Add the following method after the existing `findById` method (around line 40):

```typescript
@Get(':id/detail')
@Roles('director', 'stroycontrol', 'admin')
getDetail(
  @Param('id', ParseIntPipe) id: number,
  @Request() req: AuthRequest,
) {
  return this.periodService.getDetail(id, parseInt(req.user.id, 10));
}
```

- [ ] **Step 5: Run tests — confirm green**

```bash
pnpm --filter @ccip/api test -- --testPathPattern="period.service.spec"
```
Expected: all period service tests pass (including the two new `getDetail` tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/period/period.service.ts apps/api/src/modules/period/period.controller.ts apps/api/src/modules/period/__tests__/period.service.spec.ts
git commit -m "feat(api): GET /periods/:id/detail — BoQ positions merged with facts + openDiscrepancyCount"
```

---

## Task 2: Frontend — `periodApi` types + service functions (TDD)

**Files:**
- Create: `apps/web/src/services/__tests__/period-api.test.ts`
- Modify: `apps/web/src/services/api.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/services/__tests__/period-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, periodApi } from '../api';

describe('periodApi', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('getDetail calls GET /periods/:id/detail', async () => {
    const spy = vi.spyOn(api, 'get').mockResolvedValue({ data: {} });
    await periodApi.getDetail(42);
    expect(spy).toHaveBeenCalledWith('/periods/42/detail');
  });

  it('open calls POST /periods/open with objectId', async () => {
    const spy = vi.spyOn(api, 'post').mockResolvedValue({ data: { id: 5 } });
    await periodApi.open(10);
    expect(spy).toHaveBeenCalledWith('/periods/open', { objectId: 10 });
  });

  it('upsertFact calls PATCH /periods/:id/facts/:boqItemId with scVolume', async () => {
    const spy = vi.spyOn(api, 'patch').mockResolvedValue({ data: undefined });
    await periodApi.upsertFact(5, 7, 42.5);
    expect(spy).toHaveBeenCalledWith('/periods/5/facts/7', { scVolume: 42.5 });
  });

  it('close calls PATCH /periods/:id/close', async () => {
    const spy = vi.spyOn(api, 'patch').mockResolvedValue({ data: undefined });
    await periodApi.close(5);
    expect(spy).toHaveBeenCalledWith('/periods/5/close');
  });
});
```

- [ ] **Step 2: Run — confirm FAIL**

```bash
pnpm --filter @ccip/web test src/services/__tests__/period-api.test.ts
```
Expected: FAIL — `periodApi is not exported from '../api'`.

- [ ] **Step 3: Add types and `periodApi` to `apps/web/src/services/api.ts`**

Append to the end of `apps/web/src/services/api.ts` (after the existing `objectsApi` block):

```typescript
export type PeriodPosition = {
  boqItemId: number;
  workCode: string;
  name: string;
  unit: string;
  planVolume: number;
  gpVolume: number | null;
  scVolume: number | null;
  discrepancyType: number | null;
  discrepancyStatus: string | null;
  acceptedVolume: number | null;
};

export type PeriodDetailResponse = {
  id: number;
  periodNumber: number;
  status: 'open' | 'gp_submitted' | 'verification' | 'closed';
  openedAt: string;
  closedAt: string | null;
  objectId: number;
  boqVersionId: number;
  positions: PeriodPosition[];
  openDiscrepancyCount: number;
};

export const periodApi = {
  getDetail: (id: number) =>
    api.get<PeriodDetailResponse>(`/periods/${id}/detail`).then((r) => r.data),
  open: (objectId: number) =>
    api.post<{ id: number }>('/periods/open', { objectId }).then((r) => r.data),
  upsertFact: (periodId: number, boqItemId: number, scVolume: number) =>
    api
      .patch<void>(`/periods/${periodId}/facts/${boqItemId}`, { scVolume })
      .then((r) => r.data),
  close: (periodId: number) =>
    api.patch<void>(`/periods/${periodId}/close`).then((r) => r.data),
};
```

- [ ] **Step 4: Run — confirm green**

```bash
pnpm --filter @ccip/web test src/services/__tests__/period-api.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/services/api.ts apps/web/src/services/__tests__/period-api.test.ts
git commit -m "feat(web): add PeriodDetailResponse types and periodApi service functions"
```

---

## Task 3: Frontend — period hooks (TDD)

**Files:**
- Create: `apps/web/src/hooks/__tests__/period-hooks.test.tsx`
- Create: `apps/web/src/hooks/usePeriodDetail.ts`
- Create: `apps/web/src/hooks/useOpenPeriod.ts`
- Create: `apps/web/src/hooks/useUpsertFact.ts`
- Create: `apps/web/src/hooks/useClosePeriod.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/hooks/__tests__/period-hooks.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePeriodDetail } from '../usePeriodDetail';
import { useOpenPeriod } from '../useOpenPeriod';
import { useUpsertFact } from '../useUpsertFact';
import { useClosePeriod } from '../useClosePeriod';
import { periodApi, type PeriodDetailResponse } from '../../services/api';

vi.mock('../../services/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  periodApi: {
    getDetail: vi.fn(),
    open: vi.fn(),
    upsertFact: vi.fn(),
    close: vi.fn(),
  },
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

const mockDetail: PeriodDetailResponse = {
  id: 1,
  periodNumber: 1,
  status: 'verification',
  openedAt: '2026-05-01T00:00:00Z',
  closedAt: null,
  objectId: 10,
  boqVersionId: 5,
  positions: [],
  openDiscrepancyCount: 0,
};

describe('period hooks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('usePeriodDetail fetches under ["period", id] key', async () => {
    vi.mocked(periodApi.getDetail).mockResolvedValue(mockDetail);
    const { result } = renderHook(() => usePeriodDetail(1), {
      wrapper: makeWrapper(freshClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(periodApi.getDetail).toHaveBeenCalledWith(1);
    expect(result.current.data).toEqual(mockDetail);
  });

  it('usePeriodDetail stores data under queryKey ["period", id]', async () => {
    vi.mocked(periodApi.getDetail).mockResolvedValue(mockDetail);
    const client = freshClient();
    const { result } = renderHook(() => usePeriodDetail(1), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(['period', 1])).toEqual(mockDetail);
  });

  it('useOpenPeriod invalidates objectDetail and dashboard on success', async () => {
    vi.mocked(periodApi.open).mockResolvedValue({ id: 5 });
    const client = freshClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useOpenPeriod(), {
      wrapper: makeWrapper(client),
    });
    result.current.mutate(10);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledWith({ queryKey: ['objectDetail'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['dashboard'] });
  });

  it('useUpsertFact invalidates ["period", id] on success', async () => {
    vi.mocked(periodApi.upsertFact).mockResolvedValue(undefined);
    const client = freshClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useUpsertFact(1), {
      wrapper: makeWrapper(client),
    });
    result.current.mutate({ boqItemId: 7, scVolume: 42.5 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(periodApi.upsertFact).toHaveBeenCalledWith(1, 7, 42.5);
    expect(spy).toHaveBeenCalledWith({ queryKey: ['period', 1] });
  });

  it('useClosePeriod invalidates period, objectDetail and dashboard on success', async () => {
    vi.mocked(periodApi.close).mockResolvedValue(undefined);
    const client = freshClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useClosePeriod(1), {
      wrapper: makeWrapper(client),
    });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledWith({ queryKey: ['period', 1] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['objectDetail'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['dashboard'] });
  });
});
```

- [ ] **Step 2: Run — confirm FAIL**

```bash
pnpm --filter @ccip/web test src/hooks/__tests__/period-hooks.test.tsx
```
Expected: FAIL — `Cannot find module '../usePeriodDetail'`.

- [ ] **Step 3: Create `usePeriodDetail.ts`**

Create `apps/web/src/hooks/usePeriodDetail.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { periodApi } from '../services/api';

export function usePeriodDetail(id: number) {
  return useQuery({
    queryKey: ['period', id],
    queryFn: () => periodApi.getDetail(id),
    staleTime: 10_000,
  });
}
```

- [ ] **Step 4: Create `useOpenPeriod.ts`**

Create `apps/web/src/hooks/useOpenPeriod.ts`:

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { periodApi } from '../services/api';

export function useOpenPeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (objectId: number) => periodApi.open(objectId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['objectDetail'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
```

- [ ] **Step 5: Create `useUpsertFact.ts`**

Create `apps/web/src/hooks/useUpsertFact.ts`:

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { periodApi } from '../services/api';

export function useUpsertFact(periodId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ boqItemId, scVolume }: { boqItemId: number; scVolume: number }) =>
      periodApi.upsertFact(periodId, boqItemId, scVolume),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['period', periodId] });
    },
  });
}
```

- [ ] **Step 6: Create `useClosePeriod.ts`**

Create `apps/web/src/hooks/useClosePeriod.ts`:

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { periodApi } from '../services/api';

export function useClosePeriod(periodId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => periodApi.close(periodId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['period', periodId] });
      void queryClient.invalidateQueries({ queryKey: ['objectDetail'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
```

- [ ] **Step 7: Run — confirm green**

```bash
pnpm --filter @ccip/web test src/hooks/__tests__/period-hooks.test.tsx
```
Expected: PASS (5 tests).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/hooks/usePeriodDetail.ts apps/web/src/hooks/useOpenPeriod.ts apps/web/src/hooks/useUpsertFact.ts apps/web/src/hooks/useClosePeriod.ts apps/web/src/hooks/__tests__/period-hooks.test.tsx
git commit -m "feat(web): usePeriodDetail / useOpenPeriod / useUpsertFact / useClosePeriod hooks"
```

---

## Task 4: Frontend — `PeriodPage` component (TDD)

**Files:**
- Create: `apps/web/src/pages/__tests__/PeriodPage.test.tsx`
- Create: `apps/web/src/pages/PeriodPage.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/pages/__tests__/PeriodPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PeriodPage } from '../PeriodPage';
import { usePeriodDetail } from '../../hooks/usePeriodDetail';
import { useUpsertFact } from '../../hooks/useUpsertFact';
import { useClosePeriod } from '../../hooks/useClosePeriod';
import type { PeriodDetailResponse } from '../../services/api';

vi.mock('../../hooks/usePeriodDetail', () => ({ usePeriodDetail: vi.fn() }));
vi.mock('../../hooks/useUpsertFact', () => ({ useUpsertFact: vi.fn() }));
vi.mock('../../hooks/useClosePeriod', () => ({ useClosePeriod: vi.fn() }));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => ({ id: '1' }),
  };
});

type UsePeriodReturn = ReturnType<typeof usePeriodDetail>;
type UpsertReturn = ReturnType<typeof useUpsertFact>;
type CloseReturn = ReturnType<typeof useClosePeriod>;

const mutateFact = vi.fn();
const mutateClose = vi.fn();

function setupMutations() {
  vi.mocked(useUpsertFact).mockReturnValue({
    mutate: mutateFact,
    isPending: false,
    isError: false,
  } as unknown as UpsertReturn);
  vi.mocked(useClosePeriod).mockReturnValue({
    mutate: mutateClose,
    isPending: false,
    isError: false,
  } as unknown as CloseReturn);
}

function mockPeriodReturn(over: Partial<UsePeriodReturn>) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    ...over,
  } as unknown as UsePeriodReturn;
}

function makeDetail(over: Partial<PeriodDetailResponse> = {}): PeriodDetailResponse {
  return {
    id: 1,
    periodNumber: 2,
    status: 'verification',
    openedAt: '2026-05-01T00:00:00Z',
    closedAt: null,
    objectId: 10,
    boqVersionId: 5,
    positions: [
      {
        boqItemId: 7,
        workCode: 'C-01',
        name: 'Earthworks',
        unit: 'm3',
        planVolume: 200,
        gpVolume: 150,
        scVolume: 140,
        discrepancyType: 1,
        discrepancyStatus: 'open',
        acceptedVolume: null,
      },
    ],
    openDiscrepancyCount: 1,
    ...over,
  };
}

describe('PeriodPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setupMutations();
  });

  it('renders the loading state', () => {
    vi.mocked(usePeriodDetail).mockReturnValue(mockPeriodReturn({ isLoading: true }));
    render(<PeriodPage />);
    expect(screen.getByText('Загрузка...')).toBeInTheDocument();
  });

  it('renders the error state when not found', () => {
    vi.mocked(usePeriodDetail).mockReturnValue(mockPeriodReturn({ isError: true }));
    render(<PeriodPage />);
    expect(screen.getByText(/Период не найден/)).toBeInTheDocument();
  });

  it('shows the current status step in the stepper', () => {
    vi.mocked(usePeriodDetail).mockReturnValue(
      mockPeriodReturn({ data: makeDetail({ status: 'gp_submitted' }) }),
    );
    render(<PeriodPage />);
    expect(screen.getByText('ГП подал данные')).toBeInTheDocument();
  });

  it('renders position rows (name, gpVolume, scVolume)', () => {
    vi.mocked(usePeriodDetail).mockReturnValue(
      mockPeriodReturn({ data: makeDetail() }),
    );
    render(<PeriodPage />);
    expect(screen.getByText('Earthworks')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();
    expect(screen.getByText('140')).toBeInTheDocument();
  });

  it('shows SC input for stroycontrol when status allows editing', () => {
    localStorage.setItem(
      'auth_user',
      JSON.stringify({ id: 'u1', email: 'a@b.c', role: 'stroycontrol' }),
    );
    vi.mocked(usePeriodDetail).mockReturnValue(
      mockPeriodReturn({ data: makeDetail({ status: 'verification' }) }),
    );
    render(<PeriodPage />);
    expect(
      screen.getByRole('spinbutton', { name: 'scVolume-7' }),
    ).toBeInTheDocument();
  });

  it('hides SC input for director', () => {
    localStorage.setItem(
      'auth_user',
      JSON.stringify({ id: 'u1', email: 'a@b.c', role: 'director' }),
    );
    vi.mocked(usePeriodDetail).mockReturnValue(
      mockPeriodReturn({ data: makeDetail({ status: 'verification' }) }),
    );
    render(<PeriodPage />);
    expect(screen.queryByRole('spinbutton', { name: /scVolume/ })).not.toBeInTheDocument();
  });

  it('close button is disabled when openDiscrepancyCount > 0', () => {
    localStorage.setItem(
      'auth_user',
      JSON.stringify({ id: 'u1', email: 'a@b.c', role: 'stroycontrol' }),
    );
    vi.mocked(usePeriodDetail).mockReturnValue(
      mockPeriodReturn({ data: makeDetail({ openDiscrepancyCount: 1 }) }),
    );
    render(<PeriodPage />);
    expect(screen.getByRole('button', { name: 'Закрыть период' })).toBeDisabled();
  });

  it('close button is enabled when verification and no open discrepancies', () => {
    localStorage.setItem(
      'auth_user',
      JSON.stringify({ id: 'u1', email: 'a@b.c', role: 'stroycontrol' }),
    );
    vi.mocked(usePeriodDetail).mockReturnValue(
      mockPeriodReturn({
        data: makeDetail({ status: 'verification', openDiscrepancyCount: 0 }),
      }),
    );
    render(<PeriodPage />);
    expect(
      screen.getByRole('button', { name: 'Закрыть период' }),
    ).not.toBeDisabled();
  });

  it('close button is disabled when status is not verification', () => {
    localStorage.setItem(
      'auth_user',
      JSON.stringify({ id: 'u1', email: 'a@b.c', role: 'stroycontrol' }),
    );
    vi.mocked(usePeriodDetail).mockReturnValue(
      mockPeriodReturn({
        data: makeDetail({ status: 'gp_submitted', openDiscrepancyCount: 0 }),
      }),
    );
    render(<PeriodPage />);
    expect(screen.getByRole('button', { name: 'Закрыть период' })).toBeDisabled();
  });

  it('close button is not visible for director', () => {
    localStorage.setItem(
      'auth_user',
      JSON.stringify({ id: 'u1', email: 'a@b.c', role: 'director' }),
    );
    vi.mocked(usePeriodDetail).mockReturnValue(
      mockPeriodReturn({
        data: makeDetail({ status: 'verification', openDiscrepancyCount: 0 }),
      }),
    );
    render(<PeriodPage />);
    expect(
      screen.queryByRole('button', { name: 'Закрыть период' }),
    ).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — confirm FAIL**

```bash
pnpm --filter @ccip/web test src/pages/__tests__/PeriodPage.test.tsx
```
Expected: FAIL — `Cannot find module '../PeriodPage'`.

- [ ] **Step 3: Create `PeriodPage.tsx`**

Create `apps/web/src/pages/PeriodPage.tsx`:

```tsx
import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { usePeriodDetail } from '../hooks/usePeriodDetail';
import { useUpsertFact } from '../hooks/useUpsertFact';
import { useClosePeriod } from '../hooks/useClosePeriod';
import { getAuthUser } from '../store/auth';

const STATUS_LABELS: Record<string, string> = {
  open: 'Открыт',
  gp_submitted: 'ГП подал данные',
  verification: 'Верификация',
  closed: 'Закрыт',
};

const STATUS_ORDER = ['open', 'gp_submitted', 'verification', 'closed'] as const;

const ERROR_LABELS: Record<string, string> = {
  PERIOD_ALREADY_OPEN: 'По объекту уже открыт период',
  ZERO_REPORT_NOT_APPROVED: 'Нулевой отчёт не утверждён',
  OPEN_DISCREPANCIES_EXIST: 'Есть незакрытые расхождения',
  PERIOD_WRONG_STATUS: 'Недопустимый статус для этого действия',
  PERIOD_LOCK_TIMEOUT: 'Таймаут блокировки — попробуйте ещё раз',
};

function extractError(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const msg = (err as { response: { data: { message?: string } } }).response?.data
      ?.message;
    if (typeof msg === 'string') return ERROR_LABELS[msg] ?? msg;
  }
  return 'Произошла ошибка';
}

export function PeriodPage() {
  const { id } = useParams<{ id: string }>();
  const periodId = parseInt(id ?? '0', 10);
  const { data, isLoading, isError } = usePeriodDetail(periodId);
  const upsertFact = useUpsertFact(periodId);
  const closePeriod = useClosePeriod(periodId);
  const [editValues, setEditValues] = useState<Record<number, string>>({});

  if (isLoading) return <div style={{ padding: 24 }}>Загрузка...</div>;
  if (isError || !data)
    return (
      <div style={{ padding: 24, color: 'red' }}>
        Период не найден или нет доступа.
      </div>
    );

  const user = getAuthUser();
  const canAct = user?.role === 'stroycontrol' || user?.role === 'admin';
  const canEdit =
    data.status === 'gp_submitted' || data.status === 'verification';
  const showEditCol = canAct && canEdit;
  const canClose =
    data.status === 'verification' && data.openDiscrepancyCount === 0;

  function handleFactSubmit(boqItemId: number) {
    const scVolume = parseFloat(editValues[boqItemId] ?? '');
    if (isNaN(scVolume)) return;
    upsertFact.mutate(
      { boqItemId, scVolume },
      { onSuccess: () => setEditValues((v) => ({ ...v, [boqItemId]: '' })) },
    );
  }

  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif', maxWidth: 1100 }}>
      <div style={{ marginBottom: 12, fontSize: 13, color: '#888' }}>
        <Link to={`/objects/${data.objectId}`}>← Объект #{data.objectId}</Link>
      </div>

      <h1 style={{ fontSize: 20, margin: '0 0 16px' }}>
        Период #{data.periodNumber}
      </h1>

      {/* Stepper */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, fontSize: 13 }}>
        {STATUS_ORDER.map((s) => (
          <div
            key={s}
            style={{
              padding: '4px 12px',
              borderRadius: 12,
              background: data.status === s ? '#0d6efd' : '#e9ecef',
              color: data.status === s ? '#fff' : '#555',
              fontWeight: data.status === s ? 600 : 400,
            }}
          >
            {STATUS_LABELS[s]}
          </div>
        ))}
      </div>

      {/* Positions table */}
      <table
        style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 20 }}
      >
        <thead>
          <tr style={{ borderBottom: '2px solid #dee2e6', background: '#f8f9fa' }}>
            <th style={th}>Код</th>
            <th style={th}>Наименование</th>
            <th style={th}>Ед.</th>
            <th style={th}>План</th>
            <th style={th}>Объём ГП</th>
            <th style={th}>Объём SC</th>
            <th style={th}>Расхождение</th>
            {showEditCol && <th style={th}>Ввод SC</th>}
          </tr>
        </thead>
        <tbody>
          {data.positions.map((pos) => (
            <tr key={pos.boqItemId} style={{ borderBottom: '1px solid #dee2e6' }}>
              <td style={td}>{pos.workCode}</td>
              <td style={td}>{pos.name}</td>
              <td style={td}>{pos.unit}</td>
              <td style={td}>{pos.planVolume}</td>
              <td style={td}>{pos.gpVolume ?? '—'}</td>
              <td style={td}>{pos.scVolume ?? '—'}</td>
              <td style={td}>
                {pos.discrepancyStatus === null
                  ? '—'
                  : pos.discrepancyStatus === 'confirmed'
                  ? <span style={{ color: '#28a745' }}>✓ Подтверждено</span>
                  : <span style={{ color: '#dc3545' }}>⚠ Расхождение</span>}
              </td>
              {showEditCol && (
                <td style={td}>
                  <input
                    type="number"
                    aria-label={`scVolume-${pos.boqItemId}`}
                    value={editValues[pos.boqItemId] ?? ''}
                    onChange={(e) =>
                      setEditValues((v) => ({
                        ...v,
                        [pos.boqItemId]: e.target.value,
                      }))
                    }
                    style={{ width: 80, padding: '2px 4px' }}
                    min={0}
                  />
                  <button
                    onClick={() => handleFactSubmit(pos.boqItemId)}
                    disabled={upsertFact.isPending}
                    style={{ marginLeft: 4, padding: '2px 8px' }}
                  >
                    ОК
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Close period */}
      {canAct && (
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={() => closePeriod.mutate()}
            disabled={!canClose || closePeriod.isPending}
            style={{
              padding: '6px 16px',
              background: canClose ? '#28a745' : '#adb5bd',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: canClose ? 'pointer' : 'not-allowed',
            }}
          >
            {closePeriod.isPending ? 'Закрытие...' : 'Закрыть период'}
          </button>
          {data.status === 'verification' && data.openDiscrepancyCount > 0 && (
            <span style={{ marginLeft: 10, fontSize: 13, color: '#dc3545' }}>
              Есть {data.openDiscrepancyCount} открытых расхождений
            </span>
          )}
          {data.status !== 'verification' && data.status !== 'closed' && (
            <span style={{ marginLeft: 10, fontSize: 13, color: '#888' }}>
              Закрытие доступно только на этапе «Верификация»
            </span>
          )}
        </div>
      )}

      {closePeriod.isError && (
        <div style={{ color: 'red', marginBottom: 8, fontSize: 13 }}>
          {extractError(closePeriod.error)}
        </div>
      )}
      {upsertFact.isError && (
        <div style={{ color: 'red', marginBottom: 8, fontSize: 13 }}>
          {extractError(upsertFact.error)}
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: '8px 12px',
  textAlign: 'left',
  fontWeight: 600,
};
const td: React.CSSProperties = { padding: '8px 12px', verticalAlign: 'middle' };
```

- [ ] **Step 4: Run — confirm green**

```bash
pnpm --filter @ccip/web test src/pages/__tests__/PeriodPage.test.tsx
```
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/PeriodPage.tsx apps/web/src/pages/__tests__/PeriodPage.test.tsx
git commit -m "feat(web): PeriodPage — stepper, fact input, close with discrepancy block"
```

---

## Task 5: Frontend — update `ObjectDetailPage` + add route (TDD)

**Files:**
- Create: `apps/web/src/pages/__tests__/ObjectDetailPage.test.tsx`
- Modify: `apps/web/src/pages/ObjectDetailPage.tsx`
- Modify: `apps/web/src/main.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/pages/__tests__/ObjectDetailPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ObjectDetailPage } from '../ObjectDetailPage';
import { useObjectDetail } from '../../hooks/useObjectDetail';
import { useOpenPeriod } from '../../hooks/useOpenPeriod';
import type { ObjectDetailResponse } from '../../services/api';

vi.mock('../../hooks/useObjectDetail', () => ({ useObjectDetail: vi.fn() }));
vi.mock('../../hooks/useOpenPeriod', () => ({ useOpenPeriod: vi.fn() }));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => ({ id: '10' }),
  };
});

const mutateOpen = vi.fn();

function setupMocks() {
  vi.mocked(useOpenPeriod).mockReturnValue({
    mutate: mutateOpen,
    isPending: false,
  } as unknown as ReturnType<typeof useOpenPeriod>);
}

type UseDetailReturn = ReturnType<typeof useObjectDetail>;

function mockDetailReturn(over: Partial<UseDetailReturn>) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    ...over,
  } as unknown as UseDetailReturn;
}

function makeObjectDetail(
  currentPeriod: ObjectDetailResponse['currentPeriod'] = null,
): ObjectDetailResponse {
  return {
    object: {
      id: 10,
      name: 'Объект Б',
      objectClass: null,
      address: null,
      permitNumber: null,
      permitDate: null,
      connectionDate: null,
      status: 'active',
    },
    participants: [],
    activeBoq: null,
    currentPeriod,
    hasAnalytics: false,
    current: null,
    history: [],
    meta: { isStale: false, refreshedAt: null, staleReason: null },
  };
}

describe('ObjectDetailPage — period changes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setupMocks();
  });

  it('renders a link to /periods/:id when currentPeriod exists', () => {
    vi.mocked(useObjectDetail).mockReturnValue(
      mockDetailReturn({
        data: makeObjectDetail({
          id: 42,
          periodNumber: 1,
          status: 'verification',
          openedAt: '2026-05-01T00:00:00Z',
          closedAt: null,
        }),
      }),
    );
    render(<ObjectDetailPage />);
    const link = screen.getByRole('link', { name: /Открыть/ });
    expect(link).toHaveAttribute('href', '/periods/42');
  });

  it('shows canonical label "Верификация" for status verification', () => {
    vi.mocked(useObjectDetail).mockReturnValue(
      mockDetailReturn({
        data: makeObjectDetail({
          id: 42,
          periodNumber: 1,
          status: 'verification',
          openedAt: '2026-05-01T00:00:00Z',
          closedAt: null,
        }),
      }),
    );
    render(<ObjectDetailPage />);
    expect(screen.getByText(/Верификация/)).toBeInTheDocument();
  });

  it('shows "Открыть период" button for stroycontrol when no current period', () => {
    localStorage.setItem(
      'auth_user',
      JSON.stringify({ id: 'u1', email: 'a@b.c', role: 'stroycontrol' }),
    );
    vi.mocked(useObjectDetail).mockReturnValue(
      mockDetailReturn({ data: makeObjectDetail(null) }),
    );
    render(<ObjectDetailPage />);
    expect(
      screen.getByRole('button', { name: 'Открыть период' }),
    ).toBeInTheDocument();
  });

  it('does not show "Открыть период" button for director', () => {
    localStorage.setItem(
      'auth_user',
      JSON.stringify({ id: 'u1', email: 'a@b.c', role: 'director' }),
    );
    vi.mocked(useObjectDetail).mockReturnValue(
      mockDetailReturn({ data: makeObjectDetail(null) }),
    );
    render(<ObjectDetailPage />);
    expect(
      screen.queryByRole('button', { name: 'Открыть период' }),
    ).not.toBeInTheDocument();
  });

  it('does not show "Открыть период" button when a period is already open', () => {
    localStorage.setItem(
      'auth_user',
      JSON.stringify({ id: 'u1', email: 'a@b.c', role: 'stroycontrol' }),
    );
    vi.mocked(useObjectDetail).mockReturnValue(
      mockDetailReturn({
        data: makeObjectDetail({
          id: 42,
          periodNumber: 1,
          status: 'open',
          openedAt: '2026-05-01T00:00:00Z',
          closedAt: null,
        }),
      }),
    );
    render(<ObjectDetailPage />);
    expect(
      screen.queryByRole('button', { name: 'Открыть период' }),
    ).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — confirm FAIL**

```bash
pnpm --filter @ccip/web test src/pages/__tests__/ObjectDetailPage.test.tsx
```
Expected: FAIL — several tests fail because `useOpenPeriod` is not imported, the MVP stub still renders instead of a link, and the label "Верификация" isn't in the dictionary.

- [ ] **Step 3: Modify `ObjectDetailPage.tsx`**

Make three changes to `apps/web/src/pages/ObjectDetailPage.tsx`:

**Change A** — update imports (add `useNavigate`, `useOpenPeriod`, `getAuthUser`):

```typescript
// Replace this line:
import { useParams, Link } from 'react-router-dom';

// With:
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useOpenPeriod } from '../hooks/useOpenPeriod';
import { getAuthUser } from '../store/auth';
```

**Change B** — fix `PERIOD_STATUS_LABELS` (canonical vocab, remove drift):

```typescript
// Replace the whole PERIOD_STATUS_LABELS constant:
const PERIOD_STATUS_LABELS: Record<string, string> = {
  open: 'Открыт',
  gp_submitted: 'ГП подал данные',
  verification: 'Верификация',
  closed: 'Закрыт',
};
```

**Change C** — inside `ObjectDetailPage()`, add `useNavigate`, `useOpenPeriod`, and the user role check right after the params/query hooks:

```typescript
// Add after:  const { data, isLoading, isError } = useObjectDetail(objectId);
const navigate = useNavigate();
const openPeriod = useOpenPeriod();
const user = getAuthUser();
const canAct = user?.role === 'stroycontrol' || user?.role === 'admin';
```

**Change D** — replace the MVP stub span with a real link and add the open-period action. Find the `currentPeriod &&` block and replace it with:

```tsx
{currentPeriod && (
  <Section title="Текущий период">
    <div style={{ fontSize: 13 }}>
      <span>Период #{currentPeriod.periodNumber} · </span>
      <span>{PERIOD_STATUS_LABELS[currentPeriod.status] ?? currentPeriod.status} · </span>
      <span>Открыт: {new Date(currentPeriod.openedAt).toLocaleDateString('ru-RU')} · </span>
      <Link to={`/periods/${currentPeriod.id}`}>Открыть →</Link>
    </div>
  </Section>
)}

{!currentPeriod && canAct && (
  <Section title="Период">
    <button
      onClick={() =>
        openPeriod.mutate(objectId, {
          onSuccess: (p) => navigate(`/periods/${p.id}`),
        })
      }
      disabled={openPeriod.isPending}
      style={{ padding: '4px 12px', fontSize: 13 }}
    >
      {openPeriod.isPending ? 'Открываем...' : 'Открыть период'}
    </button>
  </Section>
)}
```

- [ ] **Step 4: Add the `/periods/:id` route in `main.tsx`**

Add the following import at the top of `apps/web/src/main.tsx` (after the `ObjectDetailPage` import):

```typescript
import { PeriodPage } from './pages/PeriodPage';
```

Add the following route inside `<Routes>` (after the `/objects/:id` route):

```tsx
<Route
  path="/periods/:id"
  element={<ProtectedRoute><PeriodPage /></ProtectedRoute>}
/>
```

- [ ] **Step 5: Run — confirm green**

```bash
pnpm --filter @ccip/web test src/pages/__tests__/ObjectDetailPage.test.tsx
```
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/ObjectDetailPage.tsx apps/web/src/main.tsx apps/web/src/pages/__tests__/ObjectDetailPage.test.tsx
git commit -m "feat(web): ObjectDetailPage — link to period, open-period action, fix status vocab drift"
```

---

## Task 6: Gates — `turbo test` + `turbo lint` green

**Files:** none new — verification only.

- [ ] **Step 1: Run the full web suite**

```bash
pnpm --filter @ccip/web test
```
Expected: all test files pass. Count should be: prior 33 tests + new files (period-api: 4, period-hooks: 5, PeriodPage: 9, ObjectDetailPage: 5) = **56 tests total**.

- [ ] **Step 2: Run the full api suite**

```bash
pnpm --filter @ccip/api test
```
Expected: all pass. The two new `getDetail` tests are included. The known pg_cron test in `@ccip/database` may still fail — that is pre-existing and unrelated to this branch.

- [ ] **Step 3: Run `turbo lint`**

```bash
npx turbo lint
```
Expected: `@ccip/web#lint` and `@ccip/api#lint` pass (exit 0).

- [ ] **Step 4: Run audit-suite**

```bash
node tools/audit/audit-suite.js
```
Expected: `18/18 passed`.

- [ ] **Step 5: Commit if any auto-fix changes from lint**

If `turbo lint` auto-fixed anything in `apps/web` (since the `apps/api` lint uses `--fix` and `apps/web` lint is now read-only `eslint .`), commit the changes:

```bash
git add -A
git commit -m "chore(web): lint cleanup from turbo lint pass"
```
If nothing changed, skip this step.

---

## Self-Review

**Spec coverage** (against `docs/plans/2026-05-31-period-cycle-design.md`):
- §1 Backend `GET /periods/:id/detail` (positions for period's BoQ version, join with facts, openDiscrepancyCount, tenancy) → Task 1 ✓
- §2 `periodApi` types + functions → Task 2 ✓
- §2 hooks (usePeriodDetail/useOpenPeriod/useUpsertFact/useClosePeriod) → Task 3 ✓
- §2 `PeriodPage` (stepper, table, SC input, close button with discrepancy block) → Task 4 ✓
- §2 ObjectDetailPage (link, open-period action) → Task 5 ✓
- §2 route `/periods/:id` → Task 5 ✓
- §3 RBAC (stroycontrol/admin vs director) → PeriodPage + ObjectDetailPage tests ✓
- §3 error message mapping → `extractError()` in PeriodPage ✓
- §3 fix vocab drift in ObjectDetailPage → Task 5 Change B ✓
- §4 backend jest test → Task 1 ✓
- §4 frontend Vitest tests → Tasks 2–5 ✓
- §7 `turbo test`/`turbo lint` green → Task 6 ✓

**Placeholder scan:** No TBD/TODO in any task; every step has complete code. ✓

**Type consistency:**
- `PeriodDetailResponse.positions[].boqItemId` — defined in Task 2, used in Task 4 (`pos.boqItemId`) ✓
- `useUpsertFact(periodId).mutate({ boqItemId, scVolume })` — Task 3 defines `mutationFn: ({ boqItemId, scVolume }) => periodApi.upsertFact(periodId, boqItemId, scVolume)`, PeriodPage calls `upsertFact.mutate({ boqItemId: pos.boqItemId, scVolume })` ✓
- `useOpenPeriod().mutate(objectId, { onSuccess: (p) => navigate('/periods/' + p.id) })` — Task 3 defines `mutationFn: (objectId: number) => periodApi.open(objectId)`, `periodApi.open` returns `{ id: number }` ✓
- `STATUS_ORDER` in PeriodPage typed as `const` tuple — values match keys of `STATUS_LABELS` ✓
