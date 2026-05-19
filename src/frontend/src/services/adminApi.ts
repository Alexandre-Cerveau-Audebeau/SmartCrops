const API_BASE = '/api/admin';

/**
 * Shape returned by both `POST /api/admin/{trefle,perenual}/enrich/{plantId}`.
 * The backend uses three discriminated record types — Matched / NoMatch /
 * Skipped — which serialize to a flat JSON union; this interface mirrors the
 * union as optional fields. Use {@link classifyReEnrich} to discriminate.
 */
export interface ReEnrichResponse {
  matched?: boolean;
  skipped?: boolean;

  matchType?: string;
  reason?: string;

  trefleId?: number;
  trefleSlug?: string | null;
  commonNamesAdded?: number;
  synonymsAdded?: number;

  perenualId?: number;
  perenualScientificName?: string | null;
  pestsAdded?: number;
  longDescriptionsAdded?: number;
  isExactScientificMatch?: boolean;
  hasSupremeData?: boolean;

  imagesAdded?: number;
}

/**
 * Three terminal states for an admin re-enrichment call:
 * - `matched`: the upstream catalogue had data and our DB was updated.
 * - `no-match`: no candidate found; nothing was written.
 * - `skipped`: the plant is already flagged enriched for this source.
 */
export type ReEnrichOutcome = 'matched' | 'no-match' | 'skipped';

/**
 * Discriminate the flat union returned by the enrich endpoints into one of
 * the three {@link ReEnrichOutcome} values, in the priority order the
 * backend's record types are evaluated.
 */
export function classifyReEnrich(response: ReEnrichResponse): ReEnrichOutcome {
  if (response.skipped === true) return 'skipped';
  if (response.matched === true) return 'matched';
  return 'no-match';
}

/**
 * Shared POST helper for both Trefle and Perenual re-enrichment endpoints.
 * Throws on non-2xx with a `status` property attached so callers can
 * distinguish 401 / 403 / 500.
 */
async function postEnrich(source: 'trefle' | 'perenual', plantId: string): Promise<ReEnrichResponse> {
  // No `force=true` — first click respects the idempotency contract; the
  // Skipped toast tells the user the data is already fresh. Forcing a refetch
  // is a future "advanced admin" workflow not exposed in this UI.
  const res = await fetch(`${API_BASE}/${source}/enrich/${encodeURIComponent(plantId)}`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    const error = new Error(`Re-enrich (${source}) failed: ${res.status}`) as Error & {
      status: number;
    };
    error.status = res.status;
    throw error;
  }
  return res.json();
}

/** POST `/api/admin/trefle/enrich/{plantId}` and return the parsed response. */
export function reEnrichTrefle(plantId: string): Promise<ReEnrichResponse> {
  return postEnrich('trefle', plantId);
}

/** POST `/api/admin/perenual/enrich/{plantId}` and return the parsed response. */
export function reEnrichPerenual(plantId: string): Promise<ReEnrichResponse> {
  return postEnrich('perenual', plantId);
}
