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

  // The write the debounce still owes the server. Held in a ref so the unmount
  // cleanup can flush it: navigating away one keystroke after a drag must not
  // silently drop that drag.
  const pendingRef = useRef<Layout | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!pending) return;
    saveDashboardPreferences(pending)
      .then(() => setSaveState('saved'))
      .catch(() => setSaveState('error'));
  }, []);

  const schedule = useCallback(
    (next: Layout) => {
      pendingRef.current = next;
      setSaveState('pending');
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    [flush]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchDashboardPreferences(controller.signal)
      .then((preferences) => {
        if (controller.signal.aborted) return;
        setLayout({ level: preferences.level, blocks: preferences.blocks });
        setLoadError(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setLayout(null);
        setLoadError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadEpoch]);

  // Unmount only: the pending write leaves with the component.
  useEffect(
    () => () => {
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
      if (pending) void saveDashboardPreferences(pending).catch(() => {});
    },
    []
  );

  const reload = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    setReloadEpoch((epoch) => epoch + 1);
  }, []);

  /** Replaces the blocks (reorder, resize, hide, show) and schedules the save. */
  const setBlocks = useCallback(
    (blocks: DashboardBlock[]) => {
      setLayout((current) => {
        if (!current) return current;
        const next = { level: current.level, blocks };
        schedule(next);
        return next;
      });
    },
    [schedule]
  );

  /**
   * Picking a level PRE-CONFIGURES the widgets: it applies that level's preset
   * (`_spec.md` § 8 — « le niveau pré-configure les widgets »). Manual changes
   * made afterwards win, which is what makes « Réinitialiser au niveau X » a
   * distinct gesture rather than a duplicate of this one.
   */
  const setLevel = useCallback(
    (level: DashboardLevel) => {
      const next = { level, blocks: presetFor(level) };
      setLayout(next);
      schedule(next);
    },
    [schedule]
  );

  /** Back to the current level's preset, discarding the manual arrangement. */
  const resetToLevel = useCallback(() => {
    setLayout((current) => {
      const level = current?.level ?? DEFAULT_DASHBOARD_LEVEL;
      const next = { level, blocks: presetFor(level) };
      schedule(next);
      return next;
    });
  }, [schedule]);

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
