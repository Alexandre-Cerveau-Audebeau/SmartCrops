export interface GardenLayoutData {
  width: number | null;
  height: number | null;
  cellSize: string | null;
  cellsJson: string | null;
  placements: PlacementData[];
}

export interface PlacementData {
  id: string;
  plantId: string;
  plantName: string | null;
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

export async function fetchLayout(gardenId: string): Promise<GardenLayoutData> {
  const res = await fetch(`/api/gardens/${gardenId}/layout`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load layout');
  return res.json();
}

export async function saveLayout(gardenId: string, data: SaveLayoutData): Promise<void> {
  const res = await fetch(`/api/gardens/${gardenId}/layout`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to save layout');
}
