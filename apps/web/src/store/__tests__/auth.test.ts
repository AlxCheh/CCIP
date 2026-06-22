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
