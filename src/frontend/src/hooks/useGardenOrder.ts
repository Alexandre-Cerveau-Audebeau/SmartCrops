import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { customOrderIds } from '../components/Dashboard/blocks/gardensOptions';
import { saveGardenOrder } from '../services/gardenSettingsApi';
import type { DashboardGardenData } from '../types/DashboardData';
import { moveItem } from '../utils/dashboardLayoutGrid';
import { SAVE_DEBOUNCE_MS } from './useDashboardPreferences';

/** What the last write of the order did: nothing yet, waiting its turn, landed, or failed. */
export type GardenOrderState = 'idle' | 'pending' | 'saved' | 'error';

export interface GardenOrder {
  /**
   * The gardens' ids in the account's custom order, as the page reads it —
   * the local order once the user moved a garden, the server's places until
   * then; in both, a garden not yet ranked sits at the HEAD, the newest first
   * (A-N5), so a garden created while the panel is open takes the head too.
   */
  ids: string[];
  /** The local order — the ids the user moved, not yet or just written — or null to read the server's places. */
  order: string[] | null;
  state: GardenOrderState;
  /** A garden moved from `from` to `to` — by ▲, ▼ or a drop: applied at once, written after a pause. */
  move: (from: number, to: number) => void;
}

/**
 * SMA-448, lot F5-a — the account's custom order of its gardens (A-N5, decided
 * by Alexandre on 28/09; pre-flight F5 § C.2 b, « l'écriture depuis le
 * panneau »): a SECOND write surface, apart from the layout's document —
 * `PUT /api/gardens/order`, the garden's own column — written after the same
 * pause the layout takes (`SAVE_DEBOUNCE_MS`), and said in the panel's own
 * region rather than through the header's indicator, which speaks of the
 * layout alone [P].
 *
 * The model of `useDashboardPreferences`: a move is applied LOCALLY at once
 * and written after the last one; every state write sits in a callback or a
 * promise chain, never synchronously in an effect body; a write that failed —
 * a 403 from a formula without the order, a server before this lot, a network
 * that dropped — does not roll the local order back: the user keeps what they
 * arranged, the region says it, and the next move retries. A write a newer
 * move supersedes is aborted rather than raced.
 *
 * The local order is KEPT for the session once the user moved something: it
 * is the user's order, and reading the server's places back through
 * `onSaved` (the page's passive refetch) only confirms it — a garden created
 * later is absent from it and takes the head, a deleted one is not found.
 */
export function useGardenOrder(gardens: readonly DashboardGardenData[], onSaved?: () => void): GardenOrder {
  const [order, setOrder] = useState<string[] | null>(null);
  const [state, setState] = useState<GardenOrderState>('idle');
  const pendingRef = useRef<string[] | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<AbortController | null>(null);
  // The latest `onSaved`, for a write that lands after the page re-rendered:
  // written in an effect (a ref is never touched during the render).
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  const ids = useMemo(() => customOrderIds(gardens, order), [gardens, order]);

  const flush = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!pending) return;
    // A write still on the wire carries an older order: superseded, aborted.
    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;
    saveGardenOrder(pending, controller.signal)
      .then(() => {
        if (controller.signal.aborted) return;
        setState('saved');
        onSavedRef.current?.();
      })
      .catch(() => {
        // Our own abort is a supersession, not a failure.
        if (controller.signal.aborted) return;
        setState('error');
      })
      .finally(() => {
        if (inFlightRef.current === controller) inFlightRef.current = null;
      });
  }, []);

  const schedule = useCallback(
    (next: string[]) => {
      pendingRef.current = next;
      setState('pending');
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    [flush]
  );

  const move = useCallback(
    (from: number, to: number) => {
      const next = moveItem(ids, from, to);
      setOrder(next);
      schedule(next);
    },
    [ids, schedule]
  );

  // A move still waiting its turn when the page goes: written now, best
  // effort — never a keepalive, the layout's teardown keeps that channel.
  useEffect(() => () => flush(), [flush]);

  return { ids, order, state, move };
}
