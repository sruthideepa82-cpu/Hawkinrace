import type { ReactNode } from 'react';
import { useKeyPress } from '../hooks/useKeyPress';
import { NeonButton } from './NeonButton';

const STEPS = ['DRIVER', 'CAR', 'TRACK'] as const;

interface Props {
  title: string;
  /** 1-4 shows the selection progress; omit for other screens. */
  step?: number;
  onBack?: () => void;
  onContinue?: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  children: ReactNode;
}

export function ScreenFrame({ title, step, onBack, onContinue, continueLabel = 'CONTINUE >', continueDisabled, children }: Props) {
  useKeyPress('Escape', () => onBack?.(), Boolean(onBack));
  return (
    <section className="screen frame">
      <header className="frame-header">
        {step !== undefined && (
          <ol className="steps" aria-label="Progress">
            {STEPS.map((label, i) => (
              <li key={label} className={i + 1 === step ? 'on' : i + 1 < step ? 'done' : ''}>{label}</li>
            ))}
          </ol>
        )}
        <h2 className="frame-title">{title}</h2>
      </header>
      <div className="frame-body">{children}</div>
      <footer className="frame-footer">
        {onBack ? <NeonButton variant="ghost" onClick={onBack}>&lt; BACK</NeonButton> : <span />}
        {onContinue && <NeonButton onClick={onContinue} disabled={continueDisabled}>{continueLabel}</NeonButton>}
      </footer>
    </section>
  );
}
