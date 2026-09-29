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
 * arranged, the region says it, and the next move retries.
 *
 * ONE write on the wire at a time, and always the LATEST list (PR #299, fix
 * round 1, C): a move made while a write is out waits its turn and goes
 * after it — never beside it. Aborting the older fetch, as before, stopped a
 * request, not a transaction the server had already accepted: two writes on
 * the wire could land in either order, and the older list could overwrite
 * the newer. Written one after the other, the last list written is the last
 * one moved; « saved » is said for the write that finished last, and a
 * failure is said when no newer list is left to retry it.
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
  const inFlightRef = useRef(false);
  // The latest `onSaved`, for a write that lands after the page re-rendered:
  // written in an effect (a ref is never touched during the render).
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  const ids = useMemo(() => customOrderIds(gardens, order), [gardens, order]);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // A write still on the wire: the pending list keeps its place and goes
    // when that write settles (below) — one list on the wire at a time.
    if (inFlightRef.current) return;
    const send = (list: string[]): void => {
      pendingRef.current = null;
      inFlightRef.current = true;
      saveGardenOrder(list)
        .then(() => {
          // A newer list waits its turn: its own write will speak.
          if (pendingRef.current !== null) return;
          setState('saved');
          onSavedRef.current?.();
        })
        .catch(() => {
          // A newer list waits its turn: it retries, and its outcome speaks.
          if (pendingRef.current !== null) return;
          setState('error');
        })
        .finally(() => {
          inFlightRef.current = false;
          const next = pendingRef.current;
          if (next !== null) send(next);
        });
    };
    const pending = pendingRef.current;
    if (pending !== null) send(pending);
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
  // effort — or after the write on the wire, which sends it when it settles.
  // Never a keepalive, the layout's teardown keeps that channel.
  useEffect(() => () => flush(), [flush]);

  return { ids, order, state, move };
}
