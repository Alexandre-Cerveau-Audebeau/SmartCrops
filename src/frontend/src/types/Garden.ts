import type { Plant } from './Plant';

/** One indoor light slot — "HH:mm" 24h, start < end (SMA-285). */
export interface LightSlot {
  start: string;
  end: string;
}

/**
 * Exposure config block (SMA-285 / SMA-17): served by GET /{id} and the
 * layout endpoints. All nullable — the app-level defaults (hemisphere
 * null -> 'N', latitudeBand null -> 'mid') belong to the future READ-time
 * exposure engine (5.3-C), never to storage.
 */
export interface GardenConfig {
  orientation: string | null;
  gardenType: string | null;
  lightSchedule: LightSlot[] | null;
  hemisphere: string | null;
  latitudeBand: string | null;
}

/**
 * GET /api/gardens/{id} — the GardenResponse DTO (SMA-285): the raw entity
 * (and its legacy gardenPlants graph) is no longer serialized. The planner
 * reads name/description; the config block feeds 5.3.
 */
export interface Garden {
  id: string;
  name: string;
  description?: string | null;
  layoutWidth?: number | null;
  layoutHeight?: number | null;
  cellSize?: string | null;
  orientation?: string | null;
  gardenType?: string | null;
  lightSchedule?: LightSlot[] | null;
  hemisphere?: string | null;
  latitudeBand?: string | null;
}

/**
 * GET /api/gardens list item (SMA-6 / SMA-155): `plants` holds the garden's
 * DISTINCT placed plants as the SAME list-DTO items the Library serves
 * (flat server-localized `commonName` + `scientificName`), so the shared
 * name resolver applies verbatim. The card counter is `plants.length`.
 */
export interface GardenListItem {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  plants: Plant[];
}
