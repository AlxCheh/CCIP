import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDashboard } from '../hooks/useDashboard';
import { StaleBanner } from '../components/StaleBanner';
import { ProgressBar } from '../components/ProgressBar';
import { EmptyCell } from '../components/EmptyCell';
import { RoleGate } from '../components/RoleGate';
import { RefreshButton } from '../components/RefreshButton';
import type { DashboardQuery } from '../services/api';

const STATUS_LABELS: Record<string, string> = {
  active: 'Активный',
  paused: 'Приостановлен',
  closed: 'Завершён',
};

function formatRefreshed(iso: string | null): string {
  if (!iso) return 'нет данных';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
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

  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Дашборд</h1>
          {data && (
            <span style={{ fontSize: 12, color: '#888' }}>
              обновлено: {formatRefreshed(data.meta.refreshedAt)}
            </span>
          )}
        </div>
        <RoleGate allow={['admin']}>
          <RefreshButton />
        </RoleGate>
      </div>

      {data && <StaleBanner meta={data.meta} />}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          placeholder="Поиск по названию"
          value={query.search ?? ''}
          onChange={(e) => setParam('search', e.target.value || undefined)}
          style={{ padding: '4px 8px', fontSize: 13 }}
        />
        <select
          value={query.status ?? ''}
          onChange={(e) => setParam('status', (e.target.value as DashboardQuery['status']) || undefined)}
          style={{ padding: '4px 8px', fontSize: 13 }}
        >
          <option value="">Все статусы</option>
          <option value="active">Активный</option>
          <option value="paused">Приостановлен</option>
          <option value="closed">Завершён</option>
        </select>
        <select
          value={query.sort ?? 'gapFirst'}
          onChange={(e) => setParam('sort', e.target.value as DashboardQuery['sort'])}
          style={{ padding: '4px 8px', fontSize: 13 }}
        >
          <option value="gapFirst">Сначала с разрывом</option>
          <option value="readinessAsc">Готовность ↑</option>
          <option value="readinessDesc">Готовность ↓</option>
          <option value="forecastAsc">Прогноз ↑</option>
          <option value="forecastDesc">Прогноз ↓</option>
          <option value="nameAsc">Название А-Я</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={query.gapOnly ?? false}
            onChange={(e) => setParam('gapOnly', e.target.checked || undefined)}
          />
          Только с разрывом плана
        </label>
      </div>

      {isLoading && <div>Загрузка...</div>}
      {isError && <div style={{ color: 'red' }}>Ошибка загрузки данных.</div>}

      {data && data.items.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>
          Нет объектов в организации
        </div>
      )}

      {data && data.items.length > 0 && (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #dee2e6', background: '#f8f9fa' }}>
                <th style={th}>Название</th>
                <th style={th}>Статус</th>
                <th style={{ ...th, minWidth: 140 }}>Готовность</th>
                <th style={th}>Прогноз (взвеш.)</th>
                <th style={th}>Прогноз (крит. путь)</th>
                <th style={th}>Разрыв</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr
                  key={row.objectId}
                  onClick={() => void navigate(`/objects/${row.objectId}`)}
                  style={{ borderBottom: '1px solid #dee2e6', cursor: 'pointer' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f8f9fa')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                >
                  <td style={td}>{row.name}</td>
                  <td style={td}>{STATUS_LABELS[row.status] ?? row.status}</td>
                  <td style={td}>
                    {row.hasAnalytics
                      ? <ProgressBar value={row.objReadinessPct} />
                      : <span style={{ color: '#999' }}>—</span>}
                  </td>
                  <td style={td}>
                    {row.hasAnalytics ? <EmptyCell value={row.weightedForecastDate} /> : <span style={{ color: '#999' }}>—</span>}
                  </td>
                  <td style={td}>
                    {row.hasAnalytics ? <EmptyCell value={row.criticalPathForecastDate} /> : <span style={{ color: '#999' }}>—</span>}
                  </td>
                  <td style={td}>
                    {row.hasAnalytics
                      ? (row.gapFlag ? <span style={{ color: '#dc3545' }}>⚠ Есть</span> : <span style={{ color: '#28a745' }}>✓</span>)
                      : <span style={{ color: '#999' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, fontSize: 13 }}>
            <button
              disabled={(query.page ?? 1) <= 1}
              onClick={() => setQuery((q) => ({ ...q, page: (q.page ?? 1) - 1 }))}
              style={{ padding: '4px 10px' }}
            >
              ← Назад
            </button>
            <span>
              Стр. {query.page ?? 1} из {totalPages} (всего {data.pagination.total})
            </span>
            <button
              disabled={(query.page ?? 1) >= totalPages}
              onClick={() => setQuery((q) => ({ ...q, page: (q.page ?? 1) + 1 }))}
              style={{ padding: '4px 10px' }}
            >
              Вперёд →
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', fontWeight: 600 };
const td: React.CSSProperties = { padding: '8px 12px', verticalAlign: 'middle' };
