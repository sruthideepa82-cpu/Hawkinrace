import type { RaceResult, StandingEntry } from '../game/bridge';
import { NeonButton } from '../components/NeonButton';
import { formatRaceTime } from '../game/utils/geometry';
import { MAX_STARS } from '../game/systems/Challenge';
import { useRouter } from '../router/RouterProvider';
import { useGameStore, type RaceSaveState } from '../store/GameStore';
import './save-status.css';

/**
 * The challenge results overlay.
 *
 * A failed run and a completed run are two different screens, not one screen
 * with swapped words: the failure state is a stop, and the completion state is
 * a result worth looking at. `outcome` decides which is shown, so a collision
 * failure can never render the completion screen.
 *
 * The overlay also states whether the result reached the backend. Those are
 * genuinely different claims and conflating them would be the worst possible
 * failure here: a player told their time is saved, who reloads and finds it
 * gone, has no reason to try again.
 */
export function ResultsPage({ onRetrySave }: { onRetrySave?: () => void }) {
  const { state, dispatch } = useGameStore();
  const { navigate } = useRouter();
  const result = state.lastResult;

  // START_RACE bumps the raceKey, which rebuilds the Phaser game, and clearing
  // the result hides this overlay. Navigating to /race keeps the page mounted,
  // so the swap is a new game rather than a remount.
  const retry = () => {
    dispatch({ type: 'START_RACE' });
    navigate('race');
  };
  const trackSelect = () => navigate('track');
  const mainMenu = () => navigate('menu');

  if (!result) return null;

  if (result.outcome === 'failed') {
    return <ChallengeFailed result={result} onRetry={retry} onTrackSelect={trackSelect} />;
  }
  // A Time Trial ran solo: there was no field to be classified in, so the
  // screen is a different composition rather than the same one with the
  // position row deleted.
  if (result.mode === 'time-trial') {
    return (
      <TimeTrialComplete
        result={result}
        save={state.raceSave}
        onRetrySave={onRetrySave}
        onRetry={retry}
        onTrackSelect={trackSelect}
        onMainMenu={mainMenu}
      />
    );
  }
  return (
    <ChallengeCompleted
      result={result}
      save={state.raceSave}
      onRetrySave={onRetrySave}
      onRetry={retry}
      onTrackSelect={trackSelect}
      onMainMenu={mainMenu}
    />
  );
}

/**
 * Whether the finished race reached the database.
 *
 * Wording is deliberate throughout. "SAVED" appears only when the backend has
 * confirmed the row exists. A failure says it failed and offers a retry that
 * cannot create a duplicate, and a local-only result says so plainly rather than
 * being allowed to look persisted.
 *
 * `role="status"` announces the change without stealing focus: this is
 * information, not a prompt.
 */
function SaveStatus({ save, onRetrySave }: { save: RaceSaveState; onRetrySave?: () => void }) {
  if (save.status === 'idle') return null;

  if (save.status === 'saving') {
    return (
      <p className="save-status is-saving" role="status">
        SAVING TO LEADERBOARD…
      </p>
    );
  }

  if (save.status === 'saved') {
    return (
      <p className="save-status is-saved" role="status">
        ✓ SAVED TO LEADERBOARD
      </p>
    );
  }

  if (save.status === 'skipped') {
    // Not a failure: the game decided this was not a recordable result.
    return (
      <p className="save-status is-skipped" role="status">
        NOT RECORDED — {save.skippedReason}
      </p>
    );
  }

  return (
    <div className="save-status is-error" role="alert">
      <span>NOT SAVED — {save.error}</span>
      {/* Only offered when retrying could actually help. A 400 would fail the
          same way forever, and a button that cannot work is worse than none. */}
      {save.retryable && onRetrySave ? (
        <NeonButton variant="ghost" onClick={onRetrySave}>
          RETRY SAVE
        </NeonButton>
      ) : null}
    </div>
  );
}

/**
 * Time Trial completion.
 *
 * Shows the lap breakdown and the session's fastest lap, both of which are
 * recorded per lap by the same LapManager a Quick Race uses. Deliberately shows
 * no position, no stars-by-position and no finishing order: none of those
 * existed. The star rating is kept because it is derived purely from the total
 * time, which a solo run really does earn.
 */
