/**
 * Player identity.
 *
 * The single place that knows "which player is this browser". Both the race
 * submission path and the profile UI go through here, so there is exactly one
 * implementation of find-or-create rather than one per caller.
 *
 * ## No authentication
 *
 * The stored id is a *pointer*, not proof of identity. It lives in localStorage,
 * which anyone with access to the browser can read and edit, and the API accepts
 * a race submitted for any player id at all.
 *
 * So this is the honest version of "remember me" for a game with no accounts:
 * it remembers who you picked so your races land in one place, and it stops
 * nothing. Authentication is a later phase. Nothing in the UI should imply
 * otherwise, and no record derived from this should be presented as verified.
 */

import {
  ApiRequestError,
  createPlayer,
  getPlayer,
  getPlayers,
  updatePlayer,
  type BackendPlayer,
} from './api';

/** localStorage key. Namespaced so it cannot collide with `bestRun.ts`. */
const STORAGE_KEY = 'hawkins.nitroRun.playerId';

function readStoredId(): string | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw && raw.length > 0 ? raw : null;
  } catch {
    // Private browsing, or storage disabled entirely. The game still plays; it
    // just creates a fresh profile each session.
    return null;
  }
}

function writeStoredId(id: string | null): void {
  try {
    if (id === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // A failed write must never break gameplay. The profile simply will not
    // survive the session.
  }
}

/** Session cache, so a page full of components does not re-fetch per render. */
let cached: BackendPlayer | null = null;

/** The id this browser has been using, without contacting the API. */
export function getStoredPlayerId(): string | null {
  return cached?.id ?? readStoredId();
}

/** Forgets the profile. Used by tests and by a future "sign out". */
export function clearProfile(): void {
  cached = null;
  writeStoredId(null);
}

function remember(player: BackendPlayer): BackendPlayer {
  cached = player;
  writeStoredId(player.id);
  return player;
}

/**
 * Loads the stored profile from the backend.
 *
 * @returns the profile, or null when there is none, the stored id has expired
 *          (the server was reset), or the backend is unreachable.
 *
 * A 404 clears the stored id: the profile genuinely no longer exists, and
 * leaving it behind would make every later call 404 for the rest of the session.
 * An offline failure is treated differently -- the id is kept, because the
 * profile is probably still there and the network is what is missing.
 */
export async function loadProfile(): Promise<BackendPlayer | null> {
  const id = readStoredId();
  if (!id) return null;

  try {
    return remember(await getPlayer(id));
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      clearProfile();
      return null;
    }
    if (error instanceof ApiRequestError && error.isOffline) {
      // Keep the id. The game must remain playable with no backend, and
      // clearing on a transient network blip would lose the player's history.
      return null;
    }
    console.warn('[profile] could not load the stored profile:', error);
    return null;
  }
}

/** The cached profile, if one was loaded or created this session. */
export function peekProfile(): BackendPlayer | null {
  return cached;
}

/**
 * Shares one in-flight load across every caller.
 *
 * Without this, each component that asks for the profile on mount fires its own
 * request, so opening the app with three such components sends three identical
 * GETs. Mirrors the same pattern as `loadReferenceData`.
 */
let loadPromise: Promise<BackendPlayer | null> | null = null;

export function loadProfileOnce(): Promise<BackendPlayer | null> {
  if (!loadPromise) {
    loadPromise = loadProfile().finally(() => {
      loadPromise = null;
    });
  }
  return loadPromise;
}

/**
 * Returns this browser's profile, creating it if there is not one yet.
 *
 * Find-or-create by display name, so choosing the same driver twice reuses the
 * same profile and its history rather than accumulating duplicates.
 *
 * @param displayName    3-24 characters matching the backend's rule.
 * @param selectedCarId  set on creation when supplied.
 */
export async function ensureProfile(
  displayName: string,
  selectedCarId: string | null = null,
): Promise<BackendPlayer | null> {
  const existing = cached ?? (await loadProfile());
  if (existing && existing.displayName === displayName) {
    return selectedCarId && existing.selectedCarId !== selectedCarId
      ? syncSelectedCar(selectedCarId)
      : existing;
  }

  try {
    return remember(
      await createPlayer({
        displayName,
        ...(selectedCarId ? { selectedCarId } : {}),
      }),
    );
  } catch (error) {
    // 409 means a profile with that name already exists -- another tab, or a
    // previous session whose stored id was cleared. Adopt it rather than
    // failing, which is what makes the flow idempotent.
    if (error instanceof ApiRequestError && error.status === 409) {
      const players = await getPlayers();
      const match = players.find((p) => p.displayName === displayName);
      if (match) return remember(match);
    }
    console.warn('[profile] could not create a profile:', error);
    return null;
  }
}

/**
 * Persists the player's car choice.
 *
 * Fire-and-forget from the caller's point of view: a failure here costs a
 * cosmetic nicety (the selection reverts on the next visit), so it must never
 * interrupt the selection flow.
 */
export async function syncSelectedCar(carId: string): Promise<BackendPlayer | null> {
  const current = cached ?? (await loadProfile());
  if (!current) return null;

  try {
    return remember(
      await updatePlayer(current.id, {
        displayName: current.displayName,
        selectedCarId: carId,
      }),
    );
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      // The profile was deleted server-side. Forget it so the next selection
      // creates a fresh one instead of failing the same way forever.
      clearProfile();
      return null;
    }
    console.warn('[profile] could not save the selected car:', error);
    return null;
  }
}