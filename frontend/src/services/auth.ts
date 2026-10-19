/**
 * Sign-in, sign-up and the stored session.
 *
 * Owns the bearer token. The token lives in localStorage and is handed to
 * `api.ts`, which attaches it to every request -- so no other module has to
 * think about it.
 *
 * ## What a token here does and does not mean
 *
 * A token proves the request came from the player who signed in. It does not
 * make their lap times true: the race runs offline in the browser, so the times
 * are still whatever the client reported. The backend rejects results that are
 * impossible on their face, but a client that reports a fast, plausible time is
 * believed. The leaderboard is not cheat-proof and the app should never imply it
 * is.
 */

import {
  ApiRequestError,
  getApiToken,
  loginPlayer,
  logoutPlayer,
  registerPlayer,
  setApiToken,
  type BackendPlayer,
} from './api';

const TOKEN_KEY = 'hawkins.nitroRun.token';

export interface Credentials {
  displayName: string;
  password: string;
}

export interface Session {
  token: string;
  expiresAt: string;
  player: BackendPlayer;
}

/** Reads the stored token, ignoring anything that is not plausibly one. */
export function storedToken(): string | null {
  try {
    const raw = window.localStorage.getItem(TOKEN_KEY);
    return raw && raw.length > 20 ? raw : null;
  } catch {
    return null;
  }
}

function remember(session: Session): Session {
  setApiToken(session.token);
  try {
    window.localStorage.setItem(TOKEN_KEY, session.token);
  } catch {
    // Private browsing. The session still works for this page load; it simply
    // will not survive a reload.
  }
  return session;
}

function forget(): void {
  setApiToken(null);
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to do; the in-memory token is already cleared.
  }
}

/** Creates an account and signs in. */
export async function register(credentials: Credentials): Promise<Session> {
  return remember(await registerPlayer(credentials));
}

/** Exchanges a password for a token. */
export async function login(credentials: Credentials): Promise<Session> {
  return remember(await loginPlayer(credentials));
}

/** Revokes the token on the server, then locally. */
export async function logout(): Promise<void> {
  try {
    await logoutPlayer();
  } catch {
    // A failed sign-out must still clear the client, or the user is stuck
    // appearing signed in to themselves.
  } finally {
    forget();
  }
}

/** Restores a stored session into the client on app start. */
export function restoreSession(): string | null {
  const token = storedToken();
  setApiToken(token);
  return token;
}

/**
 * True when the error means "sign in again".
 *
 * <p>Used to decide between showing a sign-in prompt and showing a real error.
 * A 403 is deliberately not included: that means the request was understood and
 * refused, which retrying cannot fix.
 */
export function isUnauthorised(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 401;
}

export { getApiToken };