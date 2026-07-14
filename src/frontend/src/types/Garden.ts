import type { Plant } from './Plant';

/**
 * DEPRECATED (SMA-6 Option A): rows of the legacy link table. Nothing creates
 * them anymore — placements are the sole plant-membership truth. Still served
 * by GET /api/gardens/{id} (GardenDetail notes editing / removal) until the
 * dedicated link-table DROP ticket.
 */
export interface GardenPlant {
  gardenId: string;
  plantId: string;
  addedAt: string;
  notes?: string;
  plant?: Plant;
}

/** Raw-entity detail shape — GET /api/gardens/{id} (GardenDetail, planner). */
export interface Garden {
  id: string;
  name: string;
  description?: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  gardenPlants: GardenPlant[];
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
