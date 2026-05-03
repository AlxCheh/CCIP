import React from 'react';

type Props = { value: number | null };

export function ProgressBar({ value }: Props) {
  if (value === null) return <span style={{ color: '#999' }}>—</span>;
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 8, background: '#e9ecef', borderRadius: 4, minWidth: 60 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: pct >= 80 ? '#28a745' : pct >= 40 ? '#ffc107' : '#dc3545', borderRadius: 4, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 13, minWidth: 40 }}>{pct.toFixed(1)}%</span>
    </div>
  );
}
