import s from './ProgressBar.module.css';

type Props = { value: number | null };

export function ProgressBar({ value }: Props) {
  if (value === null) return <span className={s.empty}>—</span>;
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className={s.wrap}>
      <div className={s.track}>
        <div className={s.fill} style={{ width: `${pct}%` }} />
      </div>
      <span className={s.pct}>{Math.round(pct)}%</span>
    </div>
  );
}
