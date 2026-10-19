/**
 * Backend glue.
 *
 * Keeps the game's own data tables authoritative for gameplay, and uses the
 * backend only for persistence. The race itself never touches the network.
 *
 * As of Phase 4 the backend uses the *same string ids* as the game
 * (`apex-vulcan`, `hawkins-streets`, `mike`), so nothing here has to match
 * records up by name. The previous version did, which meant a renamed track
 * silently stopped saving -- the failure mode this module no longer has.
 */

import {
  createPlayer,
  getCars,
  getPlayers,
  getTracks,
  saveRaceResult,
  ApiRequestError,
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

/**
 * Player id per driver, remembered for the session.
 *
 * Needed because the backend starts empty in Phase 4: there is no seeded player
 * to submit a race for, so the first save has to create a profile. Remembering
 * the id means later races reuse it instead of hitting a 409 on every finish.
 */
const playerIdByCharacter = new Map<string, string>();

/** Drop every cache so the next call re-fetches. Call after a backend restart. */
export function resetReferenceData(): void {
  referencePromise = null;
  playerIdByCharacter.clear();
}

/**
 * Find, or create, the profile a race should be recorded against.
 *
 * @returns the player id, or null when the backend cannot be reached or refuses
 *          the name.
 */
async function resolvePlayerId(characterId: string, displayName: string): Promise<string | null> {
  const cached = playerIdByCharacter.get(characterId);
  if (cached) return cached;

  try {
    const players = await getPlayers();
    const existing = players.find(
      (p) => p.displayName.trim().toLowerCase() === displayName.trim().toLowerCase(),
    );
    if (existing) {
      playerIdByCharacter.set(characterId, existing.id);
      return existing.id;
    }

    // 409 here means a concurrent tab won the race to create this profile. That
    // is fine, so re-read rather than failing the save.
    try {
      const created = await createPlayer({ displayName });
      playerIdByCharacter.set(characterId, created.id);
      return created.id;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) {
        const raced = await getPlayers();
        const winner = raced.find(
          (p) => p.displayName.trim().toLowerCase() === displayName.trim().toLowerCase(),
        );
        if (winner) {
          playerIdByCharacter.set(characterId, winner.id);
          return winner.id;
        }
      }
      throw error;
    }
  } catch (error) {
    console.warn('[backend] Could not resolve a player profile:', error);
    return null;
  }
}

export interface CompletedRace {
  /** Driver id from `src/data/characters.ts`, e.g. `mike`. */
  characterId: string;
  /** Shown name, used when a profile has to be created for this driver. */
  characterName: string;
  /** Car id from `src/data/cars.ts`, e.g. `apex-vulcan`. */
  carId: string;
  /** Track id from `src/data/tracks.ts`, e.g. `hawkins-streets`. */
  trackId: string;
  totalTimeMs: number;
  bestLapTimeMs: number | null;
  position: number;
  lapsCompleted: number;
}

/**
 * Persist a finished race.
 *
 * Strictly best-effort. If the backend is unreachable, the profile cannot be
 * created, or the record is rejected, the race is logged and skipped -- the
 * results screen must never be held up or broken by a network call.
 *
 * Times are sent in **milliseconds**, which is both the game's internal unit and
 * the backend's. The earlier version divided by 1000 on the way out, which lost
 * sub-second precision for no benefit.
 */
export async function saveCompletedRace(race: CompletedRace): Promise<boolean> {
  try {
    const playerId = await resolvePlayerId(race.characterId, race.characterName);
    if (!playerId) return false;

    await saveRaceResult({
      playerId,
      carId: race.carId,
      trackId: race.trackId,
      elapsedTimeMs: race.totalTimeMs,
      bestLapTimeMs: race.bestLapTimeMs,
      position: race.position,
      lapsCompleted: race.lapsCompleted,
    });
    return true;
  } catch (error) {
    // A 404 means our cached profile id is gone -- almost always because the
    // backend restarted and lost its in-memory store. Forget it so the next
    // race creates a fresh profile instead of failing the same way forever.
    if (error instanceof ApiRequestError && error.status === 404) {
      playerIdByCharacter.delete(race.characterId);
    }
    console.warn('[backend] Could not save race result:', error);
    return false;
  }
}