/**
 * Submitting a finished race.
 *
 * Sits between the game's own result and the API, and owns three things that are
 * easy to get wrong and expensive to debug once they are:
 *
 *  1. **Building a valid payload.** The shape the backend accepts, from the
 *     shape the game produces. They are not the same, and the differences are
 *     documented where they appear rather than left to be rediscovered.
 *  2. **Submitting exactly once.** React re-renders, the results overlay mounts
 *     and unmounts, StrictMode double-invokes effects in development, and the
 *     player can mash RETRY. None of those should produce two rows.
 *  3. **Not throwing away a result that failed to save.** A failed write is
 *     reported, kept and retryable -- never swallowed, and never retried so
 *     eagerly that it becomes a duplicate.
 */

import { ApiRequestError, saveRaceResult, type RaceSubmission } from './api';
import type { RaceResult } from '../game/bridge';

export interface RaceSubmissionInput {
  /** The backend player id. Nothing is submitted without one. */
  playerId: string;
  /** Driver id from the game, used only to build a stable fingerprint. */
  characterId: string;
  /** Shown name, used only in the fingerprint and logs. */
  characterName: string;
  carId: string;
  trackId: string;
  /** The finished race, exactly as Phaser produced it. */
  result: RaceResult;
}

export type SubmissionOutcome =
  /** The backend confirmed the row exists. */
  | { status: 'saved'; raceId: string }
  /** Already submitted under this fingerprint; not sent again. */
  | { status: 'already-saved'; raceId: string | null }
  /** Refused locally: the result is not something worth recording. */
  | { status: 'skipped'; reason: string }
  /** The backend refused it, or was unreachable. Retryable when marked. */
  | { status: 'failed'; message: string; retryable: boolean };

/** Injected for tests. Defaults to the real API. */
export interface SubmissionDeps {
  save: (payload: RaceSubmission, idempotencyKey?: string) => Promise<{ id: string }>;
}

const defaultDeps: SubmissionDeps = {
  save: async (payload, idempotencyKey) => {
    const response = await saveRaceResult(payload, idempotencyKey);
    return { id: response.id };
  },
};

/**
 * Turns a fingerprint into the `Idempotency-Key` sent to the server.
 *
 * <p>A truncated SHA-256 of the fingerprint, because the column is bounded to 36
 * characters and a raw fingerprint is far longer.
 *
 * <p>Deterministic on purpose: the same race always produces the same key, so a
 * retry -- including one after a page reload -- is recognised by the server as a
 * replay instead of adding a second row. That is the server-side half of the
 * duplicate protection; the in-flight map below is the client-side half.
 *
 * <p>Without WebCrypto the key is simply not sent and the client-side dedupe
 * still applies. That degrades to Phase 6 behaviour rather than breaking.
 */
async function idempotencyKeyFor(fingerprint: string): Promise<string | undefined> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return undefined;
  try {
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(fingerprint));
    return [...new Uint8Array(digest)]
      .slice(0, 16)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return undefined;
  }
}

/**
 * A stable identity for one specific completed race.
 *
 * Two submissions sharing a fingerprint are the same race, so this is what makes
 * double-submission detectable. `timeMs` is the discriminator that matters: two
 * genuinely separate runs of the same track produce different elapsed times, so
 * they never collide, while the same run submitted twice does.
 */
export function raceFingerprint(input: RaceSubmissionInput): string {
  const { playerId, carId, trackId, result } = input;
  return [
    playerId,
    carId,
    trackId,
    result.mode,
    result.timeMs,
    result.lapsCompleted,
    result.playerPosition,
  ].join('|');
}

/**
 * The finishing position to record.
 *
 * A Quick Race has a real classification, so the game's number is used as-is.
 *
 * A Time Trial has none: `RaceSession` deliberately reports `playerPosition` as
 * 0 because a solo run was never classified, and the results screen says as
 * much. The backend requires a position of at least 1, so submitting 0 fails
 * validation -- which is why every Time Trial result silently went unsaved.
 *
 * A solo run did finish, and nobody else finished, so 1 is what actually
 * happened and is recorded with that understanding. It is a real value, not a
 * fabricated classification: there is no second finisher to have beaten.
 */
export function finishingPositionFor(result: RaceResult): number {
  if (result.mode === 'time-trial') return 1;
  return result.playerPosition;
}

