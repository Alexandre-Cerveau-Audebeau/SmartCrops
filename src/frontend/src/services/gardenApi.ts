import type { Garden, GardenListItem } from '../types/Garden';
import { fetchJson } from './fetchJson';

const API_BASE = '/api';

// Every garden endpoint sits behind [Authorize] (GardensController) —
// credentials: 'include' so the HttpOnly auth cookie flows on each call.
// Non-OK responses reject with HttpStatusError (fetchJson contract, SMA-280);
// consumers narrow with `instanceof HttpStatusError`.

// `lang` mirrors the plants list endpoints' unified locale key: the response's
// plant items carry a server-localized flat `commonName` (SMA-155).
export async function fetchGardens(
  signal?: AbortSignal,
  lang?: string,
): Promise<GardenListItem[]> {
  const qs = lang ? `?lang=${encodeURIComponent(lang)}` : '';
  return fetchJson<GardenListItem[]>(`${API_BASE}/gardens${qs}`, {
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

// addPlantToGarden was REMOVED (SMA-6 Option A) and the per-plant
// removePlantFromGarden/updatePlantNotes pair followed with the GardenPlants
// table (SMA-285): plants enter a garden by being PLACED in the planner
// (saveLayout), notes live on placements, membership IS placement.
