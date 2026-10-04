import type { CSSProperties, ReactNode } from 'react';

interface Props {
  selected: boolean;
  /** Text shown on unavailable cards, e.g. "LOCKED" or "COMING SOON". */
  unavailableLabel?: string;
  accent?: string;
  onSelect: () => void;
  children: ReactNode;
}

/** A selectable card with consistent selected / locked states. */
export function SelectCard({ selected, unavailableLabel, accent = '#ff2e63', onSelect, children }: Props) {
  const locked = Boolean(unavailableLabel);
  const classes = ['card', selected ? 'is-selected' : '', locked ? 'is-locked' : ''].join(' ');
  return (
    <button
      type="button"
      className={classes}
      style={{ '--accent': accent } as CSSProperties}
      aria-pressed={selected}
      aria-disabled={locked}
      onClick={() => { if (!locked) onSelect(); }}
    >
      {children}
      {selected && <span className="badge badge-selected">[ SELECTED ]</span>}
      {locked && <span className="badge badge-locked">{unavailableLabel}</span>}
    </button>
  );
}
