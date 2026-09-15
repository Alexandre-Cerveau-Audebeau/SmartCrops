import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fetchDashboardWeather } from '../services/weatherApi';
import {
  EMPTY_WEATHER_DATA,
  type DashboardWeatherData,
} from '../types/DashboardWeather';

/**
 * SMA-336 PR 3b/5 — the weather aggregate, with the guards `useDashboardData`
 * inherited from `useGardens` (SMA-288 / SMA-421).
 *
 * Same shape and same rules, deliberately: the stale-response generation
 * counter, the AbortController cancelled in a LAYOUT effect, `loading` that
 * never returns to `true`, and `refreshing` DERIVED from what has settled
 * against what was asked. A refetch keeps the current weather on screen until
 * the new one lands: the widget never blinks back to its skeleton for a
 * refresh.
 *
 * TWO refreshes, told apart since round 4 (F1 — Extension adeab24a / 6e4d5a7c),
 * because what a FAILED replacement may leave on screen differs:
 *
 * - `refetch()` is PASSIVE — a language switch, Retry, a garden created or
 *   deleted: the server's STORED PLACES did not change. A failed replacement
 *   KEEPS the last known aggregate and raises `loadError` (round 3, E2 b —
 *   GitHub 4009816076), the way the server cache serves a place as « stale »:
 *   the places it names are still the stored ones, only the figures are old.
 *   The surfaces that draw FIGURES — the widget, the MÉTÉO cells, the To-do
 *   block — branch on `loadError` before they read `data`, so no figure from a
 *   load ago sits behind the error; the location dialog and the gear panel,
 *   live on the aggregate since round 2, go on naming the stored place instead
 *   of saying « no place saved » over a place the page read a minute earlier.
 *
 * - `refetchAfterMutation()` follows a location WRITE the server has already
 *   accepted — « Utiliser », « Retirer », « Revenir à la ville du profil », the
 *   invitation's inline field. The aggregate on screen names the places of
 *   BEFORE the write, so it is marked stale BEFORE the request goes out. It
 *   stays drawn while the re-read is in flight (no blink), and a FAILED re-read
 *   drops it to `EMPTY_WEATHER_DATA` with `loadError`: the surfaces then say
 *   « weather unavailable » and nothing is known — never the old place, never
 *   « Retirer » on a default the server has already dropped. A failed FIRST
 *   load leaves the same state.
 *
 * Its own hook rather than a field of `useDashboardData` (pre-flight § D.1):
 * that hook empties the whole aggregate on error, and a provider outage must
 * not make the gardens disappear.
 */
export function useDashboardWeather(language: string) {
  const [data, setData] = useState<DashboardWeatherData>(EMPTY_WEATHER_DATA);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [settled, setSettled] = useState<{ epoch: number; language: string } | null>(
    null
  );
  const latestRequestRef = useRef(0);
  const inFlightRef = useRef<AbortController | null>(null);
  // The aggregate on screen predates a write the server has accepted (F1). A
  // ref rather than a per-request flag: a language switch that supersedes the
  // post-write request in flight inherits the mark, since the aggregate it
  // would otherwise keep is still the pre-write one. Lifted by the first
  // answer that settles as current — an aggregate read after the write, or
  // nothing.
  const staleAfterMutationRef = useRef(false);

  // The generation moves synchronously in the handler: the callers run after
  // an `await` (a 204 from a location write), outside any discrete event, so
  // React commits the bump in a later task and a superseded response could
  // settle in between.
  const refetch = useCallback(() => {
    latestRequestRef.current += 1;
    setEpoch((value) => value + 1);
  }, []);

  /** The re-read that follows a location write: see the note above. */
  const refetchAfterMutation = useCallback(() => {
    staleAfterMutationRef.current = true;
    refetch();
  }, [refetch]);

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

    fetchDashboardWeather(language, controller.signal)
      .then((next) => {
        if (!isCurrent()) return;
        staleAfterMutationRef.current = false;
        setData(next);
        setLoadError(false);
      })
      .catch(() => {
        if (!isCurrent()) return;
        if (staleAfterMutationRef.current) {
          // The aggregate predates a write the server accepted (F1): dropped,
          // and `loadError` tells the surfaces that nothing is known.
          staleAfterMutationRef.current = false;
          setData(EMPTY_WEATHER_DATA);
        }
        // Otherwise the last known aggregate stays (E2 b): see the note above.
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

  return { data, loading, refreshing, loadError, refetch, refetchAfterMutation };
}
