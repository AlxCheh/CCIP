export type UserRole = 'director' | 'sc' | 'admin' | 'gp';

export type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
};

export function getAuthUser(): AuthUser | null {
  const raw = localStorage.getItem('auth_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}
