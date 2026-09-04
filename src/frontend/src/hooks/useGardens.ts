import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
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
 * last and overwrite newer state. The invalidation lives in the COMMIT
 * (SMA-421 round 2): a layout effect keyed on [language, epoch] advances the
 * request generation and aborts the in-flight request synchronously inside
 * the commit — before any promise callback can run — so a superseded
 * settlement that lands between the render and the passive effects is
 * already out of date, for a language change and for refetch() alike.
 * refetch() additionally moves the generation in the handler itself (round
 * 1): its callers run after an `await`, so the commit of their epoch bump
 * comes in a later task, and that call-to-commit interval needs closing too.
 * The passive effect only STARTS the request of the current generation; a
 * state commit is gated on that generation still being the latest and on
 * the request not being aborted.
 *
 * Loading semantics match the page: `loading` starts true and only flips
 * false once — a refetch keeps the current cards rendered until the new list
 * lands; a FAILED replacement clears the list so the error never sits behind
 * stale cards. Every state write lives in the promise chain, never
 * synchronously in an effect body (react-hooks/set-state-in-effect).
 */
export function useGardens(language: string) {
  const [gardens, setGardens] = useState<GardenListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const latestRequestRef = useRef(0);
  const inFlightRef = useRef<AbortController | null>(null);

  // refetch() ALSO moves the generation here, synchronously in the handler
  // (SMA-421 round 1, kept in round 2): the post-mutation callers run after an
  // `await`, outside any discrete event, so React commits the epoch bump in a
  // later task — a superseded response can settle between this call and that
  // commit, before the layout effect below runs. The layout effect remains
  // the one place where the previous request is aborted.
  const refetch = useCallback(() => {
    latestRequestRef.current += 1;
    setEpoch((e) => e + 1);
  }, []);

  // The invalidation point for every commit: runs synchronously in the commit
  // of every language change / refetch (and on unmount through its cleanup).
  // The generation moves and the previous request is aborted before React
  // yields, so no settlement can slip in between the render and the passive
  // effects.
  useLayoutEffect(() => {
    latestRequestRef.current += 1;
    inFlightRef.current?.abort();
    inFlightRef.current = null;
    return () => {
      inFlightRef.current?.abort();
      inFlightRef.current = null;
    };
  }, [language, epoch]);

  useEffect(() => {
    const requestId = latestRequestRef.current;
    const controller = new AbortController();
    inFlightRef.current = controller;
    const isCurrent = () =>
      !controller.signal.aborted && requestId === latestRequestRef.current;
    fetchGardens(controller.signal, language)
      .then((data) => {
        if (!isCurrent()) return;
        setGardens(data);
        setLoadError(false);
      })
      .catch(() => {
        if (!isCurrent()) return;
        // A failed replacement must not leave the previous list behind the
        // error (SMA-421 round 1): the page shows the error, not stale cards.
        setGardens([]);
        setLoadError(true);
      })
      .finally(() => {
        if (isCurrent()) setLoading(false);
      });
  }, [language, epoch]);

  return { gardens, loading, loadError, refetch };
}
