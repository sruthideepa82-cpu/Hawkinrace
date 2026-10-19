/**
 * Catalogue loading.
 *
 * Cars and tracks are fetched once per session and shared, so the selection
 * screens do not each re-request them and a slow backend is paid for once.
 *
 * Both are public reference data and need no token, so the selection screens
 * work whether or not anyone is signed in.
 *
 * Player identity lives in `profile.ts` and race submission in
 * `raceSubmission.ts`. They used to live here too, which meant three places
 * could disagree about who the player was.
 */

import { getCars, getTracks, type BackendCar, type BackendTrack } from './api';

export interface ReferenceData {
  cars: BackendCar[];
  tracks: BackendTrack[];
}

let referencePromise: Promise<ReferenceData> | null = null;

/**
 * Fetch the catalogue once and share the promise.
 *
 * Players are not included: there is no public listing of them, which is the
 * point of Phase 7. The signed-in player comes from `profile.ts`.
 *
 * A failed load is not cached, so the next caller can retry -- which is what
 * makes "start the backend, then reload the page" work without a hack.
 */
export function loadReferenceData(): Promise<ReferenceData> {
  if (!referencePromise) {
    referencePromise = Promise.all([getCars(), getTracks()]).then(
      ([cars, tracks]) => ({ cars, tracks }),
    );
    referencePromise.catch(() => {
      referencePromise = null;
    });
  }
  return referencePromise;
}

/**
 * Drop the cache so the next call re-fetches.
 *
 * Called after a race is saved, so the leaderboard and the player list reflect
 * the row that was just written rather than whatever was there on page load.
 */
export function resetReferenceData(): void {
  referencePromise = null;
}