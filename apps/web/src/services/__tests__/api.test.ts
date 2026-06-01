import { describe, it, expect, beforeEach } from 'vitest';
import type { InternalAxiosRequestConfig } from 'axios';
import { api } from '../api';

// Drive a real request through the interceptor chain and capture the final
// config at the adapter boundary (public API — no reliance on axios internals).
async function captureRequestConfig(): Promise<InternalAxiosRequestConfig> {
  let captured: InternalAxiosRequestConfig | undefined;
  await api.get('/dashboard', {
    adapter: (config) => {
      captured = config;
      return Promise.resolve({ data: {}, status: 200, statusText: 'OK', headers: {}, config });
    },
  });
  if (!captured) throw new Error('adapter did not capture config');
  return captured;
}

describe('api request interceptor', () => {
  beforeEach(() => localStorage.clear());

  it('adds a Bearer Authorization header when a token is present', async () => {
    localStorage.setItem('access_token', 'tok123');
    const config = await captureRequestConfig();
    expect(config.headers.Authorization).toBe('Bearer tok123');
  });

  it('leaves Authorization unset when there is no token', async () => {
    const config = await captureRequestConfig();
    expect(config.headers.Authorization).toBeUndefined();
  });
});
