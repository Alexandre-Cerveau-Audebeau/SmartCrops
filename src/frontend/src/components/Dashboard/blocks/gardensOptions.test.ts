import { describe, expect, it } from 'vitest';
import { gardenFixture } from '../../../test/fixtures/dashboard';
import type { GardenSort } from '../../../types/Dashboard';
import {
  customOrderIds,
  defaultGardensCount,
  gardensCap,
  gardensOptions,
  isGardensCount,
  searchGardens,
  searchKey,
  sortGardens,
} from './gardensOptions';

// SMA-448, lot F5-a — the settings of the Gardens widget (V3-04; A-N3, A-N4,
// A-N5, A-N6): the reader of the stored document, and the rules of the five
// sorts, the cap and the search.

const GARDENER: readonly GardenSort[] = ['lastOpened', 'name', 'updated'];
const EXPERT: readonly GardenSort[] = ['lastOpened', 'name', 'created', 'updated', 'custom'];

const garden = (id: string, name: string, over: Parameters<typeof gardenFixture>[0] = {}) =>
  gardenFixture({ id, name, ...over });

describe('gardensOptions — the stored document, read carefully', () => {
  it('reads nothing as no count and the default sort', () => {
    expect(gardensOptions(null, EXPERT)).toEqual({ count: null, sort: 'lastOpened' });
    expect(gardensOptions(undefined, GARDENER)).toEqual({ count: null, sort: 'lastOpened' });
  });

  it('keeps a count of the list — 5, 8, 10 or « all » — and drops any other value', () => {
    expect(gardensOptions({ count: 5 }, EXPERT).count).toBe(5);
    expect(gardensOptions({ count: 10 }, EXPERT).count).toBe(10);
    expect(gardensOptions({ count: 'all' }, EXPERT).count).toBe('all');
    expect(gardensOptions({ count: 7 }, EXPERT).count).toBeNull();
    expect(gardensOptions({ count: '8' }, EXPERT).count).toBeNull();
    expect(gardensOptions({ count: 'tous' }, EXPERT).count).toBeNull();
    expect(isGardensCount(0)).toBe(false);
  });

  it('keeps a sort the formula SERVES, and brings any other back to the default', () => {
    expect(gardensOptions({ sort: 'custom' }, EXPERT).sort).toBe('custom');
    // The Expert's custom order stored, read as a Gardener: not served, so
    // the default — never a sort the panel does not draw (R8).
    expect(gardensOptions({ sort: 'custom' }, GARDENER).sort).toBe('lastOpened');
    expect(gardensOptions({ sort: 'created' }, GARDENER).sort).toBe('lastOpened');
    expect(gardensOptions({ sort: 'byMoonPhase' }, EXPERT).sort).toBe('lastOpened');
    expect(gardensOptions({ sort: 3 }, EXPERT).sort).toBe('lastOpened');
  });

  it('takes the first served sort when the formula has no « Derniers ouverts », and the default when it serves none', () => {
    expect(gardensOptions({ sort: 'custom' }, ['name', 'updated']).sort).toBe('name');
    expect(gardensOptions(null, []).sort).toBe('lastOpened');
  });

  it('carries the keys another build owns', () => {
    expect(gardensOptions({ count: 8, sort: 'name', theme: 'soft' }, EXPERT)).toEqual({
      count: 8,
      sort: 'name',
      theme: 'soft',
    });
  });

  it('shows 8 on a desktop and 5 on a phone when the user never chose; « all » is no cap', () => {
    expect(defaultGardensCount(false)).toBe(8);
    expect(defaultGardensCount(true)).toBe(5);
    expect(gardensCap(10)).toBe(10);
    expect(gardensCap('all')).toBeNull();
  });
});

