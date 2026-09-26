import { useCallback, useEffect, useRef, useState } from 'react';
import { isAdjusted, presetOf } from '../constants/dashboardCapabilities';
import {
  changeFormula,
  fetchDashboardPreferences,
  saveDashboardPreferences,
} from '../services/dashboardApi';
import {
  DEFAULT_DASHBOARD_LEVEL,
  type DashboardBlock,
  type DashboardLevel,
  type FormulaCapabilities,
} from '../types/Dashboard';

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
  // SMA-448, lot F1 — what the account's formula permits, as the server
  // served it with the layout: the page draws its widgets, their sizes and
  // its bar from it. Beside the layout, not in it: the layout is what is
  // WRITTEN, the capabilities are only ever read.
  const [capabilities, setCapabilities] = useState<FormulaCapabilities | null>(null);
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
  // The ordinary write currently ON THE WIRE, and the epoch of the ordinary
  // lane (round 3, N'2 — see `send`).
  const inFlightRef = useRef<AbortController | null>(null);
  const epochRef = useRef(0);

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
      //
      // Round 3 (N'2): bumping an EPOCH, not raising a shared flag. A flag has
      // to be lowered again for a page restored from the back/forward cache to
      // save, and lowering it also un-supersedes the write still queued on the
      // old chain — which then sends a layout from before the teardown and
      // overwrites the newer one. An epoch is captured per write, so a queued
      // write stays superseded forever while new writes are free.
      epochRef.current += 1;
      inFlightRef.current?.abort();
      inFlightRef.current = null;

      const urgent = saveDashboardPreferences(next, true);
      chainRef.current = urgent.catch(() => {});
      return urgent;
    }

    // Captured NOW, at scheduling time, not read later inside the chained
    // continuation: that is the whole point of the epoch.
    const epoch = epochRef.current;
    const controller = new AbortController();
    const sent = chainRef.current
      .catch(() => {})
      .then(() => {
        // Superseded while it waited its turn: a teardown write has already
        // carried a newer layout, and this one would overwrite it.
        if (epoch !== epochRef.current) return;
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

  /**
   * Sends the write the debounce still owes, at once. Returns that write — or
   * undefined when nothing was pending — so a caller that must know it
   * LANDED (the formula switch) can wait for it; the save indicator follows
   * it either way.
   */
  const flush = useCallback(
    (keepalive = false): Promise<unknown> | undefined => {
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (!pending) return undefined;
      const sent = send(pending, keepalive);
      sent.then(() => setSaveState('saved')).catch(() => setSaveState('error'));
      return sent;
    },
    [send]
  );

  const schedule = useCallback(
    (next: Layout) => {
      // No reset here (round 3, N'2): a write scheduled after a teardown simply
      // captures the CURRENT epoch in `send` and is free to leave, while the
      // ones queued under the old epoch stay dropped. A page restored from the
      // back/forward cache therefore saves normally without ever reviving a
      // stale write.
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
        setCapabilities(preferences.capabilities);
        setLoadError(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        layoutRef.current = null;
        setLayout(null);
        setCapabilities(null);
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
   * SMA-448, lot F1, S5 — choosing a level is choosing the account's FORMULA,
   * a right the server holds. It used to apply the level's preset and write
   * it, which erased the layout of the level left — its order, its sizes, its
   * visibility and every widget's options (V4, fact F1 of the contract). Now:
   *
   * 1. the layout the debounce still owes is written FIRST, so the layout the
   *    server archives under the formula left is the one on screen;
   * 2. the server switches the formula (`changeFormula`), archiving that
   *    layout and restoring the one of the formula entered — or its preset,
   *    for a formula never visited;
   * 3. the hook reads back what the server holds, capabilities included.
   *
   * A write that fails, or a switch the server refuses — 409, a formula too
   * small for the account's gardens —, leaves the formula and the layout as
   * they were and says so (« Modifications non enregistrées »). Resolves true
   * once the page stands at the new formula, false otherwise.
   */
  const setLevel = useCallback(
    async (level: DashboardLevel): Promise<boolean> => {
      if (!layoutRef.current) return false;
      try {
        await flush();
        await chainRef.current;
        setSaveState('pending');
        await changeFormula(level);
        const preferences = await fetchDashboardPreferences();
        const loaded = { level: preferences.level, blocks: preferences.blocks };
        layoutRef.current = loaded;
        setLayout(loaded);
        setCapabilities(preferences.capabilities);
        setSaveState('saved');
        return true;
      } catch {
        setSaveState('error');
        return false;
      }
    },
    [flush]
  );

  /**
   * Back to the current formula's preset, discarding the manual arrangement —
   * of THIS formula only: the layouts of the others wait in the server's
   * archive, untouched.
   */
  const resetToLevel = useCallback(() => {
    const current = layoutRef.current;
    if (!current || !capabilities) return;
    commit({ level: current.level, blocks: presetOf(capabilities) });
  }, [commit, capabilities]);

  const level = layout?.level ?? DEFAULT_DASHBOARD_LEVEL;
  const blocks = layout?.blocks ?? [];

  return {
    level,
    blocks,
    /** What the account's formula permits, as served; null until the layout is read. */
    capabilities,
    loading,
    loadError,
    saveState,
    adjusted: layout && capabilities ? isAdjusted(blocks, capabilities) : false,
    reload,
    setBlocks,
    setLevel,
    resetToLevel,
  };
}
