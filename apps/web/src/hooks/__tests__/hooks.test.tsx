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

  it('useObjectDetail stores data under the [objectDetail, id] query key', async () => {
    vi.mocked(objectsApi.detail).mockResolvedValue({} as ObjectDetailResponse);
    const client = freshClient();
    const { result } = renderHook(() => useObjectDetail(42), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(['objectDetail', 42])).toBeDefined();
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
