import type { Plant } from '../types/Plant';
import type { PlantType } from '../types/PlantType';

const API_BASE = '/api';

export async function fetchPlants(): Promise<Plant[]> {
  const res = await fetch(`${API_BASE}/plants`);
  if (!res.ok) throw new Error(`Failed to fetch plants: ${res.status}`);
  return res.json();
}

export async function fetchPlantTypes(): Promise<PlantType[]> {
  const res = await fetch(`${API_BASE}/planttypes`);
  if (!res.ok) throw new Error(`Failed to fetch plant types: ${res.status}`);
  return res.json();
}

export async function searchPlants(query: string, language: string): Promise<Plant[]> {
  const params = new URLSearchParams({ query, language });
  const res = await fetch(`${API_BASE}/plants/search?${params}`);
  if (!res.ok) throw new Error(`Failed to search plants: ${res.status}`);
  return res.json();
}
