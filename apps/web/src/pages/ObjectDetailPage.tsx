import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useObjectDetail } from '../hooks/useObjectDetail';
import { StaleBanner } from '../components/StaleBanner';
import { ProgressBar } from '../components/ProgressBar';
import { EmptyCell } from '../components/EmptyCell';

const PERIOD_STATUS_LABELS: Record<string, string> = {
  open: 'Открыт',
  gp_submitted: 'ГП подал данные',
  verified: 'Верифицирован',
  closed: 'Закрыт',
  forced_sc_figure: 'SC закрыл принудительно',
};

export function ObjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const objectId = parseInt(id ?? '0', 10);
  const { data, isLoading, isError } = useObjectDetail(objectId);

  if (isLoading) return <div style={{ padding: 24 }}>Загрузка...</div>;
  if (isError || !data)
    return <div style={{ padding: 24, color: 'red' }}>Объект не найден или нет доступа.</div>;

  const { object: obj, participants, activeBoq, currentPeriod, hasAnalytics, current, history, meta } = data;

  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif', maxWidth: 900 }}>
      <div style={{ marginBottom: 12, fontSize: 13, color: '#888' }}>
        <Link to="/dashboard">Дашборд</Link> › {obj.name}
      </div>

      <StaleBanner meta={meta} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>{obj.name}</h1>
        <span style={{ fontSize: 12, background: '#e9ecef', padding: '2px 8px', borderRadius: 10 }}>{obj.status}</span>
      </div>
      <div style={{ fontSize: 13, color: '#555', marginBottom: 20 }}>
        {[obj.objectClass, obj.address, obj.permitNumber && `Разрешение: ${obj.permitNumber}`]
          .filter(Boolean)
          .join(' · ')}
      </div>

      {/* KPI tiles */}
      {!hasAnalytics ? (
        <div style={{ padding: '16px 20px', background: '#f8f9fa', borderRadius: 6, marginBottom: 20, color: '#888' }}>
          Нет данных аналитики — закройте первый период
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          <KpiTile label="Готовность">
            <ProgressBar value={current?.objReadinessPct ?? null} />
          </KpiTile>
          <KpiTile label="Прогноз (взвеш.)">
            <EmptyCell value={current?.weightedForecastDate} />
          </KpiTile>
          <KpiTile label="Прогноз (крит. путь)">
            <EmptyCell value={current?.criticalPathForecastDate} />
          </KpiTile>
          <KpiTile label="Разрыв прогнозов">
            {current?.gapFlag
              ? <span style={{ color: '#dc3545', fontWeight: 600 }}>⚠ Есть</span>
              : <span style={{ color: '#28a745' }}>✓ Нет</span>}
          </KpiTile>
        </div>
      )}

      {/* Current period */}
      {currentPeriod && (
        <Section title="Текущий период">
          <div style={{ fontSize: 13 }}>
            <span>Период #{currentPeriod.periodNumber} · </span>
            <span>{PERIOD_STATUS_LABELS[currentPeriod.status] ?? currentPeriod.status} · </span>
            <span>Открыт: {new Date(currentPeriod.openedAt).toLocaleDateString('ru-RU')} · </span>
            <span style={{ color: '#aaa' }}>Перейти к периоду (недоступно в MVP)</span>
          </div>
        </Section>
      )}

      {/* Active BoQ */}
      {activeBoq && (
        <Section title="Активный BoQ">
          <div style={{ fontSize: 13 }}>
            Версия {activeBoq.versionNumber} · {activeBoq.itemsCount} позиций
          </div>
        </Section>
      )}

      {/* Participants */}
      {participants.length > 0 && (
        <Section title="Участники">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #dee2e6' }}>
                <th style={th}>Роль</th>
                <th style={th}>Организация</th>
                <th style={th}>Контакт</th>
                <th style={th}>С</th>
              </tr>
            </thead>
            <tbody>
              {participants.map((p, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={td}>{p.role}</td>
                  <td style={td}>{p.orgName}</td>
                  <td style={td}><EmptyCell value={p.contactPerson} /></td>
                  <td style={td}>{p.validFrom}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* History */}
      <Section title={`История периодов (${history.length})`}>
        {history.length === 0 ? (
          <div style={{ fontSize: 13, color: '#888' }}>Нет закрытых периодов</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #dee2e6' }}>
                <th style={th}>Период</th>
                <th style={th}>Закрыт</th>
                <th style={th}>Готовность</th>
                <th style={th}>Прогноз (взвеш.)</th>
                <th style={th}>Разрыв</th>
                <th style={th}>BoQ</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.periodId} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={td}>#{h.periodNumber}</td>
                  <td style={td}>{h.closedAt ? new Date(h.closedAt).toLocaleDateString('ru-RU') : '—'}</td>
                  <td style={{ ...td, minWidth: 120 }}><ProgressBar value={h.objectReadinessPct} /></td>
                  <td style={td}><EmptyCell value={h.weightedForecastDate} /></td>
                  <td style={td}>
                    {h.gapFlag
                      ? <span style={{ color: '#dc3545' }}>⚠</span>
                      : <span style={{ color: '#28a745' }}>✓</span>}
                  </td>
                  <td style={td}>{h.boqVersionNumber}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, borderBottom: '1px solid #dee2e6', paddingBottom: 6 }}>{title}</h3>
      {children}
    </div>
  );
}

function KpiTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '12px 16px', border: '1px solid #dee2e6', borderRadius: 6 }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14 }}>{children}</div>
    </div>
  );
}

const th: React.CSSProperties = { padding: '6px 10px', textAlign: 'left', fontWeight: 600 };
const td: React.CSSProperties = { padding: '6px 10px', verticalAlign: 'middle' };
