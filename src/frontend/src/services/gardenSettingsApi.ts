import { fetchJson } from './fetchJson';

const API_BASE = '/api';

/**
 * SMA-448, lot F5-a — the two writes of the Gardens widget's settings that
 * live on the GARDEN, not in the layout (contract v3 A-N5, A-N6): the planner's
 * opening, and the account's own order. A module of their own, beside
 * `gardenApi`, so a suite that mocks the garden API whole (the planner's and
 * the dashboard's do) never finds these two reaching into the mock — and a
 * page that never writes them never imports them.
 *
 * Every route sits behind [Authorize] — `credentials: 'include'` so the
 * HttpOnly auth cookie flows (SMA-280 policy: every call site states it).
 */

/**
 * `POST /api/gardens/{id}/open` — the planner was opened on this garden: ONE
 * stamp, no history. 204; 404 for a garden the caller does not own — and 404
 * from a server before this lot, during the promotion window. The caller
 * never waits for it and never says a word of its failure.
 */
export async function openGarden(id: string): Promise<void> {
  return fetchJson<void>(`${API_BASE}/gardens/${encodeURIComponent(id)}/open`, {
    method: 'POST',
    credentials: 'include',
  });
}

/**
 * `PUT /api/gardens/order` — the account's gardens in the order the user set,
 * first to last, WITHOUT a ceiling. 204; 400 for an empty or a repeated id, or
 * an id that is not the caller's; 403 `formula.gardenOrder` for a formula
 * without the custom order (the server refuses what the panel does not draw —
 * R8). `signal` cancels a write a newer one has superseded.
 */
export async function saveGardenOrder(ids: readonly string[], signal?: AbortSignal): Promise<void> {
  return fetchJson<void>(`${API_BASE}/gardens/order`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    signal,
    body: JSON.stringify({ ids }),
  });
}
