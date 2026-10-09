import { useEffect, useMemo } from 'react';
import { GameCanvas } from '../components/GameCanvas';
import { NeonButton } from '../components/NeonButton';
import { ResultsPage } from './ResultsPage';
import type { RaceBridge } from '../game/bridge';
import { useKeyPress } from '../hooks/useKeyPress';
import { useRouter } from '../router/RouterProvider';
import { saveCompletedRace } from '../services/backend';
import { isRaceReady, useGameStore } from '../store/GameStore';

/**
 * The race page, and the results overlay drawn on top of it.
 *
 * Both the `/race` and `/results` routes render this one component (see
 * `CurrentScreen` in App). Because it is the same component instance across
 * those two routes, the Phaser game underneath survives the transition: the
 * finished race stays on screen behind the results pane instead of being torn
 * down and replaced with a new one. That is what stops the race from visibly
 * restarting itself the moment the player takes the chequered flag.
 *
 * `showResults` only controls the overlay, never the mount.
 */
export function RacePage({ showResults = false }: { showResults?: boolean }) {
  const { state, dispatch, selections } = useGameStore();
  const { screen, navigate } = useRouter();
  const { character, car, track, mode } = selections;
  const ready = isRaceReady(state);

  // Rebuilt whenever a new race starts, or whenever a selection changes.
  //
  // `raceKey` is what makes RETRY a fresh race. The selections are included
  // because the URL can now reach this page again from the back button after
  // the driver or car was changed, and the game must race what is actually
  // selected now rather than what was selected when the page was first built.
  // They come from static data tables, so the references are stable and this
  // does not re-fire on every render.
  const bridge = useMemo<RaceBridge | null>(() => {
    if (!character || !car || !track || !mode) return null;
    return {
      config: {
        characterId: character.id,
        characterName: character.name,
        car: {
          id: car.id,
          name: car.name,
          color: car.color,
          stats: { speed: car.stats.speed, acceleration: car.stats.acceleration, handling: car.stats.handling },
        },
        trackId: track.id,
        modeId: mode.id,
      },
      onRaceComplete: (result) => {
        dispatch({ type: 'RACE_FINISHED', result });
        // Replace rather than push: the race that just ended is the current
        // page, so backing out of the results should not re-enter it.
        navigate('results', { replace: true });

        // Persist finished races to the backend. Best-effort and non-blocking:
        // the results screen never waits on the network, and a failed save is
        // logged rather than shown. Failed races are not recorded.
        if (result.outcome === 'finished') {
          void saveCompletedRace({
            characterName: character.name,
            carName: car.name,
            trackName: track.name,
            totalTimeMs: result.timeMs,
            bestLapTimeMs: result.playerBestLapMs,
            position: result.playerPosition,
            lapsCompleted: result.lapsCompleted,
          });
        }
      },
    };
  }, [state.raceKey, character, car, track, mode, dispatch, navigate]);

  const quit = () => navigate('menu');
  useKeyPress('Escape', quit);

  // Nothing to race without all four selections, so a direct link to this
  // route (or a stale one) goes back to the menu rather than showing a black
  // canvas.
  useEffect(() => {
    if (!ready) navigate('menu', { replace: true });
  }, [ready, navigate]);

  if (!bridge) return null;
  const resultsVisible = showResults && screen === 'results';

  return (
    <section className="race-page">
      <GameCanvas bridge={bridge} />
      {!resultsVisible && (
        <>
          <NeonButton variant="ghost" className="quit-btn" onClick={quit}>✕ QUIT</NeonButton>
          <footer className="race-hints">
            <span>W / ↑ accelerate</span><span>S / ↓ brake · reverse</span><span>A D / ← → steer</span><span>SHIFT nitro</span><span>C camera</span><span>R restart</span><span>ESC quit</span>
          </footer>
        </>
      )}
      {resultsVisible && <ResultsPage />}
    </section>
  );
}