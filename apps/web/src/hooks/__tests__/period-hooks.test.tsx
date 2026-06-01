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
  id: 1, periodNumber: 1, status: 'verification',
  openedAt: '2026-05-01T00:00:00Z', closedAt: null,
  objectId: 10, boqVersionId: 5, positions: [], openDiscrepancyCount: 0,
};

describe('period hooks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('usePeriodDetail fetches under ["period", id] key', async () => {
    vi.mocked(periodApi.getDetail).mockResolvedValue(mockDetail);
    const { result } = renderHook(() => usePeriodDetail(1), { wrapper: makeWrapper(freshClient()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(periodApi.getDetail).toHaveBeenCalledWith(1);
    expect(result.current.data).toEqual(mockDetail);
  });

  it('usePeriodDetail stores data under queryKey ["period", id]', async () => {
    vi.mocked(periodApi.getDetail).mockResolvedValue(mockDetail);
    const client = freshClient();
    const { result } = renderHook(() => usePeriodDetail(1), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(['period', 1])).toEqual(mockDetail);
  });

  it('useOpenPeriod invalidates objectDetail and dashboard on success', async () => {
    vi.mocked(periodApi.open).mockResolvedValue({ id: 5 });
    const client = freshClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useOpenPeriod(), { wrapper: makeWrapper(client) });
    result.current.mutate(10);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledWith({ queryKey: ['objectDetail'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['dashboard'] });
  });

  it('useUpsertFact invalidates ["period", id] on success', async () => {
    vi.mocked(periodApi.upsertFact).mockResolvedValue(undefined);
    const client = freshClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useUpsertFact(1), { wrapper: makeWrapper(client) });
    result.current.mutate({ boqItemId: 7, scVolume: 42.5 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(periodApi.upsertFact).toHaveBeenCalledWith(1, 7, 42.5);
    expect(spy).toHaveBeenCalledWith({ queryKey: ['period', 1] });
  });

  it('useClosePeriod invalidates period, objectDetail and dashboard on success', async () => {
    vi.mocked(periodApi.close).mockResolvedValue(undefined);
    const client = freshClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useClosePeriod(1), { wrapper: makeWrapper(client) });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledWith({ queryKey: ['period', 1] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['objectDetail'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['dashboard'] });
  });
});
