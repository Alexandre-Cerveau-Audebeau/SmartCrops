import type { Plant } from '../types/Plant';
import type { PlantType } from '../types/PlantType';

const API_BASE = '/api';

export async function fetchPlants(signal?: AbortSignal, lang?: string): Promise<Plant[]> {
  const qs = lang ? `?lang=${encodeURIComponent(lang)}` : '';
  const res = await fetch(`${API_BASE}/plants${qs}`, { signal });
  if (!res.ok) throw new Error(`Failed to fetch plants: ${res.status}`);
  return res.json();
}

export async function fetchPlantTypes(signal?: AbortSignal): Promise<PlantType[]> {
  const res = await fetch(`${API_BASE}/planttypes`, { signal });
  if (!res.ok) throw new Error(`Failed to fetch plant types: ${res.status}`);
  return res.json();
}

export async function fetchPlantById(id: string, signal?: AbortSignal): Promise<Plant> {
  const res = await fetch(`${API_BASE}/plants/${encodeURIComponent(id)}`, { signal });
  if (!res.ok) {
    const error = new Error(`Failed to fetch plant: ${res.status}`) as Error & { status: number };
    error.status = res.status;
    throw error;
  }
  return res.json();
}

export async function searchPlants(query: string, language: string, signal?: AbortSignal): Promise<Plant[]> {
  const params = new URLSearchParams({ query, language });
  const res = await fetch(`${API_BASE}/plants/search?${params}`, { signal });
  if (!res.ok) throw new Error(`Failed to search plants: ${res.status}`);
  return res.json();
}
