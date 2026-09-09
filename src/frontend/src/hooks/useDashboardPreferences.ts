import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_DASHBOARD_LEVEL,
  isAdjusted,
  presetFor,
} from '../constants/dashboardPresets';
import {
  fetchDashboardPreferences,
  saveDashboardPreferences,
} from '../services/dashboardApi';
import type { DashboardBlock, DashboardLevel } from '../types/Dashboard';

/**
 * How long the hook waits after the LAST change before writing (SMA-336).
 * A resize or a reorder comes in bursts — a drag ends with one drop but the
 * gallery and the size handle are clicked repeatedly — and every burst must
 * cost one PUT, not one per click. Short enough that the discreet « saved »
 * indicator still reads as a consequence of the gesture.
 */
export const SAVE_DEBOUNCE_MS = 700;

export type SaveState = 'idle' | 'pending' | 'saved' | 'error';

interface Layout {
  level: DashboardLevel;
  blocks: DashboardBlock[];
}

/**
 * SMA-336 — owns the dashboard layout: loads it, applies local changes at once
 * and persists them SERVER-SIDE after a pause. Deliberately no localStorage:
 * the layout is a user preference that must follow the account across devices
 * (design freeze), so the server is the only store.
 *
 * Loading is modelled on useGardens: an AbortController per request, every
 * state write inside the promise chain (never synchronously in an effect body,
 * react-hooks/set-state-in-effect), and a failed load leaves `layout` null so
 * the page shows its actionable error instead of an empty grid.
 *
 * A failed SAVE does NOT roll the layout back: the user keeps the arrangement
 * they just made, sees the error, and the next change retries. Silently undoing
 * a drag under someone's cursor is worse than a stale server.
 */
