import React from 'react';
import { useRefreshDashboard } from '../hooks/useRefreshDashboard';

export function RefreshButton() {
  const { mutate, isPending } = useRefreshDashboard();
  return (
    <button
      onClick={() => mutate()}
      disabled={isPending}
      style={{ padding: '4px 12px', fontSize: 13, cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1 }}
    >
      {isPending ? 'Обновление...' : 'Обновить данные'}
    </button>
  );
}
