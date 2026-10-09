import { useMemo } from 'react';
import { ScreenFrame } from '../components/ScreenFrame';
import { SelectCard } from '../components/SelectCard';
import { TrackPreview } from '../components/TrackPreview';
import { TRACKS, type TrackInfo } from '../data/tracks';
import { formatRaceTime } from '../game/utils/geometry';
import { useReferenceData } from '../hooks/useReferenceData';
import { useRouter } from '../router/RouterProvider';
import type { BackendTrack } from '../services/api';
import { useGameStore } from '../store/GameStore';

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Overlay backend track facts onto the local track definitions.
 *
 * `playable` is deliberately NOT taken from the backend `locked` flag: every
 * track is currently raceable in the frontend, and switching to DB-driven
 * locking would change what the player can pick. The backend still supplies the
 * description, difficulty, weather, environment and best time. If the backend
 * has not loaded, the local track is used unchanged.
 */
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

  return (
    <ScreenFrame
      step={3}
      title="CHOOSE YOUR TRACK"
      onBack={() => navigate('car')}
      onContinue={() => navigate('mode')}
      continueDisabled={!state.selectedTrackId}
    >
      <div className="card-grid tracks">
        {tracks.map((t) => (
          <SelectCard key={t.id} selected={state.selectedTrackId === t.id} unavailableLabel={t.playable ? undefined : 'LOCKED'} onSelect={() => dispatch({ type: 'SELECT_TRACK', id: t.id })}>
            <TrackPreview trackId={t.id} />
            <h3 className="card-title">{t.name}</h3>
            <p className="card-blurb">{t.description}</p>
            <dl className="facts">
              <div><dt>ENVIRONMENT</dt><dd>{t.environment}</dd></div>
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
