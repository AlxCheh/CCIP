import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { getAuthUser } from '../store/auth';
import s from './AppShell.module.css';

type NavItem = { to: string; label: string; icon: string; badge?: number };

const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Дашборд', icon: '▦' },
  { to: '/objects', label: 'Объекты', icon: '◳' },
  { to: '/periods', label: 'Периоды', icon: '◷' },
  { to: '/discrepancies', label: 'Расхождения', icon: '⚖', badge: 0 },
  { to: '/settings', label: 'Настройки', icon: '⚙' },
];

export function AppShell() {
  const user = getAuthUser();
  const { pathname } = useLocation();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className={s.frame}>
      <div className={s.grain} aria-hidden />

      <aside className={s.sidebar}>
        <div className={s.brand}>
          <div className={s.logo}>
            <span className={s.mark} />
            <span className={s.brandName}>CCIP</span>
          </div>
          <div className={s.brandSub}>Система учёта</div>
        </div>

        <nav className={s.nav}>
          {NAV.map(({ to, label, icon, badge }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                [s.navLink, isActive || pathname.startsWith(to + '/') ? s.active : ''].join(' ')
              }
            >
              {icon}&nbsp; {label}
              {badge != null && badge > 0 && (
                <span className={s.badge}>{badge}</span>
              )}
            </NavLink>
          ))}
        </nav>

        {user && (
          <div className={s.who}>
            {/* AuthUser = { id, email, role } — поля name НЕТ */}
            <div className={s.whoName}>{user.email}</div>
            <div className={s.whoRole}>{user.role}</div>
          </div>
        )}
      </aside>

      <div className={s.main}>
        <header className={s.topbar}>
          <span className={s.topbarLeft}>Стройконтроль · Система учёта</span>
          <span className={s.topbarRight}>{today}</span>
        </header>
        <div className={s.content}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
