import React from 'react';
import type { UserRole } from '../store/auth';
import { getAuthUser } from '../store/auth';

type Props = {
  allow: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

export function RoleGate({ allow, children, fallback = null }: Props) {
  const user = getAuthUser();
  if (!user || !allow.includes(user.role)) return <>{fallback}</>;
  return <>{children}</>;
}
