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
            <div className="portrait" style={{ '--accent': c.accent } as CSSProperties}><span>{c.name[0]}</span></div>
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
