import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fetchDashboardData } from '../services/dashboardApi';
import { EMPTY_DASHBOARD_DATA, type DashboardData } from '../types/DashboardData';

/**
 * SMA-336 PR 2/5 — the transport aggregate, with the guards `useGardens`
 * earned.
 *
 * Same shape and same rules, deliberately: the stale-response generation
 * counter and the AbortController cancelled in a LAYOUT effect (SMA-288 /
 * SMA-421), and the same loading semantics — a refetch keeps the current
 * figures on screen until the new ones land, while a FAILED replacement clears
 * them so the error never sits behind stale numbers. Those rules cost two
 * tickets to find; this hook does not get to re-discover them.
 *
 * It replaces `useGardens` on the dashboard because it answers the same
 * question and more, in one call instead of seven.
 */
export function useDashboardData(language: string) {
  const [data, setData] = useState<DashboardData>(EMPTY_DASHBOARD_DATA);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [epoch, setEpoch] = useState(0);
  // The request that last SETTLED (round 7, S33 — Extension #7-17). `loading`
  // never returns to `true` by design (see above), and `loadError` is cleared
  // only by an answer: a Retry click therefore changed nothing a widget could
  // read until the response landed, and on a slow network the button read as
  // a dead control — the failure mode the Counters chips fixed in round 1
  // (E7). `refreshing` is DERIVED from what has settled against what was
  // asked, so the skeleton rule stays intact: the figures — or the error —
  // stay on screen, and only the Retry buttons learn that a request is out.
  const [settled, setSettled] = useState<{ epoch: number; language: string } | null>(
    null
  );
  const latestRequestRef = useRef(0);
  const inFlightRef = useRef<AbortController | null>(null);

  // The generation moves HERE too, synchronously in the handler: the
  // post-mutation callers run after an `await`, outside any discrete event, so
  // React commits the bump in a later task and a superseded response could
  // settle in between.
  const refetch = useCallback(() => {
    latestRequestRef.current += 1;
    setEpoch((value) => value + 1);
  }, []);

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

    fetchDashboardData(language, controller.signal)
      .then((next) => {
        if (!isCurrent()) return;
        setData(next);
        setLoadError(false);
      })
      .catch(() => {
        if (!isCurrent()) return;
        // A failed replacement must not leave the previous figures behind the
        // error: the widgets show the error, not numbers from a load ago.
        setData(EMPTY_DASHBOARD_DATA);
        setLoadError(true);
      })
      .finally(() => {
        if (!isCurrent()) return;
        setLoading(false);
        setSettled({ epoch, language });
      });
  }, [language, epoch]);

  const refreshing =
    settled === null || settled.epoch !== epoch || settled.language !== language;

  return { data, loading, refreshing, loadError, refetch };
}
