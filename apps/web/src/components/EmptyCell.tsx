import React from 'react';

type Props = { value: string | number | null | undefined };

export function EmptyCell({ value }: Props) {
  if (value === null || value === undefined || value === '') {
    return <span style={{ color: '#999' }}>—</span>;
  }
  return <>{value}</>;
}
