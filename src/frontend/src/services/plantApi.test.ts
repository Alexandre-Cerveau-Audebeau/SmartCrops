import { afterEach, describe, expect, it, vi } from 'vitest';
import { findPlants } from './plantApi';

// SMA-9 T3 — pins findPlants' QUERY-STRING serialization, the layer under
// the hook's param building. The regression trap is the inverted safety
// traits: "Pet-safe"/"Human-safe" send an EXPLICIT false
// (isToxicToPets=false / isToxicToHumans=false), which a truthiness check
// in the serializer would silently drop — only `undefined` means "not
// filtered". Enum multi-selects must stay repeated keys alongside.

const emptyResult = {
  items: [],
  found: 0,
  page: 1,
  perPage: 24,
  facetCounts: [],
};

function mockFetch() {
  const spy = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(emptyResult),
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

const requestedUrl = (spy: ReturnType<typeof vi.fn>) =>
  new URL(spy.mock.calls[0]![0] as string, 'http://localhost');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('findPlants query serialization', () => {
  it('emits the explicit FALSE of the inverted safety traits', async () => {
    const spy = mockFetch();
    await findPlants({ isToxicToPets: false, isToxicToHumans: false });

    const url = requestedUrl(spy);
    expect(url.pathname).toBe('/api/plants/finder');
    expect(url.searchParams.get('isToxicToPets')).toBe('false');
    expect(url.searchParams.get('isToxicToHumans')).toBe('false');
  });

  it('emits true for a direct trait and omits undefined booleans entirely', async () => {
    const spy = mockFetch();
    await findPlants({ isEdible: true, page: 2 });

    const url = requestedUrl(spy);
    expect(url.searchParams.get('isEdible')).toBe('true');
    for (const absent of [
      'isIndoor',
      'isDroughtTolerant',
      'isToxicToPets',
      'isToxicToHumans',
    ]) {
      expect(url.searchParams.has(absent)).toBe(false);
    }
    expect(url.searchParams.get('page')).toBe('2');
  });

  it('keeps enum multi-selects as repeated keys alongside a boolean', async () => {
    const spy = mockFetch();
    await findPlants({
      careLevels: ['Easy', 'Medium'],
      plantTypeIds: [1, 3],
      isIndoor: true,
    });

    const url = requestedUrl(spy);
    expect(url.searchParams.getAll('careLevels')).toEqual(['Easy', 'Medium']);
    expect(url.searchParams.getAll('plantTypeIds')).toEqual(['1', '3']);
    expect(url.searchParams.get('isIndoor')).toBe('true');
  });
});
