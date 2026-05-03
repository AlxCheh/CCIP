import React from 'react';
import type { StalenessMeta } from '../services/api';

type Props = { meta: StalenessMeta };

function formatAge(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins} мин назад`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} ч назад`;
}

export function StaleBanner({ meta }: Props) {
  if (!meta.isStale) return null;
  const age = meta.refreshedAt ? formatAge(meta.refreshedAt) : 'неизвестно когда';
  return (
    <div style={{ background: '#fff3cd', border: '1px solid #ffc107', padding: '8px 16px', marginBottom: 12, borderRadius: 4, fontSize: 14 }}>
      Данные обновлены {age} — обратитесь к администратору для обновления.
    </div>
  );
}
