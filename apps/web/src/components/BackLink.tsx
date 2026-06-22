import { Link } from 'react-router-dom';
import s from './BackLink.module.css';

type Props = { to: string; label: string };

export function BackLink({ to, label }: Props) {
  return (
    <Link to={to} className={s.link}>
      ← {label}
    </Link>
  );
}
