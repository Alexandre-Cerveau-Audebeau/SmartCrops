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
 * against what was asked. A refetch — after a location is saved, or on Retry —
 * keeps the current weather on screen until the new one lands: the widget
 * never blinks back to its skeleton for a refresh.
 *
 * A FAILED replacement KEEPS the last known aggregate and raises `loadError`
 * (round 3, E2 — GitHub 4009816076), the way the server cache serves a place
 * as « stale »: the location dialog and the gear panel, live on the aggregate
 * since round 2, went on saying « no place saved » over a place the page had
 * read a minute earlier. The surfaces that draw FIGURES — the widget, the
 * MÉTÉO cells, the To-do block — branch on `loadError` before they read
 * `data`, so no figure from a load ago sits behind the error; only the stored
 * PLACES, which the failed request did not change, keep being named. A failed
 * FIRST load leaves `EMPTY_WEATHER_DATA`, and `loadError` tells the surfaces
 * that nothing is known.
 *
 * Its own hook rather than a field of `useDashboardData` (pre-flight § D.1):
 * that hook empties the whole aggregate on error, and a provider outage must
 * not make the gardens disappear. `refetch` is what the location writes call
 * once the server has answered 204.
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

  // The generation moves synchronously in the handler: the callers run after
  // an `await` (a 204 from a location write), outside any discrete event, so
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

    fetchDashboardWeather(language, controller.signal)
      .then((next) => {
        if (!isCurrent()) return;
        setData(next);
        setLoadError(false);
      })
      .catch(() => {
        if (!isCurrent()) return;
        // The last known aggregate stays (E2): see the note above.
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