function TimeTrialComplete({
  result,
  save,
  onRetrySave,
  onRetry,
  onTrackSelect,
  onMainMenu,
}: {
  result: RaceResult;
  save: RaceSaveState;
  onRetrySave?: () => void;
  onRetry: () => void;
  onTrackSelect: () => void;
  onMainMenu: () => void;
}) {
  const stars = Math.max(0, Math.min(MAX_STARS, result.stars));
  const fastest = result.playerBestLapMs;

  return (
    <div className="challenge-screen challenge-complete" aria-label="Time trial completed">
      <div className="challenge-panel">
        <p className="challenge-eyebrow">HAWKINS: NITRO RUN</p>
        <h1 className="challenge-title challenge-title-win">TIME TRIAL COMPLETE</h1>

        <div className="challenge-stars" role="img" aria-label={`${stars} of ${MAX_STARS} stars`}>
          {Array.from({ length: MAX_STARS }, (_, i) => {
            const earned = i < stars;
            return (
              <span
                key={i}
                className={`challenge-star${earned ? ' is-earned' : ''}`}
                style={earned ? { animationDelay: `${0.3 + i * 0.28}s` } : undefined}
                aria-hidden="true"
              >
                ★
              </span>
            );
          })}
        </div>

        <p className="challenge-message">{starMessage(stars)}</p>

        <div className="challenge-stats">
          <div className="challenge-stat">
            <span>LAPS</span>
            <strong>
              {result.lapsCompleted} / {result.totalLaps}
            </strong>
          </div>
          <div className="challenge-stat">
            <span>TOTAL TIME</span>
            <strong>{formatRaceTime(result.timeMs)}</strong>
          </div>
          <div className="challenge-stat">
            <span>BEST LAP</span>
            <strong>{fastest ? formatRaceTime(fastest) : '--:--.---'}</strong>
          </div>
        </div>

        {/* One row per completed lap, all of them actually driven. */}
        <div className="challenge-order">
          <h2 className="challenge-order-title">LAP TIMES</h2>
          {result.lapTimesMs.map((ms, i) => {
            const isBest = fastest !== null && ms === fastest;
            return (
              <div key={i} className={`challenge-order-row${isBest ? ' is-player' : ''}`}>
                <span className="co-pos">{String(i + 1).padStart(2, '0')}</span>
                <span className="co-name">LAP {i + 1}</span>
                <span className="co-time">{formatRaceTime(ms)}</span>
              </div>
            );
          })}
        </div>

        <SaveStatus save={save} onRetrySave={onRetrySave} />

        <div className="challenge-actions">
          <NeonButton onClick={onRetry}>RUN IT AGAIN</NeonButton>
          <NeonButton variant="ghost" onClick={onTrackSelect}>
            BACK TO TRACK SELECTION
          </NeonButton>
          <NeonButton variant="ghost" onClick={onMainMenu}>
            MAIN MENU
          </NeonButton>
        </div>
      </div>
    </div>
  );
}

/** A short, rating-appropriate line for the completion screen. */
function starMessage(stars: number): string {
  if (stars >= 3) return 'PERFECT RUN. HAWKINS IS YOURS.';
  if (stars === 2) return 'SOLID DRIVE. KEEP PUSHING.';
  return 'FINISH LINE CROSSED. TRY FOR A BETTER TIME.';
}

/**
 * Game-over scene for a failed challenge.
 *
 * Not a card: this is a full-screen composition laid over the still-mounted
 * Phaser canvas. The race is already frozen by the session (no stepping, clock
 * stopped) and the camera is slowly framing the wreck, so the live scene shows
 * through the scrim as the background. `go-*` classes are used instead of the
 * shared `challenge-*` ones so the completion screen is never affected.
 *
 * Retry and track selection are the exact handlers passed down from the results
 * page; only the presentation changed.
 */
