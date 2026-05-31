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
