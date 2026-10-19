import { useEffect, useMemo } from 'react';
import { GameCanvas } from '../components/GameCanvas';
import { NeonButton } from '../components/NeonButton';
import { ResultsPage } from './ResultsPage';
import { isTimeTrialMode } from '../data/gameModes';
import { getDifficulty } from '../game/config/difficulty';
import type { RaceBridge, RaceResult } from '../game/bridge';
import { useKeyPress } from '../hooks/useKeyPress';
import { useRouter } from '../router/RouterProvider';
import { resetReferenceData } from '../services/backend';
import { loadProfile } from '../services/profile';
import { submitRaceResult } from '../services/raceSubmission';
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
  /** The result being displayed, once a race has finished. */
  const result = state.lastResult;
  // Time Trial runs a solo grid, so the on-screen key hints must not promise a
  // leaderboard or a position that does not exist.
  const solo = isTimeTrialMode(mode?.id);
  const difficultyName = getDifficulty(state.selectedDifficultyId).name;

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
        difficultyId: state.selectedDifficultyId,
      },
      onRaceComplete: (result) => {
        dispatch({ type: 'RACE_FINISHED', result });
        // Replace rather than push: the race that just ended is the current
        // page, so backing out of the results should not re-enter it.
        navigate('results', { replace: true });

        // Submit from the Phaser callback rather than a useEffect on the result.
        // StrictMode double-invokes effects in development, and the results
        // overlay mounts and unmounts as the player navigates; either would put
        // a second copy of this in flight. The callback fires once per race, and
        // `submitRaceResult` dedupes on a fingerprint regardless.
        void submitAndTrack(character.id, character.name, car.id, track.id, result);
      },
    };
  }, [state.raceKey, state.selectedDifficultyId, character, car, track, mode, dispatch, navigate]);

  /**
   * Submits the result and records the outcome in the store.
   *
   * Defined inside the component so it closes over the current selections, and
   * passed into the memoised bridge. The store is updated for every outcome so
   * the results screen can tell the player whether their time was actually
   * stored -- the difference between "here is your lap time" and "here is your
   * lap time, saved".
   */
  async function submitAndTrack(
    characterId: string,
    characterName: string,
    carId: string,
    trackId: string,
    result: RaceResult,
  ): Promise<void> {
    // Racing does not require an account, but recording the result does.
    // Signed out, the race is still raced and still shown in full -- it simply
    // is not saved, and the results screen says so rather than implying
    // otherwise.
    const profile = await loadProfile();
    if (!profile) {
      dispatch({
        type: 'RACE_SAVE_FAILED',
        message: 'Sign in to save race results.',
        // Retrying without signing in would fail identically. Signing in is the
        // action that helps, and it is a separate button on the menu.
        retryable: false,
      });
      return;
    }

    dispatch({ type: 'RACE_SAVE_STARTED' });

    const outcome = await submitRaceResult({
      playerId: profile.id,
      characterId,
      characterName,
      carId,
      trackId,
      result,
    });

    switch (outcome.status) {
      case 'saved':
        dispatch({ type: 'RACE_SAVE_SUCCEEDED', raceId: outcome.raceId });
        // The catalogue and player lists are now stale by one row.
        resetReferenceData();
        return;
      case 'already-saved':
        // A duplicate was suppressed. Report success rather than alarming the
        // player with an error for something that worked.
        dispatch({ type: 'RACE_SAVE_SUCCEEDED', raceId: outcome.raceId ?? '' });
        return;
      case 'skipped':
        dispatch({ type: 'RACE_SAVE_SKIPPED', reason: outcome.reason });
        return;
      case 'failed':
        dispatch({
          type: 'RACE_SAVE_FAILED',
          message: outcome.message,
          retryable: outcome.retryable,
        });
        return;
    }
  }

  /**
   * Re-sends the last result after a failure.
   *
   * Safe to press repeatedly: `submitRaceResult` drops a fingerprint it has
   * already confirmed, so pressing RETRY on a result that did land is a no-op
   * rather than a duplicate row.
   */
  const retrySave = () => {
    if (!character || !car || !track || !result) return;
    void submitAndTrack(character.id, character.name, car.id, track.id, result);
  };

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
            <span className="race-mode-label">{solo ? 'TIME TRIAL' : `DIFFICULTY · ${difficultyName.toUpperCase()}`}</span>
            <span>W / ↑ accelerate</span><span>S / ↓ brake · reverse</span><span>A D / ← → steer</span><span>SHIFT / SPACE nitro</span><span>C camera</span><span>P pause</span><span>M audio</span><span>R restart</span><span>ESC quit</span>
          </footer>
        </>
      )}
      {resultsVisible && <ResultsPage onRetrySave={retrySave} />}
    </section>
  );
}