describe('sortGardens — the five sorts', () => {
  const opened = garden('a', 'Terrasse', {
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-02T00:00:00Z',
    lastOpenedAt: '2026-09-20T00:00:00Z',
  });
  const modified = garden('b', 'Balcon sud', {
    createdAt: '2026-09-03T00:00:00Z',
    updatedAt: '2026-09-25T00:00:00Z',
    lastOpenedAt: null,
  });
  const old = garden('c', 'Potager du fond', {
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-15T00:00:00Z',
    lastOpenedAt: '2026-09-10T00:00:00Z',
  });
  const all = [old, opened, modified];

  it('« Derniers ouverts »: the last opening, or the last modification for a garden never opened (the fallback)', () => {
    // Balcon sud was never opened but modified on the 25th — after the two
    // openings: reading α, it comes first.
    expect(sortGardens(all, 'lastOpened', 'fr').map((g) => g.name)).toEqual(['Balcon sud', 'Terrasse', 'Potager du fond']);
  });

  it('« Derniers ouverts » with the column empty is exactly « dernière modification »', () => {
    const never = all.map((g) => ({ ...g, lastOpenedAt: null }));
    expect(sortGardens(never, 'lastOpened', 'fr')).toEqual(sortGardens(never, 'updated', 'fr'));
  });

  it('« Ordre alphabétique »: A to Z, blind to case and to accents, in the page’s language', () => {
    const names = [garden('1', 'zinnia'), garden('2', 'Épinard'), garden('3', 'ail'), garden('4', 'ÉGLANTINE'), garden('5', 'Basilic')];
    expect(sortGardens(names, 'name', 'fr').map((g) => g.name)).toEqual(['ail', 'Basilic', 'ÉGLANTINE', 'Épinard', 'zinnia']);
  });

  it('« Date de création » and « Dernière modification »: the most recent first', () => {
    expect(sortGardens(all, 'created', 'fr').map((g) => g.id)).toEqual(['b', 'a', 'c']);
    expect(sortGardens(all, 'updated', 'fr').map((g) => g.id)).toEqual(['b', 'a', 'c']);
  });

  it('is stable and total: a tie breaks on the id, so two renders never disagree', () => {
    const tied = [garden('z', 'Un', { updatedAt: '2026-09-01T00:00:00Z' }), garden('a', 'Deux', { updatedAt: '2026-09-01T00:00:00Z' })];
    expect(sortGardens(tied, 'updated', 'fr').map((g) => g.id)).toEqual(['a', 'z']);
    expect(sortGardens([...tied].reverse(), 'updated', 'fr').map((g) => g.id)).toEqual(['a', 'z']);
  });

  it('never mutates the list it is given, and reads an unreadable instant as the oldest', () => {
    const input = [opened, modified];
    sortGardens(input, 'updated', 'fr');
    expect(input.map((g) => g.id)).toEqual(['a', 'b']);
    const broken = [garden('x', 'X', { updatedAt: 'not-a-date' }), garden('y', 'Y', { updatedAt: '2026-01-01T00:00:00Z' })];
    expect(sortGardens(broken, 'updated', 'fr').map((g) => g.id)).toEqual(['y', 'x']);
  });
});

