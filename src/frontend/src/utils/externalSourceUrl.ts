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
 * Heuristic: a URL is safe to render to a user when it doesn't still look
 * like an upstream API endpoint. Anything containing <c>/api/</c> in its
 * path is dropped — Trefle's <c>trefle.io/api/v1/species/{id}</c> falls
 * into this bucket today (no public catalogue page exists at a stable
 * slug-less URL), and so does any future source we haven't taught
 * {@link toUserFacingUrl} about yet.
 */
export function isUserFacingUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  return !/\/api\//i.test(url);
}
