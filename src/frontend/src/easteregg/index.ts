import type { Plant } from '../types/Plant';
import type { EasterEggEntry } from './types';
import { HIKARI } from './entries/hikari';
import { EASTER_EGGS_ENABLED } from './enabled';

/**
 * SMA-394 — the easter-egg registry.
 *
 * 🔴 ONE SWITCH: set EASTER_EGGS_ENABLED (in `enabled.ts`) to false and every
 * helper below returns its empty value, so no card appears in the library, no
 * slug resolves on the detail page and no override fires — without deleting a
 * single line.
 * Deleting the whole feature is: remove this folder, and remove the two marked
 * blocks in PlantDetail.tsx and PlantLibrary.tsx.
 *
 * ADDING A SECOND EASTER EGG: write one more file in `entries/` exporting an
 * EasterEggEntry, add it to EASTER_EGGS below. Nothing else changes — not the
 * pages, not the routes, not the tests of the real application.
 */
const EASTER_EGGS: readonly EasterEggEntry[] = [HIKARI];

/** Normalise a typed query the way the registry's keys are written. */
function normalise(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * The entry whose key the typed text matches EXACTLY — never fuzzy, never
 * prefix, which is why an easter egg can't be stumbled upon by browsing.
 * Called BEFORE the search hook runs, so a key never reaches the network.
 */
export function matchEasterEggKey(raw: string): EasterEggEntry | null {
  if (!EASTER_EGGS_ENABLED) return null;
  const key = normalise(raw);
  return EASTER_EGGS.find((egg) => egg.keys.includes(key)) ?? null;
}

/** The entry a detail-page id belongs to, if any. */
export function getEasterEggBySlug(
  id: string | undefined
): EasterEggEntry | null {
  if (!EASTER_EGGS_ENABLED || !id) return null;
  return EASTER_EGGS.find((egg) => egg.slug === id) ?? null;
}

/** The cards the library grid should show instead of the finder's results. */
export function getEasterEggCards(raw: string): Plant[] {
  const egg = matchEasterEggKey(raw);
  return egg ? [egg.card] : [];
}

export { EASTER_EGGS_ENABLED } from './enabled';
export type { EasterEggEntry } from './types';
