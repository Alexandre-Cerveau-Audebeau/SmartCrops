import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchGardens } from '../services/gardenApi';
import type { GardenListItem } from '../types/Garden';

/**
 * Owns the gardens-list fetch for MyGardens (SMA-421, modelled on
 * useGardenLayout). Re-runs on language switch: preview names ride the
 * server-localized flat `commonName`, so a locale change must re-fetch, not
 * re-resolve (SMA-155). `refetch()` drives the post-mutation refreshes.
 *
 * Monotonic sequencing over EVERY request (SMA-288): a locale-switch fetch
 * and a post-mutation refresh can overlap, so an older response could land
 * last and overwrite newer state. Each run takes the next request id; a
 * state commit is gated on that id still being the latest AND on the run's
 * cleanup not having fired (`stale`). The AbortController stays as the
 * cancellation fast-path — its abort always follows the cleanup, so an
 * aborted run can never commit.
 *
 * Loading semantics match the page: `loading` starts true and only flips
 * false once — a refetch keeps the current cards rendered until the new list
 * lands. Every state write lives in the promise chain, never synchronously in
 * the effect body (react-hooks/set-state-in-effect).
 */
export function useGardens(language: string) {
  const [gardens, setGardens] = useState<GardenListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const latestRequestRef = useRef(0);

  const refetch = useCallback(() => setEpoch((e) => e + 1), []);

  useEffect(() => {
    let stale = false;
    const controller = new AbortController();
    const requestId = ++latestRequestRef.current;
    const isCurrent = () => !stale && requestId === latestRequestRef.current;
    fetchGardens(controller.signal, language)
      .then((data) => {
        if (!isCurrent()) return;
        setGardens(data);
        setLoadError(false);
      })
      .catch(() => {
        if (!isCurrent()) return;
        setLoadError(true);
      })
      .finally(() => {
        if (isCurrent()) setLoading(false);
      });
    return () => {
      stale = true;
      controller.abort();
    };
  }, [language, epoch]);

  return { gardens, loading, loadError, refetch };
}
