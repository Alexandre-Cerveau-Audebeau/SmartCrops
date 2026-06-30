/**
 * Build the ordered list of external-resource links for Plant Detail section 12
 * (SMA-246). PURE: takes only plain data and returns i18n KEYS (resolved by the
 * component), never calls `t()` itself.
 *
 * Two kinds of link:
 * - `direct` — a canonical upstream page we can address by id, shown only when
 *   that id is present (GBIF taxon key, WFO id, the Perenual public page already
 *   vetted by the caller).
 * - `search` — a name-search URL on a catalogue that has no stable id in our DTO
 *   (POWO/IPNI/EPPO/PlantUse/Wikipedia). Always present; the scientific name is
 *   `encodeURIComponent`-escaped.
 *
 * Order matches the mockup: gbif, wfo, perenual, powo, ipni, eppo, plantuse,
 * wikipedia. Absent `direct` entries (no WFO id, no Perenual page) are omitted,
 * not rendered empty. Trefle is intentionally excluded — it has no stable public
 * catalogue page (consistent with `isUserFacingUrl` dropping it).
 */
export type ResourceLinkKind = 'direct' | 'search';

// The closed set of resource keys, in mockup order. Exported as a literal union
// so every consumer (the ABBREV map, the i18n `items.*` entries) is checked for
// exhaustiveness at compile time — adding a key here without its abbreviation /
// locale entry becomes a type error rather than a blank badge at runtime.
export const EXTERNAL_RESOURCE_KEYS = [
  'gbif',
  'wfo',
  'perenual',
  'powo',
  'ipni',
  'eppo',
  'plantuse',
  'wikipedia',
] as const;

export type ExternalResourceKey = (typeof EXTERNAL_RESOURCE_KEYS)[number];

export interface ExternalResourceLink {
  key: ExternalResourceKey;
  labelKey: string;
  descriptionKey: string;
  href: string;
  kind: ResourceLinkKind;
  isNew: boolean;
}

const ITEMS = 'plantDetail.externalResources.items';

function mk(
  key: ExternalResourceKey,
  href: string,
  kind: ResourceLinkKind,
  isNew: boolean
): ExternalResourceLink {
  return {
    key,
    labelKey: `${ITEMS}.${key}.name`,
    descriptionKey: `${ITEMS}.${key}.desc`,
    href,
    kind,
    isNew,
  };
}

export function buildExternalResourceLinks(args: {
  scientificName: string;
  gbifTaxonKey: number | null;
  wfoId: string | null;
  /** Perenual public-page URL, already vetted by the caller via isUserFacingUrl. */
  perenualUserUrl: string | null;
  /** UI language for the Wikipedia subdomain; falls back to English. */
  lang?: string | null;
}): ExternalResourceLink[] {
  const enc = encodeURIComponent(args.scientificName);
  // Wikipedia hosts use the bare primary subtag (`fr`, not `fr-CA`), so fold any
  // region/script tag away — matching CommonNamesSection's locale handling.
  const lang = (args.lang || 'en').split(/[-_]/)[0].toLowerCase() || 'en';
  const links: ExternalResourceLink[] = [];

  // ── Direct (id-addressable, omitted when the id is absent) ──────────────
  if (args.gbifTaxonKey != null) {
    links.push(
      mk(
        'gbif',
        `https://www.gbif.org/species/${args.gbifTaxonKey}`,
        'direct',
        false
      )
    );
  }
  if (args.wfoId != null) {
    links.push(
      mk(
        'wfo',
        `https://www.worldfloraonline.org/taxon/${args.wfoId}`,
        'direct',
        true
      )
    );
  }
  if (args.perenualUserUrl != null) {
    links.push(mk('perenual', args.perenualUserUrl, 'direct', false));
  }

  // ── Search (name-keyed catalogues, always present) ──────────────────────
  links.push(
    mk('powo', `https://powo.science.kew.org/results?q=${enc}`, 'search', true)
  );
  links.push(
    mk('ipni', `https://www.ipni.org/search?q=${enc}`, 'search', true)
  );
  links.push(mk('eppo', `https://gd.eppo.int/search?k=${enc}`, 'search', true));
  links.push(
    mk(
      'plantuse',
      `https://uses.plantnet-project.org/en/Special:Search?search=${enc}`,
      'search',
      true
    )
  );
  links.push(
    mk(
      'wikipedia',
      `https://${lang}.wikipedia.org/wiki/Special:Search?search=${enc}`,
      'search',
      true
    )
  );

  return links;
}