export function useDashboardPreferences() {
  const [layout, setLayout] = useState<Layout | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [reloadEpoch, setReloadEpoch] = useState(0);

  // The write the debounce still owes the server. Held in a ref so the teardown
  // paths can flush it: navigating away one keystroke after a drag must not
  // silently drop that drag.
  const pendingRef = useRef<Layout | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirrors `layout` so the mutators can read the current level WITHOUT doing
  // it from inside a `setLayout` updater (round 1, E11): an updater must be a
  // pure function of the previous state, and React may run it more than once
  // for the same logical update — StrictMode does exactly that in development.
  const layoutRef = useRef<Layout | null>(null);
  // The last write still in flight (round 1, G8). The endpoint replaces the
  // layout wholesale, so two concurrent PUTs are a lost-update hazard: if the
  // older one lands last, the server keeps the older layout and the user's
  // final arrangement is gone with no error shown. Chaining orders them.
  const chainRef = useRef<Promise<unknown>>(Promise.resolve());
  // The ordinary write currently ON THE WIRE, and whether a teardown write has
  // superseded the ordinary lane (round 2, E'6 / N4 — see `send`).
  const inFlightRef = useRef<AbortController | null>(null);
  const supersededRef = useRef(false);

  const send = useCallback((next: Layout, keepalive: boolean) => {
    if (keepalive) {
      // THE TEARDOWN LANE (round 2, E'6 / N4). Two rules, and they are not the
      // same rule.
      //
      // 1. Issue it NOW, outside the chain. Chaining only queues a microtask,
      //    and a microtask queued while the document unloads is not guaranteed
      //    to run: no request is ever created. `keepalive` keeps a request that
      //    has ALREADY left alive past the document; it cannot resurrect one
      //    that was never sent.
      // 2. Cancel what it supersedes. The endpoint replaces the layout
      //    wholesale, so an older PUT landing after this one restores the
      //    arrangement the user has just moved past. This layout is the newest
      //    by construction — `flush` only reaches here with a pending write —
      //    so the older ones have nothing to carry that this one does not: the
      //    request on the wire is aborted, the ones still queued are dropped.
      //    Client-side only: a request the server has already handled cannot be
      //    recalled, which would take a conditional write on the endpoint.
      //
      // When nothing is pending, `flush` returns before calling `send` at all,
      // so an in-flight ordinary write is left alone — it is then the newest.
      supersededRef.current = true;
      inFlightRef.current?.abort();
      inFlightRef.current = null;

      const urgent = saveDashboardPreferences(next, true);
      chainRef.current = urgent.catch(() => {});
      return urgent;
    }

    const controller = new AbortController();
    const sent = chainRef.current
      .catch(() => {})
      .then(() => {
        if (supersededRef.current) return;
        inFlightRef.current = controller;
        return saveDashboardPreferences(next, false, controller.signal);
      })
      .catch((error: unknown) => {
        // Our own abort: a supersession, not a failure. Reporting « error » for
        // it would put a red state on a layout that WAS written, by the
        // teardown request that replaced this one.
        if (controller.signal.aborted) return;
        throw error;
      })
      .finally(() => {
        if (inFlightRef.current === controller) inFlightRef.current = null;
      });
    chainRef.current = sent.catch(() => {});
    return sent;
  }, []);

  const flush = useCallback(
    (keepalive = false) => {
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (!pending) return;
      send(pending, keepalive)
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'));
    },
    [send]
  );

  const schedule = useCallback(
    (next: Layout) => {
      // A new local change re-opens the ordinary lane: `pagehide` also fires on
      // a navigation the back/forward cache can restore, and the page that
      // comes back must still be able to save.
      supersededRef.current = false;
      pendingRef.current = next;
      setSaveState('pending');
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => flush(), SAVE_DEBOUNCE_MS);
    },
    [flush]
  );

  /** Applies a layout locally and schedules its write. The ONE side-effect path. */
  const commit = useCallback(
    (next: Layout) => {
      layoutRef.current = next;
      setLayout(next);
      schedule(next);
    },
    [schedule]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchDashboardPreferences(controller.signal)
      .then((preferences) => {
        if (controller.signal.aborted) return;
        const loaded = { level: preferences.level, blocks: preferences.blocks };
        layoutRef.current = loaded;
        setLayout(loaded);
        setLoadError(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        layoutRef.current = null;
        setLayout(null);
        setLoadError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadEpoch]);

  // Page teardown AND unmount (round 1, E12): an unmount cleanup never runs for
  // a tab close or a cross-document navigation, and a plain fetch started at
  // that moment may be cancelled with the document — hence `pagehide` and the
  // keepalive flag.
  useEffect(() => {
    const flushNow = () => flush(true);
    window.addEventListener('pagehide', flushNow);
    return () => {
      window.removeEventListener('pagehide', flushNow);
      flushNow();
    };
  }, [flush]);

  const reload = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    setReloadEpoch((epoch) => epoch + 1);
  }, []);

  /** Replaces the blocks (reorder, resize, hide, show) and schedules the save. */
  const setBlocks = useCallback(
    (blocks: DashboardBlock[]) => {
      const current = layoutRef.current;
      if (!current) return;
      commit({ level: current.level, blocks });
    },
    [commit]
  );

  /**
   * Picking a level PRE-CONFIGURES the widgets: it applies that level's preset
   * (`_spec.md` § 8 — « le niveau pré-configure les widgets »). Manual changes
   * made afterwards win, which is what makes « Réinitialiser au niveau X » a
   * distinct gesture rather than a duplicate of this one.
   */
  const setLevel = useCallback(
    (level: DashboardLevel) => commit({ level, blocks: presetFor(level) }),
    [commit]
  );

  /** Back to the current level's preset, discarding the manual arrangement. */
  const resetToLevel = useCallback(() => {
    const level = layoutRef.current?.level ?? DEFAULT_DASHBOARD_LEVEL;
    commit({ level, blocks: presetFor(level) });
  }, [commit]);

  const level = layout?.level ?? DEFAULT_DASHBOARD_LEVEL;
  const blocks = layout?.blocks ?? [];

  return {
    level,
    blocks,
    loading,
    loadError,
    saveState,
    adjusted: layout ? isAdjusted(blocks, level) : false,
    reload,
    setBlocks,
    setLevel,
    resetToLevel,
  };
}
