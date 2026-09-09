import type {
  DashboardPreferences,
  SaveDashboardPreferences,
} from '../types/Dashboard';
import { fetchJson } from './fetchJson';

const API_BASE = '/api';

// DashboardController sits behind [Authorize] — `credentials: 'include'` so the
// HttpOnly auth cookie flows (SMA-280 policy: every call site states it).

/**
 * The caller's layout. Never 404s: a user who has never saved one receives
 * their level preset with `isPreset: true`.
 */
export async function fetchDashboardPreferences(
  signal?: AbortSignal
): Promise<DashboardPreferences> {
  return fetchJson<DashboardPreferences>(`${API_BASE}/dashboard/preferences`, {
    credentials: 'include',
    signal,
  });
}

/** Replaces the layout wholesale; 204 on success (fetchJson resolves void). */
export async function saveDashboardPreferences(
  preferences: SaveDashboardPreferences
): Promise<void> {
  return fetchJson<void>(`${API_BASE}/dashboard/preferences`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(preferences),
  });
}
