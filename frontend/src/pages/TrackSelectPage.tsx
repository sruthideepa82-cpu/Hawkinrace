import { ScreenFrame } from '../components/ScreenFrame';
import { SelectCard } from '../components/SelectCard';
import { TrackPreview } from '../components/TrackPreview';
import { TRACKS } from '../data/tracks';
import { formatRaceTime } from '../game/utils/geometry';
import { useGameStore } from '../store/GameStore';

export function TrackSelectPage() {
  const { state, dispatch } = useGameStore();
  return (
    <ScreenFrame
      step={3}
      title="CHOOSE YOUR TRACK"
      onBack={() => dispatch({ type: 'NAVIGATE', screen: 'car' })}
      onContinue={() => dispatch({ type: 'NAVIGATE', screen: 'mode' })}
      continueDisabled={!state.selectedTrackId}
    >
      <div className="card-grid tracks">
        {TRACKS.map((t) => (
          <SelectCard key={t.id} selected={state.selectedTrackId === t.id} unavailableLabel={t.playable ? undefined : 'LOCKED'} onSelect={() => dispatch({ type: 'SELECT_TRACK', id: t.id })}>
            <TrackPreview trackId={t.id} />
            <h3 className="card-title">{t.name}</h3>
            <p className="card-blurb">{t.description}</p>
            <dl className="facts">
              <div><dt>DIFFICULTY</dt><dd>{t.difficulty}</dd></div>
              <div><dt>WEATHER</dt><dd>{t.weather}</dd></div>
              <div><dt>BEST TIME</dt><dd>{t.bestTimeMs === null ? '--:--.---' : formatRaceTime(t.bestTimeMs)}</dd></div>
            </dl>
          </SelectCard>
        ))}
      </div>
    </ScreenFrame>
  );
}
