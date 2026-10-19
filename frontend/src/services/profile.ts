/**
 * The signed-in player, as the rest of the app sees them.
 *
 * Since Phase 7 a profile is created by signing up, not by picking a driver, so
 * this module no longer has an "ensure a profile exists" job. What remains is
 * reading the current session and keeping the selected car in step with the
 * backend.
 *
 * Driver selection is a *local* choice -- which character you drive. It is no
 * longer what identifies you to the backend, because the account is. The two are
 * independent, and pretending otherwise was the shape of the old code.
 */

import {
  ApiRequestError,
  getMe,
  updatePlayer,
  type BackendPlayer,
} from './api';
import { restoreSession } from './auth';

/** Session cache, so components do not each re-fetch the signed-in player. */
let cached: BackendPlayer | null = null;
let loadPromise: Promise<BackendPlayer | null> | null = null;

export function peekProfile(): BackendPlayer | null {
  return cached;
}

function remember(player: BackendPlayer): BackendPlayer {
  cached = player;
  return player;
}

/**
 * Loads the signed-in player.
 *
 * @returns the player, or null when signed out or the backend is unreachable.
 *
 * An unreachable backend is not an error worth propagating: the game is
 * playable signed out, and a page that threw here would take the whole menu with
 * it.
 */
export async function loadProfile(): Promise<BackendPlayer | null> {
  if (cached) return cached;
  if (!restoreSession()) return null;

  if (!loadPromise) {
    loadPromise = getMe()
      .then((player) => remember(player))
      .catch((error) => {
        if (error instanceof ApiRequestError) {
          if (error.status === 401) {
            // The stored token is no longer accepted. Drop it so the app stops
            // presenting a credential the server has already refused.
            cached = null;
          } else {
            console.warn('[profile] could not load the session:', error);
          }
        }
        return null;
      })
      .finally(() => {
        loadPromise = null;
      });
  }
  return loadPromise;
}

/** Clears the cached session. Called on sign-out. */
export function clearProfile(): void {
  cached = null;
}

/**
 * Persists the player's car choice.
 *
 * Fire-and-forget by design: choosing a car must feel instant whether or not
 * the backend is there. A failure costs a preference that will not be
 * remembered next visit, and nothing more.
 */
export async function syncSelectedCar(carId: string): Promise<BackendPlayer | null> {
  const player = cached ?? (await loadProfile());
  if (!player) return null;

  try {
    return remember(
      await updatePlayer(player.id, {
        displayName: player.displayName,
        selectedCarId: carId,
      }),
    );
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      clearProfile();
      return null;
    }
    console.warn('[profile] could not save the selected car:', error);
    return null;
  }
}