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
