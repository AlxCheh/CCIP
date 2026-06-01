import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useGpFormData, useGpSubmit, getGpError } from '../hooks/useGpForm';
import type { GpFormResponse } from '../services/api';

// ─── Palette ──────────────────────────────────────────────────────────────────

const C = {
  cream:   '#f5ede0',
  dark:    '#1e1208',
  dark2:   '#2e1a0a',
  dark3:   '#3a2510',
  accent:  '#d4824a',
  brown:   '#7a5030',
  brown2:  '#9a6040',
  text:    '#3d1f08',
  rule:    '#d8c4a8',
  err:     '#c84a2a',
  errBg:   '#fde8e4',
  green:   '#4a8a50',
} as const;

const MONO: React.CSSProperties = { fontFamily: "'Space Mono', 'Courier New', monospace" };
const SERIF: React.CSSProperties = { fontFamily: "'EB Garamond', Georgia, serif" };

// ─── Sub-states ───────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div data-testid="gp-loading" style={{ ...cardWrap() }}>
      <TopBar />
      <div style={{ padding: '32px 24px' }}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              height: 36, background: C.rule, borderRadius: 2,
              marginBottom: 12, opacity: 0.5,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ExpiredState() {
  return (
    <div data-testid="gp-expired" style={{ ...cardWrap() }}>
      <TopBar />
      <div style={stateBody()}>
        <div style={{ fontSize: 28, marginBottom: 12, color: '#8b2a10' }}>⊗</div>
        <div style={{ ...SERIF, fontSize: 22, color: '#8b2a10', marginBottom: 8 }}>
          Ссылка недействительна
        </div>
        <div style={{ ...SERIF, fontSize: 13, color: C.brown2, fontStyle: 'italic', lineHeight: 1.6 }}>
          Срок подачи данных истёк или ссылка была отозвана.
          Обратитесь к куратору от стройконтроля.
        </div>
      </div>
    </div>
  );
}

function AlreadySubmittedState() {
  return (
    <div data-testid="gp-already-submitted" style={{ ...cardWrap() }}>
      <TopBar />
      <div style={stateBody()}>
        <div style={{ fontSize: 28, marginBottom: 12, color: '#5a4a10' }}>◈</div>
        <div style={{ ...SERIF, fontSize: 22, color: '#5a4a10', marginBottom: 8 }}>
          Данные уже поданы
        </div>
        <div style={{ ...SERIF, fontSize: 13, color: C.brown2, fontStyle: 'italic', lineHeight: 1.6 }}>
          Объёмы за этот период были отправлены ранее.
          Повторная подача невозможна.
        </div>
      </div>
    </div>
  );
}

