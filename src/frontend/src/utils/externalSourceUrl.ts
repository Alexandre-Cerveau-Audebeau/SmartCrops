/**
 * `PlantSource.Url` persists the API endpoint we hit during enrichment
 * (handy for replay/debug) — those URLs serve JSON, and Perenual's even
 * needs an API key, so they're useless when followed from a user-facing
 * link. We rewrite the well-known patterns to the upstream's public
 * species page at render time; the database column stays untouched.
 *
 * <ul>
 *   <li>GBIF: <c>api.gbif.org/v1/species/{id}</c> → <c>www.gbif.org/species/{id}</c></li>
 *   <li>Perenual: <c>perenual.com/api/v{n}/species/details/{id}</c> →
 *       <c>perenual.com/plant-species-database-search-finder/species/{id}</c></li>
 * </ul>
 *
 * Unrecognised inputs pass through unchanged — better than dropping the
 * link entirely; the caller can use {@link isUserFacingUrl} to filter
 * out the API-looking residue when rendering.
 */
export function toUserFacingUrl(apiUrl: string | null | undefined): string | null {
  if (!apiUrl) return null;

  const gbifMatch = apiUrl.match(/^https?:\/\/api\.gbif\.org\/v1\/species\/(\d+)/i);
  if (gbifMatch) {
    return `https://www.gbif.org/species/${gbifMatch[1]}`;
  }

  const perenualMatch = apiUrl.match(
    /^https?:\/\/perenual\.com\/api\/v\d+\/species\/details\/(\d+)/i,
  );
  if (perenualMatch) {
    return `https://perenual.com/plant-species-database-search-finder/species/${perenualMatch[1]}`;
  }

  return apiUrl;
}

/**
 * Heuristic guard before rendering a `PlantSource.Url` as a clickable link.
 * Returns true only when the URL parses, uses `http:` or `https:`, and its
 * pathname doesn't still look like an upstream API endpoint.
 *
 * <ul>
 *   <li>Other schemes (<c>javascript:</c>, <c>data:</c>, <c>file:</c>) are
 *       rejected outright — defense-in-depth against a malformed
 *       <c>PlantSource.Url</c> reaching the DOM through a future ETL bug.</li>
 *   <li>The <c>/api/</c> test runs against <c>URL.pathname</c> rather than
 *       the raw string, so a domain like <c>api.example.com</c> doesn't
 *       trip the filter while a real path like <c>/api/v1/…</c> does.</li>
 *   <li>Trefle's <c>trefle.io/api/v1/species/{id}</c> still fails the
 *       pathname check, which is intended — no public catalogue page
 *       exists at a stable slug-less URL there yet.</li>
 * </ul>
 */
export function isUserFacingUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    return !/\/api\//i.test(parsed.pathname);
  } catch {
    return false;
  }
}
