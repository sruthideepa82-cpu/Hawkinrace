/**
 * Backend glue that keeps the game's local data tables authoritative for
 * gameplay while using the database for persistence.
 *
 * The frontend identifies cars/tracks/drivers with stable string ids because
 * Phaser tuning is keyed on them. The backend uses numeric ids. This module
 * bridges the two by matching on name (case-insensitively) once per session,
 * then caches the reference data so race saves and the leaderboard do not
 * re-fetch on every call.
 */

import {
  getCars,
  getPlayers,
  getTracks,
  saveRaceResult,
  type BackendCar,
  type BackendPlayer,
  type BackendTrack,
} from './api';

export interface ReferenceData {
  players: BackendPlayer[];
  cars: BackendCar[];
  tracks: BackendTrack[];
}

let referencePromise: Promise<ReferenceData> | null = null;

/**
 * Fetch players, cars and tracks once and share the promise. A failed load is
 * not cached, so the next caller can retry (e.g. after starting the backend).
 */
export function loadReferenceData(): Promise<ReferenceData> {
  if (!referencePromise) {
    referencePromise = Promise.all([getPlayers(), getCars(), getTracks()]).then(
      ([players, cars, tracks]) => ({ players, cars, tracks }),
    );
    referencePromise.catch(() => {
      referencePromise = null;
    });
  }
  return referencePromise;
}

/** Drop the cache so the next call re-fetches. */
export function resetReferenceData(): void {
  referencePromise = null;
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export interface CompletedRace {
  /** Driver (character) name as shown in the game, e.g. "STEVE". */
  characterName: string;
  /** Car name as shown in the game, e.g. "FALCON GT". */
  carName: string;
  /** Track name as shown in the game, e.g. "HAWKINS STREETS". */
  trackName: string;
  totalTimeMs: number;
  bestLapTimeMs: number | null;
  position: number;
  lapsCompleted: number;
}

/**
 * Persist a finished race. Best-effort: if the backend is unreachable or the
 * reference data does not match, the race is logged and skipped rather than
 * breaking the results screen.
 */
export async function saveCompletedRace(race: CompletedRace): Promise<boolean> {
  try {
    const { players, cars, tracks } = await loadReferenceData();

    const player = players.find((p) => sameName(p.username, race.characterName));
    const car = cars.find((c) => sameName(c.name, race.carName));
    const track = tracks.find((t) => sameName(t.name, race.trackName));

    if (!player || !car || !track) {
      console.warn('[backend] Skipping save: no matching player/car/track', {
        characterName: race.characterName,
        carName: race.carName,
        trackName: race.trackName,
      });
      return false;
    }

    await saveRaceResult({
      playerId: player.id,
      carId: car.id,
      trackId: track.id,
      totalTime: race.totalTimeMs / 1000,
      bestLapTime: race.bestLapTimeMs === null ? null : race.bestLapTimeMs / 1000,
      position: race.position,
      lapsCompleted: race.lapsCompleted,
    });
    return true;
  } catch (error) {
    console.warn('[backend] Could not save race result:', error);
    return false;
  }
}
