import type { ReactNode } from 'react';
import s from './StatusPill.module.css';

type Variant = 'gap' | 'ok' | 'done' | 'err';
type Props = { variant: Variant; children: ReactNode };

export function StatusPill({ variant, children }: Props) {
  return <span className={`${s.pill} ${s[variant]}`}>{children}</span>;
}
