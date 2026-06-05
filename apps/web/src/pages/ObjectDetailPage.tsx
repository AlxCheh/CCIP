import { useParams, Link, useNavigate } from 'react-router-dom';
import { useOpenPeriod } from '../hooks/useOpenPeriod';
import { getAuthUser } from '../store/auth';
import { useObjectDetail } from '../hooks/useObjectDetail';
import { StaleBanner } from '../components/StaleBanner';
import { ProgressBar } from '../components/ProgressBar';
import { BackLink } from '../components/BackLink';
import { StatusPill } from '../components/StatusPill';
import s from './ObjectDetailPage.module.css';

const PERIOD_STATUS_LABELS: Record<string, string> = {
  open: 'Открыт',
  gp_submitted: 'Генподрядчик подал данные',
  verification: 'Верификация',
  closed: 'Закрыт',
};

const OBJ_STATUS_LABELS: Record<string, string> = {
  active: 'Активный',
  paused: 'Приостановлен',
  closed: 'Завершён',
};

export function ObjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const objectId = parseInt(id ?? '0', 10);
  const { data, isLoading, isError } = useObjectDetail(objectId);
  const navigate = useNavigate();
  const openPeriod = useOpenPeriod();
  const user = getAuthUser();
  const canAct = user?.role === 'stroycontrol' || user?.role === 'admin';

  if (isLoading)
    return (
      <div className={s.page}>
        <div className={s.loadingBox}>Загрузка...</div>
      </div>
    );
  if (isError || !data)
    return (
      <div className={s.page}>
        <div className={s.errorBox}>Объект не найден.</div>
      </div>
    );

  const { object: obj, participants, activeBoq, currentPeriod, hasAnalytics, current, history, meta } =
    data;

  return (
    <div className={s.page}>
      <div className={s.back}>
        <BackLink to="/dashboard" label="Дашборд" />
      </div>

      <StaleBanner meta={meta} />

      <div className={s.hero}>
        <h1 className={s.heroTitle}>
          {obj.name}
          <StatusPill variant={obj.status === 'active' ? 'ok' : 'done'}>
            {OBJ_STATUS_LABELS[obj.status] ?? obj.status}
          </StatusPill>
        </h1>
        <div className={s.heroMeta}>
          {[obj.objectClass, obj.address, obj.permitNumber && `Разрешение: ${obj.permitNumber}`]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>

      {/* KPI band */}
      <div className={s.kpis}>
        <div className={s.kpi}>
          <div className={s.kpiLabel}>Готовность</div>
          {hasAnalytics ? (
            <ProgressBar value={current?.objReadinessPct ?? null} />
          ) : (
            <div className={s.kpiNoAnalytics}>Нет данных — закройте первый период</div>
          )}
        </div>
        <div className={s.kpi}>
          <div className={s.kpiLabel}>Прогноз (взвеш.)</div>
          <div className={`${s.kpiValue} ${current?.gapFlag ? s.err : ''}`}>
            {current?.weightedForecastDate
              ? new Date(current.weightedForecastDate).toLocaleDateString('ru-RU')
              : '—'}
          </div>
        </div>
        <div className={s.kpi}>
          <div className={s.kpiLabel}>Прогноз (крит. путь)</div>
          <div className={`${s.kpiValue} ${current?.gapFlag ? s.err : ''}`}>
            {current?.criticalPathForecastDate
              ? new Date(current.criticalPathForecastDate).toLocaleDateString('ru-RU')
              : '—'}
          </div>
        </div>
        <div className={s.kpi}>
          <div className={s.kpiLabel}>Разрыв прогнозов</div>
          {current?.gapFlag ? (
            <>
              <div className={s.gapPill}>Разрыв есть</div>
              <div className={s.gapSub}>Прогнозы расходятся</div>
            </>
          ) : (
            <div className={s.noGap}>✓ Нет</div>
          )}
        </div>
      </div>

      {/* Current period */}
      {currentPeriod && (
        <div className={s.section}>
          <div className={s.secHead}>
            <span className={s.secTitle}>Текущий период</span>
          </div>
          <div className={s.periodRow}>
            <div>
              <div className={s.periodName}>Период № {currentPeriod.periodNumber}</div>
              <div className={s.periodSub}>
                Открыт: {new Date(currentPeriod.openedAt).toLocaleDateString('ru-RU')}
              </div>
            </div>
            <div className={s.periodActions}>
              <StatusPill variant="gap">
                {PERIOD_STATUS_LABELS[currentPeriod.status] ?? currentPeriod.status}
              </StatusPill>
              <Link className={s.openLink} to={`/periods/${currentPeriod.id}`}>
                Открыть →
              </Link>
            </div>
          </div>
        </div>
      )}

      {!currentPeriod && canAct && (
        <div className={s.section}>
          <div className={s.secHead}>
            <span className={s.secTitle}>Период</span>
          </div>
          <button
            className={s.openPeriodBtn}
            onClick={() => openPeriod.mutate(objectId, { onSuccess: (p) => navigate(`/periods/${p.id}`) })}
            disabled={openPeriod.isPending}
          >
            {openPeriod.isPending ? 'Открываем...' : 'Открыть период'}
          </button>
        </div>
      )}

      {/* Active BoQ */}
      {activeBoq && (
        <div className={s.section}>
          <div className={s.secHead}>
            <span className={s.secTitle}>Активный BoQ</span>
          </div>
          <div className={s.boqRow}>
            <span className={s.boqVersion}>Версия {activeBoq.versionNumber}</span>
            <span className={s.boqCount}>{activeBoq.itemsCount} позиций</span>
          </div>
        </div>
      )}

      {/* Participants */}
      {participants.length > 0 && (
        <div className={s.section}>
          <div className={s.secHead}>
            <span className={s.secTitle}>Участники</span>
          </div>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Роль</th>
                <th>Организация</th>
                <th>Контакт</th>
                <th>С</th>
              </tr>
            </thead>
            <tbody>
              {participants.map((p, i) => (
                <tr key={i}>
                  <td>{p.role}</td>
                  <td>{p.orgName}</td>
                  <td>{p.contactPerson ?? <span className={s.emptyCell}>—</span>}</td>
                  <td className={s.monoCell}>{p.validFrom}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* History */}
      <div className={s.section}>
        <div className={s.secHead}>
          <span className={s.secTitle}>История периодов ({history.length})</span>
        </div>
        {history.length === 0 ? (
          <div className={s.boqRow}>
            <span className={s.boqCount}>Нет закрытых периодов</span>
          </div>
        ) : (
          <table className={s.table}>
            <thead>
              <tr>
                <th>Период</th>
                <th>Закрыт</th>
                <th>Готовность</th>
                <th>Прогноз (взвеш.)</th>
                <th>Разрыв</th>
                <th>BoQ</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.periodId}>
                  <td className={s.monoCell}>#{h.periodNumber}</td>
                  <td className={s.monoCell}>
                    {h.closedAt ? new Date(h.closedAt).toLocaleDateString('ru-RU') : '—'}
                  </td>
                  <td>
                    <ProgressBar value={h.objectReadinessPct} />
                  </td>
                  <td className={`${s.monoCell} ${h.gapFlag ? s.errCell : ''}`}>
                    {h.weightedForecastDate
                      ? new Date(h.weightedForecastDate).toLocaleDateString('ru-RU')
                      : '—'}
                  </td>
                  <td>
                    {h.gapFlag ? (
                      <StatusPill variant="gap">⚠</StatusPill>
                    ) : (
                      <span className={s.okMark}>✓</span>
                    )}
                  </td>
                  <td className={s.monoCell}>{h.boqVersionNumber}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
