import type { StandingEntry } from '../game/bridge';
import { NeonButton } from '../components/NeonButton';
import { PLACEHOLDER_COINS } from '../data/placeholders';
import { formatRaceTime } from '../game/utils/geometry';
import { useGameStore } from '../store/GameStore';

function ordinal(n: number): string {
  const suffix = n === 1 ? 'ST' : n === 2 ? 'ND' : n === 3 ? 'RD' : 'TH';
  return `${n}${suffix}`;
}

export function ResultsPage() {
  const { state, dispatch } = useGameStore();
  const result = state.lastResult;

  const retry = () => dispatch({ type: 'START_RACE' });
  const trackSelect = () => dispatch({ type: 'NAVIGATE', screen: 'track' });
  const mainMenu = () => dispatch({ type: 'NAVIGATE', screen: 'menu' });

  if (!result) return null;

  const standings = result.standings;
  const me = standings.find((s) => s.isPlayer) ?? standings[0];
  const playerPosition = result.playerPosition;
  const isFailed = result.outcome === 'failed';
  const isWin = !isFailed && playerPosition === 1;

  // Calculate time deltas for finishing order
  const firstPlaceTime = standings[0]?.finishTimeMs ?? result.timeMs;

  return (
    <div className={`cinematic-results ${isWin ? 'results-win' : ''} ${isFailed ? 'results-fail' : ''}`}>
      <div className="results-pane">
        
        {/* Header Section */}
        <header className="results-header">
          <p className="results-label">{isFailed ? 'RACE FAILED' : 'RACE COMPLETE'}</p>
          <h1 className="results-pos">{ordinal(playerPosition)}</h1>
          
          <div className="results-hero-info">
            {isWin && <div className="victory-label">VICTORY</div>}
            <h2 className="player-name">{me.characterName}</h2>
            <div className="total-time">{formatRaceTime(result.timeMs)}</div>
          </div>
        </header>

        {/* Stats Row */}
        {!isFailed && (
          <div className="stats-row">
            <div className="stat">
              <span className="stat-label">POSITION</span>
              <span className="stat-value">{ordinal(playerPosition)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">TIME</span>
              <span className="stat-value">{formatRaceTime(result.timeMs)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">BEST LAP</span>
              <span className="stat-value">{result.playerBestLapMs ? formatRaceTime(result.playerBestLapMs) : '--:--.---'}</span>
            </div>
            <div className="stat">
              <span className="stat-label">LAPS</span>
              <span className="stat-value">{result.lapsCompleted} / {result.totalLaps}</span>
            </div>
            <div className="stat">
              <span className="stat-label">COINS</span>
              <span className="stat-value">+{PLACEHOLDER_COINS}</span>
            </div>
          </div>
        )}

        {/* Failure Message */}
        {isFailed && (
          <div className="failure-message">
            <p>THREE RACERS FINISHED BEFORE YOU.</p>
          </div>
        )}

        {/* Layout split: Finishing Order & Lap Times */}
        <div className="results-details">
          {/* Finishing Order */}
          <div className="telemetry-panel">
            <h3 className="telemetry-title">FINISHING ORDER</h3>
            <div className="telemetry-list">
              {standings.map((entry: StandingEntry, index) => {
                const isFirst = index === 0;
                const timeText = entry.finishTimeMs 
                  ? (isFirst ? formatRaceTime(entry.finishTimeMs) : `+${formatRaceTime(entry.finishTimeMs - firstPlaceTime)}`)
                  : 'DNF';

                return (
                  <div key={entry.characterId} className={`telemetry-row ${entry.isPlayer ? 'is-player' : ''}`}>
                    <span className="t-pos">{String(entry.position).padStart(2, '0')}</span>
                    <span className="t-name">{entry.characterName}</span>
                    <span className="t-time">{timeText}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Lap Times */}
          {result.lapTimesMs.length > 0 && (
            <div className="telemetry-panel">
              <h3 className="telemetry-title">LAP TIMES</h3>
              <div className="telemetry-list">
                {result.lapTimesMs.map((ms, i) => (
                  <div key={i} className="telemetry-row">
                    <span className="t-pos">{String(i + 1).padStart(2, '0')}</span>
                    <span className="t-name">LAP {i + 1}</span>
                    <span className="t-time">{formatRaceTime(ms)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="results-actions-modern">
          <NeonButton onClick={retry} className="btn-primary">RETRY</NeonButton>
          <NeonButton variant="ghost" onClick={trackSelect} className="btn-secondary">TRACK SELECT</NeonButton>
          <NeonButton variant="ghost" onClick={mainMenu} className="btn-secondary">MAIN MENU</NeonButton>
        </div>
        
      </div>
    </div>
  );
}