function ChallengeFailed({
  result,
  onRetry,
  onTrackSelect,
}: {
  result: RaceResult;
  onRetry: () => void;
  onTrackSelect: () => void;
}) {
  const isCollision = result.failureReason === 'collision';
  const title = isCollision ? 'WRECKED.' : 'OUTPACED.';
  const message = isCollision
    ? "You lost control. The road isn't finished with you."
    : "They crossed the line first. The road isn't finished with you.";
  const failureValue = isCollision ? 'COLLISION' : 'OUTPACED';

  return (
    <div
      className="go-screen"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="go-title"
      // Keep clicks inside the game-over scene from reaching the canvas
      // underneath (Phaser listens on the window for some pointer events).
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="go-scrim" aria-hidden="true" />
      <div className="go-vignette" aria-hidden="true" />
      <div className="go-sweep" aria-hidden="true" />

      <div className="go-content">
        <p className="go-label">
          <span className="go-label-mark" aria-hidden="true" />
          RACE TERMINATED
        </p>

        <h1 className="go-title" id="go-title">
          {title}
        </h1>

        <p className="go-sub">{message}</p>

        <div className="go-rule" aria-hidden="true" />

        <dl className="go-meta">
          <div className="go-meta-item">
            <dt>LAP</dt>
            <dd>
              {result.lapsCompleted} / {result.totalLaps}
            </dd>
          </div>
          <div className="go-meta-item">
            <dt>RACE TIME</dt>
            <dd>{formatRaceTime(result.timeMs)}</dd>
          </div>
          <div className="go-meta-item">
            <dt>FAILURE</dt>
            <dd>{failureValue}</dd>
          </div>
        </dl>

        <div className="go-actions">
          <button type="button" className="go-btn go-btn-primary" onClick={onRetry}>
            RETRY RACE
          </button>
          <button type="button" className="go-btn go-btn-secondary" onClick={onTrackSelect}>
            CHANGE TRACK
          </button>
        </div>
      </div>
    </div>
  );
}

function ChallengeCompleted({
  result,
  save,
  onRetrySave,
  onRetry,
  onTrackSelect,
  onMainMenu,
}: {
  result: RaceResult;
  save: RaceSaveState;
  onRetrySave?: () => void;
  onRetry: () => void;
  onTrackSelect: () => void;
  onMainMenu: () => void;
}) {
  const stars = Math.max(0, Math.min(MAX_STARS, result.stars));
  const firstPlaceTime = result.standings[0]?.finishTimeMs ?? result.timeMs;

  return (
    <div className="challenge-screen challenge-complete" aria-label="Challenge completed">
      <div className="challenge-panel">
        <p className="challenge-eyebrow">HAWKINS: NITRO RUN</p>
        <h1 className="challenge-title challenge-title-win">CHALLENGE COMPLETED</h1>

        <div className="challenge-stars" role="img" aria-label={`${stars} of ${MAX_STARS} stars`}>
          {Array.from({ length: MAX_STARS }, (_, i) => {
            const earned = i < stars;
            return (
              <span
                key={i}
                className={`challenge-star${earned ? ' is-earned' : ''}`}
                style={earned ? { animationDelay: `${0.3 + i * 0.28}s` } : undefined}
                aria-hidden="true"
              >
                ★
              </span>
            );
          })}
        </div>

        <p className="challenge-message">{starMessage(stars)}</p>

        <div className="challenge-stats">
          <div className="challenge-stat">
            <span>POSITION</span>
            <strong>
              P{result.playerPosition} / {result.standings.length}
            </strong>
          </div>
          <div className="challenge-stat">
            <span>LAPS</span>
            <strong>
              {result.lapsCompleted} / {result.totalLaps}
            </strong>
          </div>
          <div className="challenge-stat">
            <span>RACE TIME</span>
            <strong>{formatRaceTime(result.timeMs)}</strong>
          </div>
          <div className="challenge-stat">
            <span>BEST LAP</span>
            <strong>{result.playerBestLapMs ? formatRaceTime(result.playerBestLapMs) : '--:--.---'}</strong>
          </div>
        </div>

        <div className="challenge-order">
          <h2 className="challenge-order-title">FINISHING ORDER</h2>
          {result.standings.map((entry: StandingEntry) => {
            const timeText = entry.finishTimeMs
              ? entry.position === 1
                ? formatRaceTime(entry.finishTimeMs)
                : `+${formatRaceTime(entry.finishTimeMs - firstPlaceTime)}`
              : 'DNF';
            return (
              <div key={entry.characterId} className={`challenge-order-row${entry.isPlayer ? ' is-player' : ''}`}>
                <span className="co-pos">{String(entry.position).padStart(2, '0')}</span>
                <span className="co-name">{entry.characterName}</span>
                <span className="co-time">{timeText}</span>
              </div>
            );
          })}
        </div>

        <SaveStatus save={save} onRetrySave={onRetrySave} />

        <div className="challenge-actions">
          <NeonButton onClick={onRetry}>RETRY CHALLENGE</NeonButton>
          <NeonButton variant="ghost" onClick={onTrackSelect}>
            BACK TO TRACK SELECTION
          </NeonButton>
          <NeonButton variant="ghost" onClick={onMainMenu}>
            MAIN MENU
          </NeonButton>
        </div>
      </div>
    </div>
  );
}
