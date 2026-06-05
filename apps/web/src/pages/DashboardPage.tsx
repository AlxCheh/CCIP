import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDashboard } from '../hooks/useDashboard';
import { StaleBanner } from '../components/StaleBanner';
import { ProgressBar } from '../components/ProgressBar';
import { StatusPill } from '../components/StatusPill';
import { RoleGate } from '../components/RoleGate';
import { RefreshButton } from '../components/RefreshButton';
import type { DashboardQuery } from '../services/api';
import s from './DashboardPage.module.css';

const STATUS_LABELS: Record<string, string> = {
  active: 'Активный',
  paused: 'Приостановлен',
  closed: 'Завершён',
};

function formatRefreshed(iso: string | null): string {
  if (!iso) return 'нет данных';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин назад`;
  return `${Math.floor(mins / 60)} ч назад`;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState<DashboardQuery>({ page: 1, pageSize: 50, sort: 'gapFirst' });
  const { data, isLoading, isError } = useDashboard(query);

  function setParam<K extends keyof DashboardQuery>(key: K, value: DashboardQuery[K]) {
    setQuery((q) => ({ ...q, [key]: value, page: 1 }));
  }

  const totalPages = data ? Math.ceil(data.pagination.total / (query.pageSize ?? 50)) : 1;
  const page = query.page ?? 1;

  return (
    <div className={s.page}>
      <StaleBanner meta={data?.meta ?? null} />

      <div className={s.hero}>
        <div className={s.heroLeft}>
          <div className={s.kick}>Портфель{data ? ` · ${data.pagination.total} объектов` : ''}</div>
          <h1 className={s.h1}>Дашборд</h1>
          {data && <div className={s.meta}>обновлено: {formatRefreshed(data.meta.refreshedAt)}</div>}
        </div>
        <RoleGate allow={['admin']}>
          <RefreshButton className={s.refreshBtn} />
        </RoleGate>
      </div>

      {data && (
        <div className={s.kpis}>
          <div className={s.kpi}>
            <div className={s.kpiLabel}>Объектов всего</div>
            <div className={s.kpiValue}>{data.pagination.total}</div>
          </div>
          <div className={s.kpi}>
            <div className={s.kpiLabel}>С разрывом плана</div>
            <div className={`${s.kpiValue} ${s.err}`}>
              {String(data.items.filter((r) => r.gapFlag).length).padStart(2, '0')}
            </div>
          </div>
          <div className={s.kpi}>
            <div className={s.kpiLabel}>Средняя готовность</div>
            <div className={s.kpiValue}>
              {data.items.filter((r) => r.objReadinessPct != null).length > 0
                ? Math.round(
                    data.items
                      .filter((r) => r.objReadinessPct != null)
                      .reduce((a, r) => a + (r.objReadinessPct ?? 0), 0) /
                      data.items.filter((r) => r.objReadinessPct != null).length,
                  ) + '%'
                : '—'}
            </div>
          </div>
          <div className={s.kpi}>
            <div className={s.kpiLabel}>Просрочка SLA</div>
            <div className={`${s.kpiValue} ${s.acc}`}>—</div>
          </div>
        </div>
      )}

      <div className={s.toolbar}>
        <label className={s.checkLabel}>
          <input
            type="checkbox"
            checked={query.gapOnly ?? false}
            onChange={(e) => setParam('gapOnly', e.target.checked || undefined)}
          />
          Только с разрывом
        </label>
        <div className={s.sortWrap}>
          <span className={s.sortLabel}>Сортировка</span>
          <select
            className={s.sortSelect}
            value={query.sort ?? 'gapFirst'}
            onChange={(e) => setParam('sort', e.target.value as DashboardQuery['sort'])}
          >
            <option value="gapFirst">Сначала с разрывом</option>
            <option value="readinessAsc">Готовность ↑</option>
            <option value="readinessDesc">Готовность ↓</option>
            <option value="forecastAsc">Прогноз ↑</option>
            <option value="forecastDesc">Прогноз ↓</option>
            <option value="nameAsc">Название А–Я</option>
          </select>
        </div>
      </div>

      {isLoading && <div className={s.loading}>Загрузка...</div>}
      {isError && <div className={s.error}>Ошибка загрузки данных.</div>}

      {data && data.items.length === 0 && (
        <div className={s.empty}>Нет объектов в организации</div>
      )}

      {data && data.items.length > 0 && (
        <>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Объект</th>
                  <th>Статус</th>
                  <th>Готовность</th>
                  <th className={s.r}>Прогноз</th>
                  <th className={s.r}>Разрыв</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr
                    key={row.objectId}
                    className={row.gapFlag ? s.hasGap : ''}
                    onClick={() => void navigate(`/objects/${row.objectId}`)}
                  >
                    <td>
                      <div className={s.objName}>{row.name}</div>
                      <div className={s.objSub}>{row.objectClass ?? ''}</div>
                    </td>
                    <td>
                      <span className={`${s.statusDot} ${s[row.status] ?? ''}`} />
                      <span className={s.statusText}>{STATUS_LABELS[row.status] ?? row.status}</span>
                    </td>
                    <td>
                      {row.hasAnalytics ? (
                        <ProgressBar value={row.objReadinessPct} />
                      ) : (
                        <span className={s.cellEmpty}>—</span>
                      )}
                    </td>
                    <td className={s.r}>
                      {row.hasAnalytics && row.weightedForecastDate ? (
                        <>
                          <div className={`${s.forecast} ${row.gapFlag ? s.late : ''}`}>
                            {new Date(row.weightedForecastDate).toLocaleDateString('ru-RU', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                            })}
                          </div>
                          {row.criticalPathForecastDate && (
                            <div className={s.forecastSub}>
                              крит.&nbsp;
                              {new Date(row.criticalPathForecastDate).toLocaleDateString('ru-RU', {
                                day: '2-digit',
                                month: '2-digit',
                              })}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className={s.cellEmpty}>—</span>
                      )}
                    </td>
                    <td className={s.r}>
                      {row.hasAnalytics ? (
                        row.gapFlag ? (
                          <StatusPill variant="gap">разрыв</StatusPill>
                        ) : (
                          <StatusPill variant="ok">в плане</StatusPill>
                        )
                      ) : (
                        <span className={s.cellEmpty}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={s.foot}>
            <button
              className={s.pageBtn}
              disabled={page <= 1}
              onClick={() => setQuery((q) => ({ ...q, page: (q.page ?? 1) - 1 }))}
            >
              ← Назад
            </button>
            <button
              className={`${s.pageBtn} ${s.dark}`}
              disabled={page >= totalPages}
              onClick={() => setQuery((q) => ({ ...q, page: (q.page ?? 1) + 1 }))}
            >
              Вперёд →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
