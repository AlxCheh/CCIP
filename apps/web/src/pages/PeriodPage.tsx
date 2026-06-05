import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { usePeriodDetail } from '../hooks/usePeriodDetail';
import { useUpsertFact } from '../hooks/useUpsertFact';
import { useClosePeriod } from '../hooks/useClosePeriod';
import { getAuthUser } from '../store/auth';
import { BackLink } from '../components/BackLink';
import { StepperTabs } from '../components/StepperTabs';
import { StatusPill } from '../components/StatusPill';
import s from './PeriodPage.module.css';

const STEPS = ['Открыт', 'ГП подал данные', 'Верификация', 'Закрыт'] as const;
type Step = (typeof STEPS)[number];

const STATUS_TO_STEP: Record<string, Step> = {
  open: 'Открыт',
  gp_submitted: 'ГП подал данные',
  verification: 'Верификация',
  closed: 'Закрыт',
};

const ERROR_LABELS: Record<string, string> = {
  PERIOD_ALREADY_OPEN: 'По объекту уже открыт период',
  ZERO_REPORT_NOT_APPROVED: 'Нулевой отчёт не утверждён',
  OPEN_DISCREPANCIES_EXIST: 'Есть незакрытые расхождения',
  PERIOD_WRONG_STATUS: 'Недопустимый статус для этого действия',
  PERIOD_LOCK_TIMEOUT: 'Таймаут блокировки — попробуйте ещё раз',
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
  const upsertFact = useUpsertFact(periodId);
  const closePeriod = useClosePeriod(periodId);
  const [editValues, setEditValues] = useState<Record<number, string>>({});

  if (isLoading)
    return (
      <div className={s.page}>
        <div className={s.loadingBox}>Загрузка...</div>
      </div>
    );
  if (isError || !data)
    return (
      <div className={s.page}>
        <div className={s.errorBox}>Период не найден.</div>
      </div>
    );

  const user = getAuthUser();
  const canAct = user?.role === 'stroycontrol' || user?.role === 'admin';
  const canEdit = data.status === 'gp_submitted' || data.status === 'verification';
  const showEdit = canAct && canEdit;
  const canClose = data.status === 'verification' && data.openDiscrepancyCount === 0;
  const currentStep = STATUS_TO_STEP[data.status] ?? 'Открыт';

  function handleFactSubmit(boqItemId: number) {
    const scVolume = parseFloat(editValues[boqItemId] ?? '');
    if (isNaN(scVolume)) return;
    upsertFact.mutate(
      { boqItemId, scVolume },
      { onSuccess: () => setEditValues((v) => ({ ...v, [boqItemId]: '' })) },
    );
  }

  return (
    <div className={s.page}>
      <div className={s.back}>
        <BackLink to={`/objects/${data.objectId}`} label={`Объект #${data.objectId}`} />
      </div>

      <div className={s.hero}>
        <h1 className={s.h1}>Период № {data.periodNumber}</h1>
        <div className={s.meta}>Открыт · {data.status}</div>
      </div>

      <StepperTabs steps={STEPS} current={currentStep} />

      {canAct && (
        <div className={s.closeBar}>
          <button
            className={s.closeBtn}
            onClick={() => closePeriod.mutate()}
            disabled={!canClose || closePeriod.isPending}
          >
            {closePeriod.isPending ? 'Закрытие...' : 'Закрыть период'}
          </button>
          {data.status === 'verification' && data.openDiscrepancyCount > 0 && (
            <span className={s.closeHint}>
              Есть {data.openDiscrepancyCount} открытых расхождений
            </span>
          )}
          {data.status !== 'verification' && data.status !== 'closed' && (
            <span className={s.closeHint}>Закрытие доступно только на этапе «Верификация»</span>
          )}
        </div>
      )}

      {closePeriod.isError && <div className={s.errorMsg}>{extractError(closePeriod.error)}</div>}
      {upsertFact.isError && <div className={s.errorMsg}>{extractError(upsertFact.error)}</div>}

      <table className={s.table}>
        <thead>
          <tr>
            <th>Код</th>
            <th>Наименование</th>
            <th className={s.c}>Ед.</th>
            <th className={s.r}>План</th>
            <th className={s.r}>Объём ГП</th>
            <th className={s.r}>Объём SC</th>
            <th className={s.r}>Расхождение</th>
            {showEdit && <th className={s.r}>Ввод SC</th>}
          </tr>
        </thead>
        <tbody>
          {data.positions.map((pos) => (
            <tr
              key={pos.boqItemId}
              className={pos.discrepancyStatus === 'discrepancy' ? s.hasDisc : ''}
            >
              <td className={s.tdCode}>{pos.workCode}</td>
              <td className={s.tdName}>{pos.name}</td>
              <td className={`${s.tdUnit} ${s.c}`}>{pos.unit}</td>
              <td className={`${s.tdNum} ${s.r}`}>{pos.planVolume}</td>
              <td className={`${s.tdNum} ${s.r}`}>
                {pos.gpVolume ?? <span className={`${s.tdNum} ${s.empty}`}>—</span>}
              </td>
              <td className={`${s.tdNum} ${s.r}`}>
                {pos.scVolume ?? <span className={`${s.tdNum} ${s.empty}`}>—</span>}
              </td>
              <td className={s.r}>
                {pos.discrepancyStatus === null ? (
                  <span className={`${s.tdNum} ${s.empty}`}>—</span>
                ) : pos.discrepancyStatus === 'confirmed' ? (
                  <StatusPill variant="ok">✓ Подтверждено</StatusPill>
                ) : (
                  <StatusPill variant="err">⚠ Расхождение</StatusPill>
                )}
              </td>
              {showEdit && (
                <td>
                  <div className={s.scInput}>
                    <input
                      type="number"
                      aria-label={`scVolume-${pos.boqItemId}`}
                      value={editValues[pos.boqItemId] ?? ''}
                      onChange={(e) =>
                        setEditValues((v) => ({ ...v, [pos.boqItemId]: e.target.value }))
                      }
                      className={s.scField}
                      min={0}
                    />
                    <button
                      className={s.scOk}
                      onClick={() => handleFactSubmit(pos.boqItemId)}
                      disabled={upsertFact.isPending}
                    >
                      ОК
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
