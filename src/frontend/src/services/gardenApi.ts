import type { Garden } from '../types/Garden';

const API_BASE = '/api';

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('smartcrops-token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function throwWithStatus(message: string, status: number): never {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  throw error;
}

export async function fetchGardens(signal?: AbortSignal): Promise<Garden[]> {
  const res = await fetch(`${API_BASE}/gardens`, { headers: authHeaders(), signal });
  if (!res.ok) throwWithStatus(`Failed to fetch gardens: ${res.status}`, res.status);
  return res.json();
}

export async function fetchGarden(id: string, signal?: AbortSignal): Promise<Garden> {
  const res = await fetch(`${API_BASE}/gardens/${encodeURIComponent(id)}`, {
    headers: authHeaders(),
    signal,
  });
  if (!res.ok) throwWithStatus(`Failed to fetch garden: ${res.status}`, res.status);
  return res.json();
}

export async function createGarden(name: string, description?: string): Promise<Garden> {
  const res = await fetch(`${API_BASE}/gardens`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ name, description }),
  });
  if (!res.ok) throwWithStatus(`Failed to create garden: ${res.status}`, res.status);
  return res.json();
}

export async function updateGarden(
  id: string,
  name: string,
  description?: string,
): Promise<Garden> {
  const res = await fetch(`${API_BASE}/gardens/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ name, description }),
  });
  if (!res.ok) throwWithStatus(`Failed to update garden: ${res.status}`, res.status);
  return res.json();
}

export async function deleteGarden(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/gardens/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throwWithStatus(`Failed to delete garden: ${res.status}`, res.status);
}

export async function addPlantToGarden(
  gardenId: string,
  plantId: string,
  notes?: string,
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/gardens/${encodeURIComponent(gardenId)}/plants/${encodeURIComponent(plantId)}`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: notes ? JSON.stringify({ notes }) : undefined,
    },
  );
  if (!res.ok) throwWithStatus(`Failed to add plant to garden: ${res.status}`, res.status);
}

export async function removePlantFromGarden(
  gardenId: string,
  plantId: string,
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/gardens/${encodeURIComponent(gardenId)}/plants/${encodeURIComponent(plantId)}`,
    {
      method: 'DELETE',
      headers: authHeaders(),
    },
  );
  if (!res.ok) throwWithStatus(`Failed to remove plant from garden: ${res.status}`, res.status);
}
