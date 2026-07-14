import type { Garden, GardenPlant } from '../types/Garden';
import { fetchJson } from './fetchJson';

const API_BASE = '/api';

// Every garden endpoint sits behind [Authorize] (GardensController) —
// credentials: 'include' so the HttpOnly auth cookie flows on each call.
// Non-OK responses reject with HttpStatusError (fetchJson contract, SMA-280);
// consumers narrow with `instanceof HttpStatusError`.

export async function fetchGardens(signal?: AbortSignal): Promise<Garden[]> {
  return fetchJson<Garden[]>(`${API_BASE}/gardens`, {
    credentials: 'include',
    signal,
  });
}

export async function fetchGarden(id: string, signal?: AbortSignal): Promise<Garden> {
  return fetchJson<Garden>(`${API_BASE}/gardens/${encodeURIComponent(id)}`, {
    credentials: 'include',
    signal,
  });
}

export async function createGarden(name: string, description?: string): Promise<Garden> {
  return fetchJson<Garden>(`${API_BASE}/gardens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ name, description }),
  });
}

export async function updateGarden(
  id: string,
  name: string,
  description?: string,
): Promise<Garden> {
  return fetchJson<Garden>(`${API_BASE}/gardens/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ name, description }),
  });
}

export async function deleteGarden(id: string): Promise<void> {
  return fetchJson<void>(`${API_BASE}/gardens/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
}

export async function addPlantToGarden(
  gardenId: string,
  plantId: string,
  notes?: string,
): Promise<void> {
  return fetchJson<void>(
    `${API_BASE}/gardens/${encodeURIComponent(gardenId)}/plants/${encodeURIComponent(plantId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(notes ? { notes } : {}),
    },
  );
}

export async function removePlantFromGarden(
  gardenId: string,
  plantId: string,
): Promise<void> {
  return fetchJson<void>(
    `${API_BASE}/gardens/${encodeURIComponent(gardenId)}/plants/${encodeURIComponent(plantId)}`,
    {
      method: 'DELETE',
      credentials: 'include',
    },
  );
}

export async function updatePlantNotes(
  gardenId: string,
  plantId: string,
  notes: string | null,
): Promise<GardenPlant> {
  return fetchJson<GardenPlant>(
    `${API_BASE}/gardens/${encodeURIComponent(gardenId)}/plants/${encodeURIComponent(plantId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ notes }),
    },
  );
}
