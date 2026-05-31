import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { usePeriodDetail } from '../hooks/usePeriodDetail';
import { useUpsertFact } from '../hooks/useUpsertFact';
import { useClosePeriod } from '../hooks/useClosePeriod';
import { getAuthUser } from '../store/auth';

const STATUS_LABELS: Record<string, string> = {
  open:         'Открыт',
  gp_submitted: 'ГП подал данные',
  verification: 'Верификация',
  closed:       'Закрыт',
};

const STATUS_ORDER = ['open', 'gp_submitted', 'verification', 'closed'] as const;

const ERROR_LABELS: Record<string, string> = {
  PERIOD_ALREADY_OPEN:       'По объекту уже открыт период',
  ZERO_REPORT_NOT_APPROVED:  'Нулевой отчёт не утверждён',
  OPEN_DISCREPANCIES_EXIST:  'Есть незакрытые расхождения',
  PERIOD_WRONG_STATUS:       'Недопустимый статус для этого действия',
  PERIOD_LOCK_TIMEOUT:       'Таймаут блокировки — попробуйте ещё раз',
};

function extractError(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const msg = (err as { response: { data: { message?: string } } }).response?.data?.message;
    if (typeof msg === 'string') return ERROR_LABELS[msg] ?? msg;
  }
  return 'Произошла ошибка';
}

export function PeriodPage() {
  const { id } = useParams<{ id: string }>();
  const periodId = parseInt(id ?? '0', 10);
  const { data, isLoading, isError } = usePeriodDetail(periodId);
  const upsertFact  = useUpsertFact(periodId);
  const closePeriod = useClosePeriod(periodId);
  const [editValues, setEditValues] = useState<Record<number, string>>({});

  if (isLoading) return <div style={{ padding: 24 }}>Загрузка...</div>;
  if (isError || !data)
    return <div style={{ padding: 24, color: 'red' }}>Период не найден или нет доступа.</div>;

  const user       = getAuthUser();
  const canAct     = user?.role === 'stroycontrol' || user?.role === 'admin';
  const canEdit    = data.status === 'gp_submitted' || data.status === 'verification';
  const showEditCol = canAct && canEdit;
  const canClose   = data.status === 'verification' && data.openDiscrepancyCount === 0;

  function handleFactSubmit(boqItemId: number) {
    const scVolume = parseFloat(editValues[boqItemId] ?? '');
    if (isNaN(scVolume)) return;
    upsertFact.mutate(
      { boqItemId, scVolume },
      { onSuccess: () => setEditValues((v) => ({ ...v, [boqItemId]: '' })) },
    );
  }

  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif', maxWidth: 1100 }}>
      <div style={{ marginBottom: 12, fontSize: 13, color: '#888' }}>
        <a href={`/objects/${data.objectId}`}>← Объект #{data.objectId}</a>
      </div>

      <h1 style={{ fontSize: 20, margin: '0 0 16px' }}>Период #{data.periodNumber}</h1>

      {/* Stepper */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, fontSize: 13 }}>
        {STATUS_ORDER.map((s) => (
          <div
            key={s}
            style={{
              padding: '4px 12px',
              borderRadius: 12,
              background: data.status === s ? '#0d6efd' : '#e9ecef',
              color:      data.status === s ? '#fff'    : '#555',
              fontWeight: data.status === s ? 600       : 400,
            }}
          >
            {STATUS_LABELS[s]}
          </div>
        ))}
      </div>

      {/* Positions table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 20 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #dee2e6', background: '#f8f9fa' }}>
            <th style={th}>Код</th>
            <th style={th}>Наименование</th>
            <th style={th}>Ед.</th>
            <th style={th}>План</th>
            <th style={th}>Объём ГП</th>
            <th style={th}>Объём SC</th>
            <th style={th}>Расхождение</th>
            {showEditCol && <th style={th}>Ввод SC</th>}
          </tr>
        </thead>
        <tbody>
          {data.positions.map((pos) => (
            <tr key={pos.boqItemId} style={{ borderBottom: '1px solid #dee2e6' }}>
              <td style={td}>{pos.workCode}</td>
              <td style={td}>{pos.name}</td>
              <td style={td}>{pos.unit}</td>
              <td style={td}>{pos.planVolume}</td>
              <td style={td}>{pos.gpVolume ?? '—'}</td>
              <td style={td}>{pos.scVolume ?? '—'}</td>
              <td style={td}>
                {pos.discrepancyStatus === null
                  ? '—'
                  : pos.discrepancyStatus === 'confirmed'
                  ? <span style={{ color: '#28a745' }}>✓ Подтверждено</span>
                  : <span style={{ color: '#dc3545' }}>⚠ Расхождение</span>}
              </td>
              {showEditCol && (
                <td style={td}>
                  <input
                    type="number"
                    aria-label={`scVolume-${pos.boqItemId}`}
                    value={editValues[pos.boqItemId] ?? ''}
                    onChange={(e) =>
                      setEditValues((v) => ({ ...v, [pos.boqItemId]: e.target.value }))
                    }
                    style={{ width: 80, padding: '2px 4px' }}
                    min={0}
                  />
                  <button
                    onClick={() => handleFactSubmit(pos.boqItemId)}
                    disabled={upsertFact.isPending}
                    style={{ marginLeft: 4, padding: '2px 8px' }}
                  >
                    ОК
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Close period — only for stroycontrol/admin */}
      {canAct && (
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={() => closePeriod.mutate()}
            disabled={!canClose || closePeriod.isPending}
            style={{
              padding:      '6px 16px',
              background:   canClose ? '#28a745' : '#adb5bd',
              color:        '#fff',
              border:       'none',
              borderRadius: 4,
              cursor:       canClose ? 'pointer' : 'not-allowed',
            }}
          >
            {closePeriod.isPending ? 'Закрытие...' : 'Закрыть период'}
          </button>
          {data.status === 'verification' && data.openDiscrepancyCount > 0 && (
            <span style={{ marginLeft: 10, fontSize: 13, color: '#dc3545' }}>
              Есть {data.openDiscrepancyCount} открытых расхождений
            </span>
          )}
          {data.status !== 'verification' && data.status !== 'closed' && (
            <span style={{ marginLeft: 10, fontSize: 13, color: '#888' }}>
              Закрытие доступно только на этапе «Верификация»
            </span>
          )}
        </div>
      )}

      {closePeriod.isError && (
        <div style={{ color: 'red', marginBottom: 8, fontSize: 13 }}>
          {extractError(closePeriod.error)}
        </div>
      )}
      {upsertFact.isError && (
        <div style={{ color: 'red', marginBottom: 8, fontSize: 13 }}>
          {extractError(upsertFact.error)}
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', fontWeight: 600 };
const td: React.CSSProperties = { padding: '8px 12px', verticalAlign: 'middle' };
