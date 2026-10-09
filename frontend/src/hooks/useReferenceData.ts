import { useEffect, useState } from 'react';
import { loadReferenceData, type ReferenceData } from '../services/backend';

export interface ReferenceDataState {
  data: ReferenceData | null;
  loading: boolean;
  error: boolean;
}

/**
 * Loads the backend's players/cars/tracks once and shares the result.
 * Select pages use it to show live catalogue data, but fall back to the local
 * tables (and the race stays fully playable) if the backend is unreachable.
 */
export function useReferenceData(): ReferenceDataState {
  const [data, setData] = useState<ReferenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    loadReferenceData()
      .then((reference) => {
        if (active) {
          setData(reference);
          setError(false);
        }
      })
      .catch(() => {
        if (active) {
          setError(true);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return { data, loading, error };
}
