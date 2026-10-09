import { useMemo } from 'react';
import { TRACKS, type TrackInfo } from '../data/tracks';
import { formatRaceTime } from '../game/utils/geometry';
import { useReferenceData } from '../hooks/useReferenceData';
import { useRouter } from '../router/RouterProvider';
import type { BackendTrack } from '../services/api';
import { useGameStore } from '../store/GameStore';
import { useKeyPress } from '../hooks/useKeyPress';
import './track-select.css';

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function mergeTracks(remote: BackendTrack[] | undefined): readonly TrackInfo[] {
  if (!remote || remote.length === 0) return TRACKS;
  return TRACKS.map((local) => {
    const match = remote.find((r) => sameName(r.name, local.name));
    if (!match) return local;
    return {
      ...local,
      description: match.description ?? local.description,
      difficulty: match.difficulty ?? local.difficulty,
      weather: match.weather ?? local.weather,
      environment: match.environment ?? local.environment,
      bestTimeMs: match.bestTimeMs ?? local.bestTimeMs,
    };
  });
}

export function TrackSelectPage() {
  const { state, dispatch } = useGameStore();
  const { navigate } = useRouter();
  const { data } = useReferenceData();
  const tracks = useMemo(() => mergeTracks(data?.tracks), [data]);

  const currentTrackId = state.selectedTrackId || tracks[0]?.id || 'hawkins-streets';
  const selectedTrack = tracks.find(t => t.id === currentTrackId) || tracks[0];

  const startRace = () => {
    if (state.selectedTrackId) {
      dispatch({ type: 'SELECT_GAME_MODE', id: 'quick-race' });
      dispatch({ type: 'START_RACE' });
      navigate('race');
    }
  };

  useKeyPress('Escape', () => navigate('car'));
  useKeyPress('Enter', startRace);

  return (
    <div className="track-layout">
      {/* Background Atmosphere */}
      <div 
        className="track-atmosphere" 
        style={{ backgroundImage: `url(/assets/tracks/${selectedTrack.id}.png)` }}
      ></div>
      <div className="track-gradient-overlay"></div>
      <div className="track-fog-overlay"></div>

      <header className="track-header">
        <div className="track-brand">HAWKINS: NITRO RUN</div>
        <ol className="track-steps" aria-label="Progress">
          <li className="done">DRIVER</li>
          <li className="done">CAR</li>
          <li className="on">TRACK</li>
        </ol>
        <div className="track-profile">GUEST_DRIVER_01</div>
      </header>

      <main className="track-main">
        <div className="track-content">
          <div className="track-info-panel" key={`info-${selectedTrack.id}`}>
            <div className="info-label">LOCATION SELECTION</div>
            <h1 className="info-title">CHOOSE YOUR TRACK</h1>
            
            <h2 className="track-name">{selectedTrack.name}</h2>
            <p className="track-description">{selectedTrack.description}</p>
            
            <div className="track-stats">
              <div className="stat-row">
                <span className="stat-label">ENVIRONMENT</span>
                <span className="stat-value">{selectedTrack.environment.toUpperCase()}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">WEATHER</span>
                <span className="stat-value">{selectedTrack.weather.toUpperCase()}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">DIFFICULTY</span>
                <span className="stat-value accent">{selectedTrack.difficulty.toUpperCase()}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">BEST TIME</span>
                <span className="stat-value">{selectedTrack.bestTimeMs === null ? '--:--.---' : formatRaceTime(selectedTrack.bestTimeMs)}</span>
              </div>
            </div>
          </div>

          <div className="track-preview-panel">
            <img 
              key={`img-${selectedTrack.id}`}
              src={`/assets/tracks/${selectedTrack.id}.png`} 
              alt={selectedTrack.name} 
              className="track-large-image" 
            />
          </div>
        </div>

        <div className="track-carousel-container">
          <div className="track-carousel">
            {tracks.map((t) => (
              <button
                key={t.id}
                className={`track-thumbnail ${t.id === currentTrackId ? 'selected' : ''}`}
                onClick={() => dispatch({ type: 'SELECT_TRACK', id: t.id })}
                aria-label={`Select ${t.name}`}
              >
                <img src={`/assets/tracks/${t.id}.png`} alt={t.name} loading="lazy" />
                <span className="track-thumbnail-name">{t.name}</span>
              </button>
            ))}
          </div>
        </div>

        <footer className="track-footer">
          <button className="nav-button" onClick={() => navigate('car')}>
            BACK
          </button>
          <button 
            className="nav-button primary" 
            onClick={startRace}
            disabled={!state.selectedTrackId}
          >
            START RACE
          </button>
        </footer>
      </main>
    </div>
  );
}
