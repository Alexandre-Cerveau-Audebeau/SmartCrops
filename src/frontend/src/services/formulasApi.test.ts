import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogFor } from '../test/fixtures/formulas';
import { fetchFormulas, normalizeCatalog } from './formulasApi';

// SMA-448, lot F3 — the catalogue's boundary: what the choice screen and the
// planner read is what the server serves, checked; what does not hold is
// refused whole.

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('normalizeCatalog (SMA-448, lot F3)', () => {
  it('accepts the catalogue the server serves: three formulas, the account on one of them, every formula named once in its availability', () => {
    const served = catalogFor('gardener', {
      gardenCount: 5,
      largestGardenSize: { width: 30, height: 12 },
      unavailable: { novice: [{ kind: 'gardens', have: 5, limit: 3 }] },
    });

    const catalog = normalizeCatalog(JSON.parse(JSON.stringify(served)));

    expect(catalog.formulas.map((formula) => formula.key)).toEqual(['novice', 'gardener', 'expert']);
    expect(catalog.account).toEqual(served.account);
    expect(catalog.account.availability[0]).toEqual({
      formula: 'novice',
      current: false,
      available: false,
      reasons: [{ kind: 'gardens', have: 5, limit: 3 }],
    });
  });

  it('refuses a catalogue whose account is on a formula it does not serve', () => {
    const served = catalogFor('gardener');
    const raw = JSON.parse(JSON.stringify(served)) as { account: { formula: string } };
    raw.account.formula = 'master';

    expect(() => normalizeCatalog(raw)).toThrow(/does not serve|expected shape/);
  });

  it('refuses a reason of a kind this build does not know, rather than pass it to the screen', () => {
    const served = catalogFor('gardener');
    const raw = JSON.parse(JSON.stringify(served)) as { account: { availability: Array<{ reasons: unknown[] }> } };
    raw.account.availability[0]!.reasons = [{ kind: 'weather', quota: 3 }];

    expect(() => normalizeCatalog(raw)).toThrow(/expected shape/);
  });

  it('refuses a catalogue whose availability misses a formula', () => {
    const served = catalogFor('gardener');
    const raw = JSON.parse(JSON.stringify(served)) as { account: { availability: unknown[] } };
    raw.account.availability = raw.account.availability.slice(0, 2);

    expect(() => normalizeCatalog(raw)).toThrow(/every formula once/);
  });

  it('refuses a formula that does not hold together, through the same check as the layout’s capabilities', () => {
    const served = catalogFor('gardener');
    const raw = JSON.parse(JSON.stringify(served)) as { formulas: Array<{ widgets: unknown }> };
    raw.formulas[1]!.widgets = ['weather', 'telepathy'];

    expect(() => normalizeCatalog(raw)).toThrow(/unknown widget/);
  });
});

describe('fetchFormulas', () => {
  it('GETs /api/formulas with the cookie and returns the normalized catalogue', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(catalogFor('novice', { gardenCount: 2 })));
    vi.stubGlobal('fetch', fetchMock);

    const catalog = await fetchFormulas();

    expect(fetchMock).toHaveBeenCalledWith('/api/formulas', expect.objectContaining({ credentials: 'include' }));
    expect(catalog.account.formula).toBe('novice');
    expect(catalog.account.gardenCount).toBe(2);
  });
});