describe('sortGardens — « Ordre personnalisé » (A-N5)', () => {
  const ranked2 = garden('r2', 'Deuxième', { sortOrder: 2, createdAt: '2026-01-01T00:00:00Z' });
  const ranked0 = garden('r0', 'Première', { sortOrder: 0, createdAt: '2026-01-02T00:00:00Z' });
  const ranked7 = garden('r7', 'Troisième', { sortOrder: 7, createdAt: '2026-01-03T00:00:00Z' });
  const fresh = garden('n1', 'Créé hier', { sortOrder: null, createdAt: '2026-09-27T00:00:00Z' });
  const fresher = garden('n2', 'Créé ce matin', { sortOrder: null, createdAt: '2026-09-28T00:00:00Z' });

  it('reads the server’s places, gaps included, the unranked gardens at the HEAD — newest first — without any write', () => {
    expect(sortGardens([ranked7, ranked2, fresh, ranked0, fresher], 'custom', 'fr').map((g) => g.id)).toEqual([
      'n2',
      'n1',
      'r0',
      'r2',
      'r7',
    ]);
    expect(customOrderIds([ranked7, ranked2, fresh, ranked0, fresher])).toEqual(['n2', 'n1', 'r0', 'r2', 'r7']);
  });

  it('reads a LOCAL order the same way: absent from the list first, then in its order — a deleted id is not found', () => {
    const order = ['r7', 'gone', 'r0', 'r2'];
    expect(sortGardens([ranked0, ranked2, ranked7, fresh], 'custom', 'fr', order).map((g) => g.id)).toEqual(['n1', 'r7', 'r0', 'r2']);
    expect(customOrderIds([ranked0, ranked2, ranked7, fresh], order)).toEqual(['n1', 'r7', 'r0', 'r2']);
  });

  it('breaks a tie at one place on the creation date, the most recent first', () => {
    const twin = garden('t', 'Jumeau', { sortOrder: 2, createdAt: '2026-05-01T00:00:00Z' });
    expect(sortGardens([ranked2, twin], 'custom', 'fr').map((g) => g.id)).toEqual(['t', 'r2']);
  });

  it('never scans the local order inside the comparator: an index built once per sort (PR #299, fix round 1, A)', () => {
    // An order whose `indexOf` throws: a comparator that scanned it would
    // throw; the index reads it once, through `map`, before any comparison.
    const order = Object.assign(['r7', 'r0', 'r2'], {
      indexOf: (): number => {
        throw new Error('the comparator scanned the order');
      },
    });
    expect(sortGardens([ranked0, ranked2, ranked7, fresh], 'custom', 'fr', order).map((g) => g.id)).toEqual(['n1', 'r7', 'r0', 'r2']);
  });

  it('pins the order of a thousand gardens — by the server’s places, and by a local order — as it was before the index', () => {
    // 1 000 gardens in a scrambled input: 900 ranked at the places 0…899
    // (a permutation), 100 never ranked, all created one minute apart.
    const many = Array.from({ length: 1000 }, (_, i) =>
      garden(`g${i}`, `Jardin ${i}`, {
        sortOrder: i < 900 ? (i * 7) % 900 : null,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
      })
    );
    const scrambled = [...many].reverse();
    const byPlaces = sortGardens(scrambled, 'custom', 'fr').map((g) => g.id);
    // The 100 unranked first, newest first (g999 … g900), then the 900 ranked by place 0 … 899.
    expect(byPlaces.slice(0, 100)).toEqual(Array.from({ length: 100 }, (_, i) => `g${999 - i}`));
    const ranked = many.filter((g) => g.sortOrder !== null).sort((a, b) => a.sortOrder! - b.sortOrder!);
    expect(byPlaces.slice(100)).toEqual(ranked.map((g) => g.id));
    // A local order of the thousand, scrambled by a fixed stride: read back exactly.
    const local = Array.from({ length: 1000 }, (_, i) => `g${(i * 383) % 1000}`);
    expect(sortGardens(scrambled, 'custom', 'fr', local).map((g) => g.id)).toEqual(local);
  });
});

describe('searchGardens — by the name, blind to case and accents, the hidden ones included', () => {
  const list = [garden('1', 'Grand verger'), garden('2', 'Verger bas'), garden('3', 'Potager'), garden('4', 'Pépinière')];

  it('normalizes a key: lower-cased, accents dropped, trimmed', () => {
    expect(searchKey('  PÉPINIÈRE ')).toBe('pepiniere');
    expect(searchKey('Verger')).toBe('verger');
  });

  it('finds every garden whose name contains the query, in the order given', () => {
    expect(searchGardens(list, 'verger').map((g) => g.id)).toEqual(['1', '2']);
    expect(searchGardens(list, 'VERGÉR').map((g) => g.id)).toEqual(['1', '2']);
    expect(searchGardens(list, 'pepin').map((g) => g.id)).toEqual(['4']);
    expect(searchGardens(list, 'verger nord')).toEqual([]);
  });

  it('answers every garden for an empty or blank query', () => {
    expect(searchGardens(list, '')).toHaveLength(4);
    expect(searchGardens(list, '   ')).toHaveLength(4);
  });
});
