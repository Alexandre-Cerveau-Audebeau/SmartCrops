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

export interface ExternalResourceLink {
  key: string;
  labelKey: string;
  descriptionKey: string;
  href: string;
  kind: ResourceLinkKind;
  isNew: boolean;
}

const ITEMS = 'plantDetail.externalResources.items';

function mk(
  key: string,
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
  const lang = args.lang || 'en';
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
