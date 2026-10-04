import { NeonButton } from '../components/NeonButton';
import { PLACEHOLDER_COINS, PLACEHOLDER_POSITION } from '../data/placeholders';
import { formatRaceTime } from '../game/utils/geometry';
import { useGameStore } from '../store/GameStore';

export function ResultsPage() {
  const { state, dispatch } = useGameStore();
  const result = state.lastResult;

  return (
    <section className="screen results">
      <h2 className="results-title">RACE COMPLETE</h2>
      {result ? (
        <>
          <dl className="results-grid">
            <div><dt>POSITION</dt><dd>{PLACEHOLDER_POSITION}</dd></div>
            <div><dt>TIME</dt><dd>{formatRaceTime(result.timeMs)}</dd></div>
            <div><dt>LAPS</dt><dd>{result.lapsCompleted}/{result.totalLaps}</dd></div>
            <div><dt>COINS</dt><dd>+{PLACEHOLDER_COINS}</dd></div>
          </dl>
          <ol className="lap-list" aria-label="Lap times">
            {result.lapTimesMs.map((ms, i) => (
              <li key={i}><span>LAP {i + 1}</span><span>{formatRaceTime(ms)}</span></li>
            ))}
          </ol>
        </>
      ) : (
        <p className="muted">No race data.</p>
      )}
      <div className="results-actions">
        <NeonButton onClick={() => dispatch({ type: 'START_RACE' })}>RACE AGAIN</NeonButton>
        <NeonButton variant="ghost" onClick={() => dispatch({ type: 'NAVIGATE', screen: 'menu' })}>MAIN MENU</NeonButton>
      </div>
      <small className="muted">Position and coins are temporary placeholder values.</small>
    </section>
  );
}
