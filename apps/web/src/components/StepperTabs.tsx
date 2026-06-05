import s from './StepperTabs.module.css';

type Props<T extends string> = {
  steps: readonly T[];
  current: T;
};

export function StepperTabs<T extends string>({ steps, current }: Props<T>) {
  const currentIdx = steps.indexOf(current);

  return (
    <div className={s.stepper}>
      {steps.map((step, i) => {
        const state = i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'ahead';
        const num = String(i + 1).padStart(2, '0');
        return (
          <div
            key={step}
            className={`${s.step} ${s[state]}`}
            aria-current={state === 'active' ? 'step' : undefined}
          >
            <span className={s.num}>{num}</span>
            <span className={`${s.label} ${state === 'active' ? s.activeLabel : ''}`}>{step}</span>
          </div>
        );
      })}
    </div>
  );
}
