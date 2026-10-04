import type { CSSProperties } from 'react';
import { ScreenFrame } from '../components/ScreenFrame';
import { SelectCard } from '../components/SelectCard';
import { StatBar } from '../components/StatBar';
import { CHARACTERS } from '../data/characters';
import { useGameStore } from '../store/GameStore';

export function CharacterSelectPage() {
  const { state, dispatch } = useGameStore();
  return (
    <ScreenFrame
      step={1}
      title="CHOOSE YOUR DRIVER"
      onBack={() => dispatch({ type: 'NAVIGATE', screen: 'menu' })}
      onContinue={() => dispatch({ type: 'NAVIGATE', screen: 'car' })}
      continueDisabled={!state.selectedCharacterId}
    >
      <div className="card-grid">
        {CHARACTERS.map((c) => (
          <SelectCard key={c.id} accent={c.accent} selected={state.selectedCharacterId === c.id} onSelect={() => dispatch({ type: 'SELECT_CHARACTER', id: c.id })}>
            <div className="portrait" style={{ '--accent': c.accent } as CSSProperties}>
              <svg viewBox="0 0 100 120" style={{ width: '80%', height: '80%', opacity: 0.9, filter: `drop-shadow(0 0 12px ${c.accent})` }}>
                {c.id === 'steve' && (
                  <path d="M40 10 C45 0 65 0 70 15 C75 25 75 35 65 40 C70 45 70 65 50 75 C30 65 30 45 35 40 C25 35 25 25 30 15 Z M20 110 C20 85 35 80 50 80 C65 80 80 85 80 110 L80 120 L20 120 Z" fill={c.accent} />
                )}
                {c.id === 'max' && (
                  <path d="M35 15 C45 10 55 10 65 15 C80 25 80 50 75 75 C70 65 70 55 50 70 C30 55 30 65 25 75 C20 50 20 25 35 15 Z M20 110 C20 90 35 85 50 85 C65 85 80 90 80 110 L80 120 L20 120 Z" fill={c.accent} />
                )}
                {c.id === 'mike' && (
                  <path d="M25 30 C30 10 70 10 75 30 C80 40 80 45 75 50 C70 45 70 65 50 75 C30 65 30 45 25 50 C20 45 20 40 25 30 Z M25 110 C25 90 35 88 50 88 C65 88 75 90 75 110 L75 120 L25 120 Z" fill={c.accent} />
                )}
                {c.id === 'will' && (
                  <path d="M30 25 C40 15 60 15 70 25 C75 35 75 40 70 45 C65 40 65 60 50 70 C35 60 35 40 30 45 C25 40 25 35 30 25 Z M30 110 C30 95 40 92 50 92 C60 92 70 95 70 110 L70 120 L30 120 Z" fill={c.accent} />
                )}
                {c.id === 'dustin' && (
                  <path d="M35 25 C35 15 65 15 65 25 C75 25 80 35 75 45 C75 45 70 65 50 75 C30 65 25 45 25 45 C20 35 25 25 35 25 Z M20 110 C20 85 30 85 50 85 C70 85 80 85 80 110 L80 120 L20 120 Z" fill={c.accent} />
                )}
              </svg>
            </div>
            <h3 className="card-title">{c.name}</h3>
            <p className="card-role">{c.role}</p>
            <div className="stats">
              <StatBar label="SPD" value={c.stats.speed} />
              <StatBar label="HND" value={c.stats.handling} />
              <StatBar label="NOS" value={c.stats.nitro} />
              <StatBar label="DUR" value={c.stats.awareness} />
            </div>
            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)', letterSpacing: '0.2em' }}>ABILITY</p>
              <p style={{ fontFamily: 'var(--display)', fontSize: '16px', color: c.accent, letterSpacing: '0.1em' }}>"{c.ability}"</p>
            </div>
          </SelectCard>
        ))}
      </div>
    </ScreenFrame>
  );
}
