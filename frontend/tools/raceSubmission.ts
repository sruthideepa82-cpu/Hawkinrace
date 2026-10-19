/**
 * Verification of race submission: payload building and duplicate suppression.
 *
 * This is the part of the integration most able to cause real damage in two
 * opposite directions -- storing nothing when it should have, or storing the
 * same race twice. Both are silent: the results screen looks identical either
 * way, so they are proven here rather than eyeballed in a browser.
 *
 * One of these checks exists because of a real bug. `RaceSession` reports
 * `playerPosition` as 0 for a Time Trial, and Phase 4 submitted that verbatim,
 * so the backend rejected every single Time Trial with a 400 and the time was
 * lost without a trace. The position mapping below is the fix, and the test
 * pins it.
 *
 * Run with:
 *   node --experimental-transform-types --no-warnings --import ./tools/register.mjs \
 *     tools/raceSubmission.ts
 */
import {
  buildRacePayload,
  finishingPositionFor,
  hasSubmitted,
  raceFingerprint,
  resetSubmissionState,
  submitRaceResult,
  type RaceSubmissionInput,
} from '../src/services/raceSubmission';
import { ApiRequestError } from '../src/services/api';
import type { RaceResult } from '../src/game/bridge';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  checks++;
  if (ok) console.log(`  PASS  ${label}`);
  else { failures++; console.log(`  FAIL  ${label}${detail ? ` -> ${detail}` : ''}`); }
}

/** A finished Quick Race, which is the ordinary case. */
function quickRace(overrides: Partial<RaceResult> = {}): RaceResult {
  return {
    outcome: 'finished',
    failureReason: null,
    mode: 'quick-race',
    stars: 2,
    timeMs: 134_883,
    lapTimesMs: [44_321, 45_100, 45_462],
    lapsCompleted: 3,
    totalLaps: 3,
    standings: [],
    playerPosition: 2,
    playerBestLapMs: 44_321,
    aiFinishedCount: 1,
    ...overrides,
  };
}

/** A finished Time Trial. `playerPosition` is 0 by design -- there is no field. */
function timeTrial(overrides: Partial<RaceResult> = {}): RaceResult {
  return {
    ...quickRace(),
    mode: 'time-trial',
    playerPosition: 0,
    ...overrides,
  };
}

function input(overrides: Partial<RaceSubmissionInput> = {}): RaceSubmissionInput {
  return {
    playerId: 'plr_abc12345',
    characterId: 'mike',
    characterName: 'MIKE',
    carId: 'apex-vulcan',
    trackId: 'hawkins-streets',
    result: quickRace(),
    ...overrides,
  };
}

/** A save that always succeeds, counting how many times it was actually called. */
function countingSave() {
  const calls: unknown[] = [];
  return {
    calls,
    deps: {
      save: async (payload: unknown) => {
        calls.push(payload);
        return { id: `race_${calls.length}` };
      },
    },
  };
}

function failingWith(status: number) {
  const calls: unknown[] = [];
  return {
    calls,
    deps: {
      save: async (payload: unknown) => {
        calls.push(payload);
        throw new ApiRequestError(status, `simulated ${status}`, {}, 'test');
      },
    },
  };
}

console.log('\n[submission] the finishing position sent for each mode');

// A Quick Race has a real classification, so the game's own number is correct.
check('a Quick Race keeps its real finishing position',
  finishingPositionFor(quickRace({ playerPosition: 2 })) === 2);

// The bug: a solo run has no classification, so the game reports 0, and the
// backend requires >= 1. This is what silently lost every Time Trial.
check('a Time Trial reports position 1, not the 0 the game produces',
  finishingPositionFor(timeTrial({ playerPosition: 0 })) === 1,
  `got ${finishingPositionFor(timeTrial())}`);
check('a Time Trial even if the game someday reports a position',
  finishingPositionFor({ ...timeTrial(), playerPosition: 1 }) === 1);

console.log('\n[submission] payload built from real game state');
const built = buildRacePayload(input());
check('a finished Quick Race is accepted', 'payload' in built);
if ('payload' in built) {
  check('car id is the game literal', built.payload.carId === 'apex-vulcan', built.payload.carId);
  check('track id is the game literal', built.payload.trackId === 'hawkins-streets', built.payload.trackId);
  // Deliberately absent: the player comes from the session token, not the body.
  // Sending a playerId would be sending a claim about who is racing, which is
  // exactly what authentication removes.
  check('the payload carries no playerId', !('playerId' in built.payload));
  // Milliseconds, matching both the game and the backend. Dividing by 1000 here
  // is the mistake that would put a 0.1s "time" on the board.
  check('elapsed time is milliseconds, not seconds', built.payload.elapsedTimeMs === 134_883,
    String(built.payload.elapsedTimeMs));
  check('best lap is milliseconds', built.payload.bestLapTimeMs === 44_321);
  check('position is the real finishing slot', built.payload.position === 2);
  check('laps completed is carried over', built.payload.lapsCompleted === 3);
}

const solo = buildRacePayload(input({ result: timeTrial() }));
check('a Time Trial is accepted', 'payload' in solo);
if ('payload' in solo) {
  check('a Time Trial submits position 1', solo.payload.position === 1, String(solo.payload.position));
}

console.log('\n[submission] results that must never be sent');
function refuses(label: string, override: Partial<RaceSubmissionInput>): void {
  const result = buildRacePayload(input(override));
  check(label, 'problem' in result, 'was accepted but should not have been');
}
refuses('a failed race is refused', { result: quickRace({ outcome: 'failed', failureReason: 'collision' }) });
refuses('a non-positive elapsed time is refused', { result: quickRace({ timeMs: 0 }) });
refuses('zero laps is refused', { result: quickRace({ lapsCompleted: 0 }) });
refuses('a best lap longer than the race is refused', {
  result: quickRace({ timeMs: 100_000, playerBestLapMs: 150_000 }),
});
refuses('a missing player is refused', { playerId: '' });
refuses('a missing car is refused', { carId: '' });
refuses('a missing track is refused', { trackId: '' });

