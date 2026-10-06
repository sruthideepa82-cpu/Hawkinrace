import type { CSSProperties } from 'react';
import { ScreenFrame } from '../components/ScreenFrame';
import { SelectCard } from '../components/SelectCard';
import { StatBar } from '../components/StatBar';
import { CHARACTERS } from '../data/characters';
import { useRouter } from '../router/RouterProvider';
import { useGameStore } from '../store/GameStore';

export function CharacterSelectPage() {
  const { state, dispatch } = useGameStore();
  const { navigate } = useRouter();
  return (
    <ScreenFrame
      step={1}
      title="CHOOSE YOUR DRIVER"
      onBack={() => navigate('menu')}
      onContinue={() => navigate('car')}
      continueDisabled={!state.selectedCharacterId}
    >
      <div className="card-grid">
        {CHARACTERS.map((c) => (
          <SelectCard key={c.id} accent={c.accent} selected={state.selectedCharacterId === c.id} onSelect={() => dispatch({ type: 'SELECT_CHARACTER', id: c.id })}>
            <div className="portrait" style={{ '--accent': c.accent } as CSSProperties}>
              <img 
                src={`/assets/characters/${c.id}.png`} 
                alt={c.name}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  opacity: 0.9,
                  filter: `drop-shadow(0 0 12px ${c.accent})`,
                  mixBlendMode: 'screen',
                }}
              />
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
