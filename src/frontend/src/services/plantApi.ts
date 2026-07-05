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
  // Query key is `lang` to match the list endpoints (CodeRabbit — unified locale key).
  const params = new URLSearchParams({ query, lang: language });
  const res = await fetch(`${API_BASE}/plants/search?${params}`, { signal });
  if (!res.ok) throw new Error(`Failed to search plants: ${res.status}`);
  return res.json();
}

// ── SMA-255 T4 — faceted finder ────────────────────────────────────────────
// The Library's single data path since T4: text search + structured filters +
// facet counts + REAL server pagination over the Typesense index, hydrated
// server-side into the same PlantListItemResponse items as /api/plants.
// fetchPlants/searchPlants above stay in place for now (cleanup ticket).

export interface FindPlantsParams {
  q?: string;
  lang?: string;
  page?: number;
  perPage?: number;
  plantTypeIds?: number[];
  // Enum multi-selects (SMA-9 T2). Values are the exact backend enum member
  // names (PascalCase) — the same strings facetCounts returns; validated
  // server-side against the enum vocabulary.
  careLevels?: string[];
  wateringNeedLevels?: string[];
  lifeCycles?: string[];
  growthRates?: string[];
}

export interface FacetValueCount {
  value: string;
  count: number;
}

export interface FacetFieldCounts {
  field: string;
  counts: FacetValueCount[];
}

export interface PlantFinderResult {
  items: Plant[];
  found: number;
  page: number;
  perPage: number;
  facetCounts: FacetFieldCounts[];
}

export async function findPlants(
  params: FindPlantsParams,
  signal?: AbortSignal
): Promise<PlantFinderResult> {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  // Query key is `lang` — same unified locale key as the list endpoints.
  if (params.lang) qs.set('lang', params.lang);
  if (params.page !== undefined) qs.set('page', String(params.page));
  if (params.perPage !== undefined) qs.set('perPage', String(params.perPage));
  // Multi-selects go as repeated keys (?plantTypeIds=1&plantTypeIds=3) —
  // ASP.NET's default array binding.
  const multiSelects: Array<[string, Array<string | number> | undefined]> = [
    ['plantTypeIds', params.plantTypeIds],
    ['careLevels', params.careLevels],
    ['wateringNeedLevels', params.wateringNeedLevels],
    ['lifeCycles', params.lifeCycles],
    ['growthRates', params.growthRates],
  ];
  for (const [key, values] of multiSelects) {
    for (const value of values ?? []) {
      qs.append(key, String(value));
    }
  }
  const res = await fetch(`${API_BASE}/plants/finder?${qs}`, { signal });
  if (!res.ok) throw new Error(`Failed to find plants: ${res.status}`);
  return res.json();
}
