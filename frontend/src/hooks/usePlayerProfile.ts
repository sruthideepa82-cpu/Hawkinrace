import { useCallback, useEffect, useState } from 'react';
import { ensureProfile, loadProfileOnce, syncSelectedCar } from '../services/profile';
import type { BackendPlayer } from '../services/api';

/**
 * Where the profile is in its lifecycle.
 *
 * `offline` and `error` are kept apart from `ready` on purpose. A missing
 * backend is an expected local-development state and the game stays fully
 * playable; an unexpected server error is not, and the two deserve different
 * wording if they ever reach the player.
 */
export type ProfileStatus = 'loading' | 'ready' | 'offline' | 'error';

export interface PlayerProfileState {
  profile: BackendPlayer | null;
  status: ProfileStatus;
}

export interface UsePlayerProfile extends PlayerProfileState {
  /** Find-or-create the profile for a driver. Safe to call more than once. */
  ensure: (displayName: string, selectedCarId?: string | null) => Promise<BackendPlayer | null>;
  /** Persists the current car choice. Fire-and-forget. */
  saveSelectedCar: (carId: string) => void;
}

/**
 * Player profile, loaded once when the app starts.
 *
 * Every failure path resolves rather than rejects: an unreachable backend must
 * never propagate into a render, because that would take down a selection screen
 * and with it the ability to race.
 */
export function usePlayerProfile(): UsePlayerProfile {
  const [state, setState] = useState<PlayerProfileState>({ profile: null, status: 'loading' });

  useEffect(() => {
    let active = true;
    loadProfileOnce()
      .then((profile) => {
        if (!active) return;
        // No stored profile is a normal state, not a failure: the player simply
        // has not picked a driver yet.
        setState({ profile, status: 'ready' });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        setState({ profile: null, status: offline ? 'offline' : 'error' });
        console.warn('[profile] startup load failed:', error);
      });
    return () => {
      active = false;
    };
  }, []);

  const ensure = useCallback(async (displayName: string, selectedCarId: string | null = null) => {
    const profile = await ensureProfile(displayName, selectedCarId);
    if (profile) setState({ profile, status: 'ready' });
    return profile;
  }, []);

  const saveSelectedCar = useCallback((carId: string) => {
    // Deliberately not awaited and not re-thrown: choosing a car must feel
    // instant whether or not the backend is there.
    void syncSelectedCar(carId).then((profile) => {
      if (profile) setState({ profile, status: 'ready' });
    });
  }, []);

  return { ...state, ensure, saveSelectedCar };
}