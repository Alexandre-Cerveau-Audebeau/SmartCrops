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

export type ReEnrichOutcome = 'matched' | 'no-match' | 'skipped';

export function classifyReEnrich(response: ReEnrichResponse): ReEnrichOutcome {
  if (response.skipped === true) return 'skipped';
  if (response.matched === true) return 'matched';
  return 'no-match';
}

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

export function reEnrichTrefle(plantId: string): Promise<ReEnrichResponse> {
  return postEnrich('trefle', plantId);
}

export function reEnrichPerenual(plantId: string): Promise<ReEnrichResponse> {
  return postEnrich('perenual', plantId);
}