const noLap = buildRacePayload(input({ result: quickRace({ playerBestLapMs: null }) }));
check('a null best lap is allowed (the backend column is nullable)',
  'payload' in noLap && noLap.payload.bestLapTimeMs === null);

console.log('\n[submission] fingerprints identify one specific race');
const a = raceFingerprint(input());
const b = raceFingerprint(input());
check('the same race fingerprints identically', a === b);
check('a different time is a different race',
  a !== raceFingerprint(input({ result: quickRace({ timeMs: 134_884 }) })));
check('a different track is a different race',
  a !== raceFingerprint(input({ trackId: 'upside-down' })));
check('a different player is a different race',
  a !== raceFingerprint(input({ playerId: 'plr_other' })));
check('a different mode is a different race',
  a !== raceFingerprint(input({ result: timeTrial() })));

console.log('\n[submission] a race is submitted exactly once');

resetSubmissionState();
{
  const save = countingSave();
  const outcome = await submitRaceResult(input(), save.deps);
  check('the first submission succeeds', outcome.status === 'saved', outcome.status);
  check('exactly one request was made', save.calls.length === 1, String(save.calls.length));
}

resetSubmissionState();
{
  const save = countingSave();
  // Two callers arriving before the first resolves: a React rerender, the
  // results overlay remounting, StrictMode in development.
  const [first, second] = await Promise.all([
    submitRaceResult(input(), save.deps),
    submitRaceResult(input(), save.deps),
  ]);
  check('concurrent submissions send ONE request', save.calls.length === 1, String(save.calls.length));
  check('both callers see success', first.status === 'saved' && second.status === 'saved',
    `${first.status}/${second.status}`);
  check('both callers see the same race id',
    first.status === 'saved' && second.status === 'saved' && first.raceId === second.raceId);
}

resetSubmissionState();
{
  const save = countingSave();
  await submitRaceResult(input(), save.deps);
  // A later duplicate, e.g. RETRY pressed after success.
  const again = await submitRaceResult(input(), save.deps);
  check('a sequential duplicate is suppressed', again.status === 'already-saved', again.status);
  check('still only one request total', save.calls.length === 1, String(save.calls.length));
  check('the suppressed duplicate reports the original race id',
    again.status === 'already-saved' && again.raceId === 'race_1', String((again as { raceId?: string }).raceId));
  check('hasSubmitted reports the confirmed fingerprint',
    hasSubmitted(raceFingerprint(input())));
}

resetSubmissionState();
{
  // Five separate races, as in a real session: all must be stored.
  const save = countingSave();
  for (let i = 0; i < 5; i++) {
    await submitRaceResult(input({ result: quickRace({ timeMs: 130_000 + i }) }), save.deps);
  }
  check('five distinct races produce five requests', save.calls.length === 5, String(save.calls.length));
}

console.log('\n[submission] failures are reported, not swallowed');

resetSubmissionState();
{
  // The backend is down.
  const save = failingWith(0);
  const outcome = await submitRaceResult(input(), save.deps);
  check('an offline failure is reported as failed', outcome.status === 'failed', outcome.status);
  check('an offline failure is marked retryable',
    outcome.status === 'failed' && outcome.retryable === true);
}

resetSubmissionState();
{
  // Reconnect: the same request should now succeed.
  let attempt = 0;
  const deps = {
    save: async () => {
      attempt++;
      if (attempt === 1) throw new ApiRequestError(0, 'Cannot reach the backend', {}, 'test');
      return { id: 'race_after_retry' };
    },
  };
  const first = await submitRaceResult(input(), deps);
  check('the first attempt fails', first.status === 'failed', first.status);
  const retry = await submitRaceResult(input(), deps);
  check('RETRY after a failure succeeds', retry.status === 'saved', retry.status);
  check('the retry produced the real race id',
    retry.status === 'saved' && retry.raceId === 'race_after_retry');
  check('exactly two attempts were made', attempt === 2, String(attempt));
}

resetSubmissionState();
{
  // The server rejected the data. Retrying unchanged can never help.
  const save = failingWith(400);
  const outcome = await submitRaceResult(input(), save.deps);
  check('a 400 is reported as failed', outcome.status === 'failed', outcome.status);
  check('a 400 is NOT retryable, so no pointless button is offered',
    outcome.status === 'failed' && outcome.retryable === false);
  check('a 400 was not recorded as submitted',
    !hasSubmitted(raceFingerprint(input())));
  // And because it was not recorded, a corrected retry is still possible.
  const retry = await submitRaceResult(input(), countingSave().deps);
  check('a fresh attempt after a 400 is not blocked by the dedupe', retry.status === 'saved', retry.status);
}

resetSubmissionState();
{
  // A race the game decided is not a result is not a submission failure.
  const save = countingSave();
  const outcome = await submitRaceResult(
    input({ result: quickRace({ outcome: 'failed', failureReason: 'collision' }) }),
    save.deps,
  );
  check('an unfinished race is skipped, not failed', outcome.status === 'skipped', outcome.status);
  check('the reason is carried through for display',
    outcome.status === 'skipped' && outcome.reason.includes('did not finish'), outcome.status);
  check('nothing was sent for it', save.calls.length === 0, String(save.calls.length));
}

resetSubmissionState();
console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.log('\nSOME CHECKS FAILED');
  process.exit(1);
}