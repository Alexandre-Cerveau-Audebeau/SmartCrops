import { describe, expect, it } from 'vitest';
import {
  buildExternalResourceLinks,
  type ExternalResourceLink,
} from './externalResources';

const BASE = {
  scientificName: 'Solanum lycopersicum',
  gbifTaxonKey: 2930137 as number | null,
  wfoId: 'wfo-0001029216' as string | null,
  perenualUserUrl:
    'https://perenual.com/plant-species-database-search-finder/species/8759' as
      | string
      | null,
  lang: 'en' as string | null,
};

function build(overrides: Partial<typeof BASE> = {}): ExternalResourceLink[] {
  return buildExternalResourceLinks({ ...BASE, ...overrides });
}

function byKey(links: ExternalResourceLink[], key: string) {
  return links.find((l) => l.key === key);
}

describe('buildExternalResourceLinks', () => {
  it('emits the GBIF direct link from the taxon key, omits it when absent', () => {
    expect(byKey(build(), 'gbif')).toMatchObject({
      href: 'https://www.gbif.org/species/2930137',
      kind: 'direct',
      isNew: false,
    });
    expect(byKey(build({ gbifTaxonKey: null }), 'gbif')).toBeUndefined();
  });

  it('emits the WFO direct link (NEW) from the wfoId, omits it when null', () => {
    expect(byKey(build(), 'wfo')).toMatchObject({
      href: 'https://www.worldfloraonline.org/taxon/wfo-0001029216',
      kind: 'direct',
      isNew: true,
    });
    expect(byKey(build({ wfoId: null }), 'wfo')).toBeUndefined();
  });

  it('uses the vetted Perenual URL as-is, omits it when null', () => {
    expect(byKey(build(), 'perenual')).toMatchObject({
      href: BASE.perenualUserUrl,
      kind: 'direct',
      isNew: false,
    });
    expect(byKey(build({ perenualUserUrl: null }), 'perenual')).toBeUndefined();
  });

  it('always emits the five search links with the name encoded', () => {
    const links = build();
    for (const key of ['powo', 'ipni', 'eppo', 'plantuse', 'wikipedia']) {
      const l = byKey(links, key);
      expect(l).toBeDefined();
      expect(l!.kind).toBe('search');
      expect(l!.isNew).toBe(true);
      // The space in "Solanum lycopersicum" must be percent-encoded.
      expect(l!.href).toContain('Solanum%20lycopersicum');
      expect(l!.href).not.toContain('Solanum lycopersicum');
    }
  });

  it('exposes the expected search hosts', () => {
    const links = build();
    expect(byKey(links, 'powo')!.href).toContain(
      'powo.science.kew.org/results?q='
    );
    expect(byKey(links, 'ipni')!.href).toContain('www.ipni.org/search?q=');
    expect(byKey(links, 'eppo')!.href).toContain('gd.eppo.int/search?k=');
    expect(byKey(links, 'plantuse')!.href).toContain(
      'uses.plantnet-project.org/en/Special:Search?search='
    );
  });

  it('builds the Wikipedia subdomain from lang, defaulting to en', () => {
    expect(byKey(build({ lang: 'fr' }), 'wikipedia')!.href).toContain(
      'https://fr.wikipedia.org/'
    );
    expect(byKey(build({ lang: null }), 'wikipedia')!.href).toContain(
      'https://en.wikipedia.org/'
    );
  });

  it('folds a region-tagged locale to the primary Wikipedia subtag', () => {
    const href = byKey(build({ lang: 'fr-CA' }), 'wikipedia')!.href;
    expect(href).toContain('https://fr.wikipedia.org/');
    expect(href).not.toContain('fr-CA.wikipedia.org');
    // Underscore form + casing are normalized too.
    expect(byKey(build({ lang: 'EN_US' }), 'wikipedia')!.href).toContain(
      'https://en.wikipedia.org/'
    );
  });

  it('returns entries in the mockup order, omitting absent direct ones', () => {
    expect(build().map((l) => l.key)).toEqual([
      'gbif',
      'wfo',
      'perenual',
      'powo',
      'ipni',
      'eppo',
      'plantuse',
      'wikipedia',
    ]);
    // No GBIF key and no WFO id → both direct entries drop out, order preserved.
    expect(
      build({ gbifTaxonKey: null, wfoId: null }).map((l) => l.key)
    ).toEqual(['perenual', 'powo', 'ipni', 'eppo', 'plantuse', 'wikipedia']);
  });

  it('returns i18n keys (not resolved strings) for label and description', () => {
    const gbif = byKey(build(), 'gbif')!;
    expect(gbif.labelKey).toBe('plantDetail.externalResources.items.gbif.name');
    expect(gbif.descriptionKey).toBe(
      'plantDetail.externalResources.items.gbif.desc'
    );
  });
});
