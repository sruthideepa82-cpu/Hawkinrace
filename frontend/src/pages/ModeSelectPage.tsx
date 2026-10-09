import { GAME_MODES } from '../data/gameModes';
import { useRouter } from '../router/RouterProvider';
import { useGameStore } from '../store/GameStore';
import { useKeyPress } from '../hooks/useKeyPress';
import './mode-select.css';

export function ModeSelectPage() {
  const { state, dispatch } = useGameStore();
  const { navigate } = useRouter();

  // START_RACE bumps the raceKey, which is what rebuilds the Phaser game.
  const startRace = () => {
    const modeToStart = state.selectedGameModeId || 'quick-race';
    if (!state.selectedGameModeId) {
      dispatch({ type: 'SELECT_GAME_MODE', id: modeToStart });
    }
    dispatch({ type: 'START_RACE' });
    navigate('race');
  };

  useKeyPress('Escape', () => navigate('track'));
  useKeyPress('Enter', startRace);

  // Set default selection to first playable mode if none is selected
  const currentModeId = state.selectedGameModeId || 'quick-race';

  return (
    <div className="mode-layout">
      {/* Background Atmosphere */}
      <div 
        className="track-atmosphere" 
        style={{ backgroundImage: `url(/assets/modes/${GAME_MODES.find(m => m.id === currentModeId)?.imageId || 'quick_race'}.png)`, filter: 'blur(30px) opacity(0.3)' }}
      ></div>

      <header className="mode-header">
        <div className="mode-brand">HAWKINS: NITRO RUN</div>
        <ol className="mode-steps" aria-label="Progress">
          <li className="done">DRIVER</li>
          <li className="done">CAR</li>
          <li className="done">TRACK</li>
          <li className="on">MODE</li>
        </ol>
        <div className="mode-profile">GUEST_DRIVER_01</div>
      </header>

      <main className="mode-main">
        <div className="mode-title-container">
          <div className="info-label">RACE SETUP</div>
          <h1 className="info-title">CHOOSE YOUR MODE</h1>
        </div>

        <div className="mode-grid">
          {GAME_MODES.map((m, index) => {
            const isSelected = currentModeId === m.id;
            const isFeatured = index === 0;
            return (
              <div 
                key={m.id}
                className={`mode-card ${isFeatured ? 'featured' : ''} ${isSelected ? 'selected' : ''} ${!m.playable ? 'disabled' : ''}`}
                onClick={() => {
                  if (m.playable) dispatch({ type: 'SELECT_GAME_MODE', id: m.id });
                }}
                role={m.playable ? "button" : "presentation"}
                aria-disabled={!m.playable}
              >
                <img src={`/assets/modes/${m.imageId}.png`} alt={m.name} className="mode-img" />
                <div className="mode-overlay"></div>
                <div className="mode-content">
                  {m.label && <div className="mode-label">{m.label}</div>}
                  <h2 className="mode-card-title">{m.name}</h2>
                  <p className="mode-desc">{m.description}</p>
                </div>
                {!m.playable && <div className="mode-locked">COMING SOON</div>}
              </div>
            );
          })}
        </div>

        <footer className="mode-footer">
          <button className="nav-button" onClick={() => navigate('track')}>
            BACK
          </button>
          <button 
            className="nav-button primary" 
            onClick={startRace}
          >
            START RACE
          </button>
        </footer>
      </main>
    </div>
  );
}
