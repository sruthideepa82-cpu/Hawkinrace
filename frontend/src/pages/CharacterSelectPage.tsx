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
              <svg viewBox="0 0 100 120" style={{ width: '80%', height: '80%', opacity: 0.8, filter: `drop-shadow(0 0 10px ${c.accent})` }}>
                <path d="M50 20 C65 20 75 35 75 50 C75 65 65 80 50 80 C35 80 25 65 25 50 C25 35 35 20 50 20 Z M20 110 C20 90 35 85 50 85 C65 85 80 90 80 110 L80 120 L20 120 Z" fill={c.accent} />
              </svg>
            </div>
            <h3 className="card-title">{c.name}</h3>
            <p className="card-role">{c.role}</p>
            <p className="card-blurb">{c.blurb}</p>
            <div className="stats">
              <StatBar label="SPD" value={c.stats.speed} />
              <StatBar label="HND" value={c.stats.handling} />
              <StatBar label="NOS" value={c.stats.nitro} />
              <StatBar label="AWR" value={c.stats.awareness} />
            </div>
          </SelectCard>
        ))}
      </div>
    </ScreenFrame>
  );
}