/**
 * Builds the API payload, or explains why the result should not be sent.
 *
 * Refusing locally matters: a rejected write is a round trip and a log line,
 * and an invalid record that somehow got stored would be worse than one that was
 * never attempted.
 */
export function buildRacePayload(
  input: RaceSubmissionInput,
): { payload: RaceSubmission } | { problem: string } {
  const { playerId, carId, trackId, result } = input;

  if (!playerId) return { problem: 'no player profile' };
  if (!carId) return { problem: 'no car selected' };
  if (!trackId) return { problem: 'no track selected' };

  // A failed or unfinished race is not a result. `outcome` is the game's own
  // verdict; second-guessing it here would record races the player did not finish.
  if (result.outcome !== 'finished') {
    return { problem: `race did not finish (${result.outcome})` };
  }
  if (result.timeMs <= 0) return { problem: 'elapsed time was not positive' };
  if (result.lapsCompleted <= 0) return { problem: 'no laps were completed' };

  const position = finishingPositionFor(result);
  if (position < 1) return { problem: 'no finishing position' };

  // A lap cannot be slower than the race it sits inside. The backend enforces
  // this too; catching it here avoids a guaranteed 400.
  const bestLap = result.playerBestLapMs;
  if (bestLap !== null && bestLap > result.timeMs) {
    return { problem: 'best lap was longer than the whole race' };
  }

  // No playerId: the server takes the player from the session token. Sending it
  // would be sending a claim about who is racing, which is exactly what
  // authentication exists to remove.
  return {
    payload: {
      carId,
      trackId,
      elapsedTimeMs: result.timeMs,
      bestLapTimeMs: bestLap,
      position,
      lapsCompleted: result.lapsCompleted,
    },
  };
}

/**
 * Fingerprints already submitted successfully.
 *
 * Session-scoped on purpose. A reload should allow a re-save of something the
 * player believes was lost, and persistence across sessions would silently
 * swallow legitimate attempts.
 */
const submitted = new Map<string, string>();

/**
 * Submissions currently in flight, by fingerprint.
 *
 * This is what actually stops the duplicate. Two callers arriving before the
 * first resolves get the *same promise*, so the request is issued once and both
 * observe the same outcome.
 */
const inFlight = new Map<string, Promise<SubmissionOutcome>>();

/** Test seam. Clears the duplicate-suppression state. */
export function resetSubmissionState(): void {
  submitted.clear();
  inFlight.clear();
}

/** True if this exact race has already been confirmed saved. */
export function hasSubmitted(fingerprint: string): boolean {
  return submitted.has(fingerprint);
}

export function submitRaceResult(
  input: RaceSubmissionInput,
  deps: SubmissionDeps = defaultDeps,
): Promise<SubmissionOutcome> {
  const fingerprint = raceFingerprint(input);

  // Already confirmed: do not send it again. This is what makes RETRY after a
  // success a no-op rather than a second row.
  const knownRaceId = submitted.get(fingerprint);
  if (knownRaceId !== undefined) {
    return Promise.resolve({ status: 'already-saved', raceId: knownRaceId });
  }

  // Already being sent: join the existing request instead of starting another.
  const running = inFlight.get(fingerprint);
  if (running) return running;

  const built = buildRacePayload(input);
  if ('problem' in built) {
    // Not an error: a race that was never finished is not a submission failure.
    return Promise.resolve({ status: 'skipped', reason: built.problem });
  }

  const work = (async (): Promise<SubmissionOutcome> => {
    try {
      const { id } = await deps.save(built.payload, await idempotencyKeyFor(fingerprint));
      submitted.set(fingerprint, id);
      return { status: 'saved', raceId: id };
    } catch (error) {
      if (error instanceof ApiRequestError) {
        return {
          status: 'failed',
          message: error.message,
          // Only offer RETRY when the same request could plausibly succeed.
          // A 400 would fail identically forever.
          retryable: error.isRetryable,
        };
      }
      return {
        status: 'failed',
        message: error instanceof Error ? error.message : 'unknown error',
        retryable: false,
      };
    } finally {
      // Cleared in `finally` so a failure also releases the fingerprint and can
      // be retried. Only success is remembered, via `submitted`.
      inFlight.delete(fingerprint);
    }
  })();

  inFlight.set(fingerprint, work);
  return work;
}