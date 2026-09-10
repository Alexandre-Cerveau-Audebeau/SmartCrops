import { useMemo } from 'react';
import type { DashboardGardenData } from '../types/DashboardData';
import { gardenViewOf, type GardenView } from '../utils/gardenStats';

/** A garden's derived figures, by garden id. */
export type GardenViews = ReadonlyMap<string, GardenView>;

/**
 * SMA-336 PR 2/5, round 1 (E22 / E10 / G4) — the derived view of every garden,
 * computed once and shared.
 *
 * Two things were repeating the same O(width × height) work. Within a widget:
 * `GardensBlock` derived a row's view inline during render, and it owns the
 * rename dialog, so `setEditName` re-ran the exposure engine once per garden per
 * keystroke. Across widgets: `StatsBlock` derived the same views for the same
 * gardens, and both can be on the page at once, so the engine ran twice per
 * garden per load.
 *
 * `useMemo` answers the first — nothing recomputes while `gardens` is the same
 * array. {@link gardenViewOf} answers the second — the derivation is memoized on
 * the garden object, so whichever widget renders first pays for it and the other
 * reads the same result. Neither widget has to know the other exists, and no
 * view is threaded through props that would have to stay in agreement.
 *
 * The views are SHARED objects: read them, never write to them.
 */
export function useGardenViews(
  gardens: readonly DashboardGardenData[]
): GardenViews {
  return useMemo(
    () => new Map(gardens.map((garden) => [garden.id, gardenViewOf(garden)])),
    [gardens]
  );
}
