import type { GardenConfig } from '../types/Garden';
import { fetchJson } from './fetchJson';

export interface GardenLayoutData {
  width: number | null;
  height: number | null;
  cellSize: string | null;
  cellsJson: string | null;
  // SMA-285: exposure config block, served with the layout for 5.3.
  config: GardenConfig;
  placements: PlacementData[];
}

// plantName left the wire with SMA-285: display names are rebuilt client-side
// from the locale-keyed catalog via the shared resolver (getPlantDisplayName).
export interface PlacementData {
  id: string;
  plantId: string;
  plantScientificName: string | null;
  startRow: number;
  startCol: number;
  spanRows: number;
  spanCols: number;
  notes: string | null;
}

export interface SaveLayoutData {
  width: number;
  height: number;
  cellSize: string;
  cellsJson: string | null;
  placements: SavePlacementData[];
}

export interface SavePlacementData {
  plantId: string;
  startRow: number;
  startCol: number;
  spanRows: number;
  spanCols: number;
  notes: string | null;
}

// Layout endpoints sit behind [Authorize] like the rest of GardensController —
// credentials: 'include' so the HttpOnly auth cookie flows. Non-OK responses
// reject with HttpStatusError (fetchJson contract, SMA-280).

export async function fetchLayout(
  gardenId: string,
  signal?: AbortSignal,
): Promise<GardenLayoutData> {
  return fetchJson<GardenLayoutData>(
    `/api/gardens/${encodeURIComponent(gardenId)}/layout`,
    { credentials: 'include', signal },
  );
}

export async function saveLayout(
  gardenId: string,
  data: SaveLayoutData,
  signal?: AbortSignal,
): Promise<void> {
  return fetchJson<void>(`/api/gardens/${encodeURIComponent(gardenId)}/layout`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
    signal,
  });
}
