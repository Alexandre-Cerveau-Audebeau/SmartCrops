import type { Garden, GardenListItem, GardenPlant } from '../types/Garden';
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

// addPlantToGarden was REMOVED (SMA-6 Option A): plants enter a garden by being
// placed in the planner (saveLayout) — the backend POST endpoint is gone too.

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
