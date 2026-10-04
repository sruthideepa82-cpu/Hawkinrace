import type { StandingEntry } from '../game/bridge';
import { NeonButton } from '../components/NeonButton';
import { PLACEHOLDER_COINS } from '../data/placeholders';
import { formatRaceTime } from '../game/utils/geometry';
import { useGameStore } from '../store/GameStore';

/** 1 -> "1ST", 2 -> "2ND", 3 -> "3RD", 4 -> "4TH". */
function ordinal(n: number): string {
  const suffix = n === 1 ? 'ST' : n === 2 ? 'ND' : n === 3 ? 'RD' : 'TH';
  return `${n}${suffix}`;
}

const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

export function ResultsPage() {
  const { state, dispatch } = useGameStore();
  const result = state.lastResult;

  // RETRY rebuilds the Phaser game from scratch, so all four cars, laps,
  // checkpoints, timers and nitro are reset by construction.
  const retry = () => dispatch({ type: 'START_RACE' });

  if (!result) {
    return (
      <section className="screen results">
        <h2 className="results-title">RACE COMPLETE</h2>
        <p className="muted">No race data.</p>
        <div className="results-actions">
          <NeonButton onClick={retry}>RETRY</NeonButton>
          <NeonButton variant="ghost" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'track' })}>TRACK SELECT</NeonButton>
          <NeonButton variant="ghost" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'menu' })}>MAIN MENU</NeonButton>
        </div>
      </section>
    );
  }

  const standings = result.standings;
  const me = standings.find((s) => s.isPlayer);
  const playerPosition = result.playerPosition;

  return (
    <section className="screen results">
      <h2 className="results-title">RACE COMPLETE</h2>

      <ol className="standings" aria-label="Final classification">
        {standings.map((entry: StandingEntry) => (
          <li
            key={entry.characterId}
            className={entry.isPlayer ? 'standing player' : 'standing'}
          >
            <span className="standing-pos">{ordinal(entry.position)}</span>
            <span className="standing-chip" style={{ background: hex(entry.color) }} aria-hidden />
            <span className="standing-name">{entry.characterName}</span>
            <span className="standing-car">{entry.carName}</span>
            <span className="standing-time">
              {entry.finishTimeMs != null ? formatRaceTime(entry.finishTimeMs) : `LAP ${entry.lap}/${entry.totalLaps}`}
            </span>
          </li>
        ))}
      </ol>

      <dl className="results-grid">
        <div>
          <dt>PLAYER RESULT</dt>
          <dd style={{ color: me ? hex(me.color) : undefined }}>{ordinal(playerPosition)} PLACE</dd>
        </div>
        <div>
          <dt>TOTAL TIME</dt>
          <dd>{formatRaceTime(result.timeMs)}</dd>
        </div>
        <div>
          <dt>BEST LAP</dt>
          <dd>{result.playerBestLapMs != null ? formatRaceTime(result.playerBestLapMs) : '--:--.---'}</dd>
        </div>
        <div>
          <dt>COINS</dt>
          <dd>+{PLACEHOLDER_COINS}</dd>
        </div>
      </dl>

      {result.lapTimesMs.length > 0 && (
        <ol className="lap-list" aria-label="Lap times">
          {result.lapTimesMs.map((ms, i) => (
            <li key={i}>
              <span>LAP {i + 1}</span>
              <span>{formatRaceTime(ms)}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="results-actions">
        <NeonButton onClick={retry}>RETRY</NeonButton>
        <NeonButton variant="ghost" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'track' })}>TRACK SELECT</NeonButton>
        <NeonButton variant="ghost" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'menu' })}>MAIN MENU</NeonButton>
      </div>

      <small className="muted">Coins are still a placeholder value.</small>
    </section>
  );
}