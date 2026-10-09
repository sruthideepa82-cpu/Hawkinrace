import type { CSSProperties } from 'react';
import { ScreenFrame } from '../components/ScreenFrame';
import { CHARACTERS } from '../data/characters';
import { useRouter } from '../router/RouterProvider';
import { useGameStore } from '../store/GameStore';
import '../character.css';

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
      <div className="character-grid">
        {CHARACTERS.map((c) => {
          const isSelected = state.selectedCharacterId === c.id;
          return (
            <button 
              key={c.id} 
              className={`char-card ${isSelected ? 'selected' : ''}`}
              style={{ '--accent': c.accent } as CSSProperties}
              onClick={() => dispatch({ type: 'SELECT_CHARACTER', id: c.id })}
            >
              <div className="char-portrait-container">
                <img 
                  src={`/assets/characters/${c.id}.png`} 
                  alt={c.name}
                  className="char-portrait-img"
                />
                <div className="char-portrait-overlay"></div>
              </div>
              
              <div className="char-info">
                <h3 className="char-name">{c.name}</h3>
                <p className="char-role">{c.role}</p>
                <p className="char-blurb">{c.blurb}</p>
                
                <div className="char-ability-container">
                  <p className="char-ability-label">ABILITY: <span className="char-ability-name">{c.ability}</span></p>
                  <p className="char-ability-desc">"{c.abilityDesc}"</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </ScreenFrame>
  );
}
