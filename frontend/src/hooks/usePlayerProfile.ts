import { useCallback, useEffect, useState } from 'react';
import { loadProfile, syncSelectedCar, clearProfile } from '../services/profile';
import { logout as endSession } from '../services/auth';
import type { BackendPlayer } from '../services/api';

/**
 * Where the session is in its lifecycle.
 *
 * `signed-out` is a normal state, not a failure: the game is playable without an
 * account, and a player who has never signed up is in exactly that state.
 * `offline` is kept apart because a backend that is not running should read as
 * "your results will not save this session", not as something being broken.
 */
export type SessionStatus = 'loading' | 'signed-in' | 'signed-out' | 'offline';

export interface PlayerProfileState {
  profile: BackendPlayer | null;
  status: SessionStatus;
}

export interface UsePlayerProfile extends PlayerProfileState {
  /** Persists the current car choice. Fire-and-forget. */
  saveSelectedCar: (carId: string) => void;
  /** Revokes the session on the server and clears it locally. */
  signOut: () => Promise<void>;
}

/**
 * The signed-in player, resolved once when the app starts.
 *
 * Every failure path resolves rather than rejects. An unreachable backend must
 * never propagate into a render, because that would take down a selection screen
 * and with it the ability to race.
 */
export function usePlayerProfile(): UsePlayerProfile {
  const [state, setState] = useState<PlayerProfileState>({ profile: null, status: 'loading' });

  useEffect(() => {
    let active = true;
    loadProfile()
      .then((profile) => {
        if (!active) return;
        setState({
          profile,
          status: profile ? 'signed-in' : navigator.onLine === false ? 'offline' : 'signed-out',
        });
      })
      .catch(() => {
        if (active) setState({ profile: null, status: 'offline' });
      });
    return () => {
      active = false;
    };
  }, []);

  const saveSelectedCar = useCallback((carId: string) => {
    // Deliberately not awaited: choosing a car must feel instant whether or not
    // the backend is there.
    void syncSelectedCar(carId).then((profile) => {
      if (profile) setState({ profile, status: 'signed-in' });
    });
  }, []);

  const signOut = useCallback(async () => {
    await endSession();
    clearProfile();
    setState({ profile: null, status: 'signed-out' });
  }, []);

  return { ...state, saveSelectedCar, signOut };
}