import { useEffect, useState, type CSSProperties } from 'react';
import { ScreenFrame } from '../components/ScreenFrame';
import { CHARACTERS } from '../data/characters';
import { usePlayerProfile } from '../hooks/usePlayerProfile';
import { useRouter } from '../router/RouterProvider';
import { useGameStore } from '../store/GameStore';
import '../character.css';

export function CharacterSelectPage() {
  const { state, dispatch } = useGameStore();
  const { navigate } = useRouter();
  const { profile, ensure } = usePlayerProfile();
  const [profileNote, setProfileNote] = useState<string | null>(null);

  /**
   * Make sure a backend profile exists for whichever driver is selected.
   *
   * Runs in an effect keyed on the selection, so choosing the same driver twice
   * does not re-create anything: `ensureProfile` is find-or-create and returns
   * the existing row.
   *
   * StrictMode invokes this twice in development. That is harmless here and is
   * precisely why the operation is idempotent rather than guarded with a ref --
   * a ref would suppress the real second call and hide genuine duplicates.
   *
   * The selection screen never waits for it. Choosing a driver must feel
   * instant, and a player with no backend still races.
   */
  useEffect(() => {
    const chosen = CHARACTERS.find((c) => c.id === state.selectedCharacterId);
    if (!chosen) return;

    let active = true;
    setProfileNote(null);
    ensure(chosen.name)
      .then((created) => {
        if (!active) return;
        setProfileNote(
          created
            ? `Racing as ${created.displayName} — results will be saved to the leaderboard.`
            : 'Offline: your results will not be saved this session.',
        );
      })
      .catch(() => {
        if (active) setProfileNote('Offline: your results will not be saved this session.');
      });

    return () => {
      active = false;
    };
  }, [state.selectedCharacterId, ensure]);

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

      {/* Persisted-profile status. Announced politely because it resolves
          asynchronously and would otherwise appear from nowhere.

          Shown while a driver is selected but `ensure` has not answered yet, so
          the line does not pop into existence without explanation. Selecting a
          driver with no backend leaves it on LINKING briefly and then settles
          on the offline wording -- never on an error, because a missing backend
          is an expected state and not something to alarm the player about. */}
      {state.selectedCharacterId ? (
        <p
          className={`character-profile-note is-${
            profileNote === null ? 'pending' : profile?.id ? 'linked' : 'offline'
          }`}
          role="status"
        >
          {profileNote ?? 'LINKING PROFILE…'}
        </p>
      ) : null}
    </ScreenFrame>
  );
}