function SuccessState({ name, data }: { name: string; data: GpFormResponse }) {
  return (
    <div data-testid="gp-success" style={{ ...cardWrap() }}>
      <TopBar />
      <div style={{ ...stateBody(), gap: 8 }}>
        <div style={{ fontSize: 28, marginBottom: 4 }}>✦</div>
        <div style={{ ...SERIF, fontSize: 24, color: C.text, marginBottom: 6 }}>
          Данные переданы
        </div>
        <div style={{ ...SERIF, fontSize: 13, color: C.brown2, fontStyle: 'italic', lineHeight: 1.6, marginBottom: 14 }}>
          Объёмы за период № {data.periodNumber} приняты.
          Стройконтроль приступит к верификации.
        </div>
        <hr style={{ border: 'none', borderTop: `1px solid ${C.rule}`, width: '100%' }} />
        <div style={{ ...MONO, fontSize: 10, color: C.brown, lineHeight: 2 }}>
          Объект: <span style={{ color: C.text }}>{data.objectName}</span><br />
          Подписант: <span style={{ color: C.text }}>{name}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function TopBar({ right }: { right?: string }) {
  return (
    <div style={{
      background: C.dark, padding: '10px 24px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <span style={{ ...MONO, fontSize: 8, letterSpacing: 3, color: C.accent, textTransform: 'uppercase' }}>
        Стройконтроль · Система учёта
      </span>
      {right && (
        <span style={{ ...MONO, fontSize: 8, color: C.brown, letterSpacing: 1 }}>{right}</span>
      )}
    </div>
  );
}

function cardWrap(): React.CSSProperties {
  return {
    width: 540, margin: '40px auto',
    background: C.cream,
    boxShadow: '0 8px 40px rgba(30,18,8,.2)',
  };
}

function stateBody(): React.CSSProperties {
  return {
    padding: '32px 24px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
  };
}

function daysUntil(isoDate: string): number {
  return Math.max(0, Math.ceil((new Date(isoDate).getTime() - Date.now()) / 86_400_000));
}

// ─── Main Form ────────────────────────────────────────────────────────────────

export function GpFormPage() {
  const { token = '' } = useParams<{ token: string }>();
  const { data, isLoading, error } = useGpFormData(token);
  const submitMutation = useGpSubmit(token);

  const [values, setValues] = useState<Record<number, string>>({});
  const [name, setName]     = useState('');
  const [touched, setTouched] = useState(false);
  const [success, setSuccess] = useState(false);

  // Loading
  if (isLoading) return <LoadingState />;

  // Error states
  if (error) {
    const kind = getGpError(error);
    if (kind === 'already_submitted') return <AlreadySubmittedState />;
    return <ExpiredState />;
  }

  if (!data) return null;

  // Success
  if (success) return <SuccessState name={name} data={data} />;

  // Validation helpers
  function isValid(id: number) {
    const v = values[id]?.trim() ?? '';
    return v !== '' && !isNaN(parseFloat(v)) && parseFloat(v) >= 0;
  }

  const filledCount = data.items.filter((item) => isValid(item.boqItemId)).length;
  const allFilled   = filledCount === data.items.length;
  const canSubmit   = allFilled && name.trim() !== '';

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    submitMutation.mutate(
      {
        gpSubmittedByName: name.trim(),
        items: data!.items.map((item) => ({
          boqItemId: item.boqItemId,
          gpVolume: parseFloat(values[item.boqItemId]),
        })),
      },
      { onSuccess: () => setSuccess(true) },
    );
  }

  const progressPct = data.items.length > 0
    ? Math.round((filledCount / data.items.length) * 100)
    : 0;

  const progressColor =
    touched && !allFilled ? C.err :
    progressPct === 100   ? C.green :
    C.accent;

  const days = daysUntil(data.gpTokenExpiresAt);

  return (
    <div style={{ background: '#e8ddd0', minHeight: '100vh', padding: '32px 0' }}>
      <div style={cardWrap()}>

        <TopBar right={new Date().toISOString().slice(0, 10)} />

        {/* Hero */}
        <div style={{ padding: '24px 24px 20px', borderBottom: `1px solid ${C.rule}` }}>
          <div style={{ ...MONO, fontSize: 8, letterSpacing: 3, color: C.brown2, textTransform: 'uppercase', marginBottom: 10 }}>
            Период № {data.periodNumber} · Объект «{data.objectName}»
          </div>
          <div style={{ ...SERIF, fontSize: 30, color: C.text, lineHeight: 1.05, marginBottom: 10 }}>
            Ведомость объёмов<br />Генерального подрядчика
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{
              ...MONO, fontSize: 8, letterSpacing: 1, color: C.accent,
              background: 'rgba(212,130,74,.1)', border: `1px solid rgba(212,130,74,.3)`,
              padding: '3px 10px',
            }}>
              До {new Date(data.gpTokenExpiresAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} · {days} дн.
            </span>
            <span style={{ ...MONO, fontSize: 8, color: C.brown }}>
              {data.items.length} позиц.
            </span>
          </div>
        </div>

        {/* Instruction */}
        <div style={{ padding: '10px 24px', borderBottom: `1px solid ${C.rule}`, background: 'rgba(212,130,74,.04)' }}>
          <p style={{ ...SERIF, fontSize: 12, color: C.brown2, fontStyle: 'italic', lineHeight: 1.5 }}>
            Заполните фактические объёмы выполненных работ. После отправки данные будут переданы стройконтролю.
          </p>
        </div>

        {/* Form */}
        <form data-testid="gp-form" onSubmit={handleSubmit}>

          {/* Ledger */}
          <div style={{ padding: '0 24px' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 120px',
              padding: '10px 0 6px', borderBottom: `2px solid ${C.dark}`,
            }}>
              <span style={{ ...MONO, fontSize: 7, letterSpacing: 2, color: C.dark, textTransform: 'uppercase' }}>
                Наименование / Плановый объём
              </span>
              <span style={{ ...MONO, fontSize: 7, letterSpacing: 2, color: C.dark, textTransform: 'uppercase', textAlign: 'right' }}>
                Факт ГП
              </span>
            </div>

            {data.items.map((item, idx) => {
              const hasError = touched && !isValid(item.boqItemId);
              const isFilled = isValid(item.boqItemId);
              return (
                <div
                  key={item.boqItemId}
                  data-testid={hasError ? `gp-row-error-${item.boqItemId}` : `gp-row-${item.boqItemId}`}
                  style={{
                    display: 'grid', gridTemplateColumns: '1fr 120px',
                    alignItems: 'center', padding: '11px 0',
                    borderBottom: idx < data.items.length - 1 ? `1px solid ${C.rule}` : 'none',
                    background: hasError ? C.errBg : 'transparent',
                    margin: hasError ? '0 -24px' : 0,
                    paddingLeft: hasError ? 24 : 0,
                    paddingRight: hasError ? 24 : 0,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{
                      ...SERIF, fontSize: 14,
                      color: hasError ? C.err : isFilled ? C.brown : C.text,
                    }}>
                      {item.name}
                    </span>
                    <span style={{ ...MONO, fontSize: 9, color: hasError ? C.err : C.brown }}>
                      {hasError ? 'обязательно к заполнению' : `план — ${item.planVolume} ${item.unit}`}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 5 }}>
                    <input
                      data-testid="gp-volume-input"
                      type="number"
                      min="0"
                      step="any"
                      value={values[item.boqItemId] ?? ''}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [item.boqItemId]: e.target.value }))
                      }
                      style={{
                        width: 78, background: 'transparent', border: 'none',
                        borderBottom: `2px solid ${hasError ? C.err : isFilled ? C.brown : C.accent}`,
                        color: C.text, ...MONO, fontSize: 16, textAlign: 'right',
                        padding: '2px 0', outline: 'none',
                      }}
                    />
                    <span style={{ ...MONO, fontSize: 9, color: C.brown, width: 24 }}>
                      {item.unit}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Progress */}
          <div style={{ padding: '10px 24px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', ...MONO, fontSize: 8, color: C.brown2, marginBottom: 5 }}>
              <span>Заполнено</span>
              <span style={{ color: touched && !allFilled ? C.err : progressPct === 100 ? C.green : C.brown2 }}>
                {filledCount} из {data.items.length}{progressPct === 100 ? ' ✓' : ''}
              </span>
            </div>
            <div style={{ background: C.rule, height: 2, borderRadius: 1 }}>
              <div style={{ background: progressColor, height: 2, borderRadius: 1, width: `${progressPct}%`, transition: 'width .3s' }} />
            </div>
          </div>

          {/* Signatory */}
          <div style={{ padding: '14px 24px 0', borderTop: `2px solid ${C.dark}`, marginTop: 12 }}>
            <div style={{ ...MONO, fontSize: 7, letterSpacing: 2, color: C.brown2, textTransform: 'uppercase', marginBottom: 5 }}>
              Подписант
            </div>
            <input
              data-testid="gp-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Фамилия И.О., должность"
              style={{
                width: '100%', background: 'transparent', border: 'none',
                borderBottom: `1px solid ${C.rule}`, color: C.text,
                ...SERIF, fontSize: 14, fontStyle: 'italic', padding: '4px 0', outline: 'none',
              }}
            />
          </div>

          {/* Submit */}
          <div style={{ padding: '14px 24px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ ...MONO, fontSize: 8, color: touched && !canSubmit ? C.err : C.brown, lineHeight: 1.5, maxWidth: 180 }}>
              {touched && !canSubmit
                ? `⊗ ${data.items.length - filledCount} позиц. не заполнены`
                : 'Данные передаются однократно'}
            </div>
            <button
              data-testid="gp-submit-btn"
              type="submit"
              disabled={!canSubmit}
              style={{
                background: canSubmit ? C.dark : C.rule,
                color: canSubmit ? C.accent : C.brown2,
                ...MONO, fontSize: 9, letterSpacing: 2, padding: '13px 22px',
                border: 'none', cursor: canSubmit ? 'pointer' : 'not-allowed',
                textTransform: 'uppercase', whiteSpace: 'nowrap',
              }}
            >
              Отправить данные →
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
