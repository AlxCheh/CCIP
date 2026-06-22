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
