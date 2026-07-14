import { useCallback, useEffect, useState } from 'react';
import { fetchGarden } from '../services/gardenApi';
import { fetchLayout } from '../services/gardenLayoutApi';
import type { GardenLayoutData } from '../services/gardenLayoutApi';
import type { Garden } from '../types/Garden';

export interface GardenLayoutSnapshot {
  garden: Garden;
  layout: GardenLayoutData;
}

/**
 * Owns the garden + layout fetch for the planner (SMA-213).
 *
 * Each `gardenId` change aborts the in-flight request AND arms a
 * stale-response guard: a run whose cleanup already fired can never apply its
 * payload, so a slow response from a previous garden cannot overwrite the
 * current one (the pre-hook `mountedRef` guard was re-armed by the next
 * effect run and let exactly that through).
 *
 * Loading semantics match the pre-hook behavior: `loading` starts true and
 * only flips false once — switching gardens keeps the previous garden
 * rendered until the new payload lands, without re-showing the spinner.
 * `error` keeps the rejection object (a fresh identity per failure) so
 * consumers can re-trigger their error UI on every failed load.
 */
export function useGardenLayout(gardenId: string | undefined) {
  const [data, setData] = useState<GardenLayoutSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [epoch, setEpoch] = useState(0);

  const refetch = useCallback(() => setEpoch((e) => e + 1), []);

  useEffect(() => {
    if (!gardenId) return;
    let stale = false;
    const controller = new AbortController();
    Promise.all([
      fetchLayout(gardenId, controller.signal),
      fetchGarden(gardenId, controller.signal),
    ])
      .then(([layout, garden]) => {
        if (stale) return;
        setData({ garden, layout });
      })
      .catch((err: unknown) => {
        if (stale) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (stale) return;
        setLoading(false);
      });
    return () => {
      stale = true;
      controller.abort();
    };
  }, [gardenId, epoch]);

  return { data, loading, error, refetch };
}
