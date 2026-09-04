import { useEffect, useState } from 'react';
import { HttpStatusError } from '../services/httpStatusError';
import { fetchPlantById } from '../services/plantApi';
import type { Plant } from '../types/Plant';

export interface UsePlantResult {
  /** The last plant that landed — stays displayed across an in-place reload. */
  plant: Plant | null;
  /** True until the first request of this mount settles (false without an id). */
  loading: boolean;
  /** The rejection of the latest settled request; null on success and on 404. */
  error: unknown;
}

/**
 * Owns the plant fetch for the catalogue detail page (SMA-421, modelled on
 * useGardenLayout). The page is remounted per `:id` (keyed at the route
 * entry), so one mount of this hook only ever serves ONE plant;
 * `reloadCounter` re-runs the request in place after an admin re-enrich, and
 * the plant on screen stays displayed until the fresh payload lands.
 *
 * Every state write lives in the promise chain — never synchronously in the
 * effect body (react-hooks/set-state-in-effect) — and `loading` is derived
 * from whether a request has settled rather than toggled by hand. A 404
 * settles with a null plant and no error, so the page shows its not-found
 * state as before. A run whose cleanup already fired never applies its
 * payload.
 */
export function usePlant(
  id: string | undefined,
  reloadCounter: number
): UsePlantResult {
  const [settled, setSettled] = useState<{
    plant: Plant | null;
    error: unknown;
  } | null>(null);

  useEffect(() => {
    if (!id) return;
    let stale = false;
    const controller = new AbortController();
    fetchPlantById(id, controller.signal)
      .then((data) => {
        if (stale) return;
        setSettled({ plant: data, error: null });
      })
      .catch((err: unknown) => {
        if (stale) return;
        if (err instanceof HttpStatusError && err.status === 404) {
          setSettled({ plant: null, error: null });
          return;
        }
        setSettled({ plant: null, error: err });
      });
    return () => {
      stale = true;
      controller.abort();
    };
  }, [id, reloadCounter]);

  return {
    plant: settled?.plant ?? null,
    loading: id !== undefined && settled === null,
    error: settled?.error ?? null,
  };
}
