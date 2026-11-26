import { describe, expect, it } from 'vitest';
import { WEATHER_BEARING_BLOCKS, WEATHER_BEARING_FIGURES, weatherDisclaimerVisible } from './weatherDisclaimer';
import { DEFAULT_KEY_FIGURES, KEY_FIGURES, type KeyFigure } from './blocks/keyFiguresOptions';
import { DASHBOARD_BLOCK_KEYS, type DashboardBlock, type DashboardBlockKey, type DashboardSize } from '../../types/Dashboard';
import type { WeatherStatus } from '../../types/DashboardWeather';

// SMA-387 — the warning follows the visible weather, and never less (review
// round 1, G1 — GitHub 4067551264). The invariant is pinned on the function
// alone here, on every subset of the weather-bearing widgets; the page test
// (`GardensDashboard.disclaimer.test.tsx`) pins it through the stored layout.

/** Places by status only — the function reads nothing else of a place. */
const places = (...statuses: WeatherStatus[]) => statuses.map((status) => ({ status }));

/** `isBlockVisible` for a layout where exactly `visible` are on the page. */
const layoutWith = (visible: readonly DashboardBlockKey[]) => (key: DashboardBlockKey) =>
  visible.includes(key);

/** Every subset of the three weather-bearing widgets — the empty one included. */
const SUBSETS: readonly (readonly DashboardBlockKey[])[] = Array.from(
  { length: 1 << WEATHER_BEARING_BLOCKS.length },
  (_, mask) => WEATHER_BEARING_BLOCKS.filter((_, index) => mask & (1 << index))
);

/**
 * The five widgets that never bear the weather by being ON the page. The Key
 * figures band is NEITHER a bearer nor one of them: it bears the weather by
 * what it SHOWS (A-N8, 23/09 — see its own describe below). Nor, since
 * SMA-482 (D4), is the Gardens widget a bearer by its presence: it bears the
 * weather by what it DRAWS, its MÉTÉO column — its own input, `gardens`, and
 * its own describe below.
 */
const NON_BEARING = DASHBOARD_BLOCK_KEYS.filter(
  (key) => !(WEATHER_BEARING_BLOCKS as readonly DashboardBlockKey[]).includes(key) && key !== 'keyfigures'
);

/** The Gardens widget on the page at `size`, with `options` — what the page hands the rule (SMA-482, D4). */
const gardensAt = (size: DashboardSize, options: Record<string, unknown> | null = null): Pick<DashboardBlock, 'size' | 'options'> => ({
  size,
  options,
});

describe('weatherDisclaimerVisible — with data, the warning follows the weather-bearing widgets', () => {
  it('enumerates the eight subsets, the empty one included', () => {
    expect(SUBSETS).toHaveLength(8);
    expect(SUBSETS.filter((subset) => subset.length === 0)).toHaveLength(1);
    expect(NON_BEARING).toEqual(['gardens', 'month', 'counters', 'stats', 'harvest']);
  });

  // REWRITTEN by SMA-482 (D4): the five were said to « never count as
  // weather », the Gardens widget among them — its MÉTÉO column followed the
  // Weather widget. It is on the page here IN MEDIUM, whose list has no such
  // column: on the page, drawing no weather figure, counting for nothing.
  it.each(SUBSETS.map((subset) => [subset.length ? subset.join(' + ') : '(none)', subset] as const))(
    'visible %s → shown if and only if at least one is visible',
    (_label, subset) => {
      // The five non-bearing widgets are ALWAYS on the page here: none of them
      // draws a weather figure — the Gardens widget in Medium included —, nor
      // does the band, showing no weather figure.
      const isBlockVisible = layoutWith([...NON_BEARING, 'keyfigures', ...subset]);

      expect(
        weatherDisclaimerVisible({
          loading: false,
          error: false,
          locations: places('fresh'),
          isBlockVisible,
          keyFigures: ['free', 'occupancy', 'varieties', 'noplan'],
          cards: false,
          gardens: gardensAt('medium'),
        })
      ).toBe(subset.length > 0);
    }
  );

  it('counts a place’s LAST KNOWN weather as data (stale beside unavailable)', () => {
    expect(
      weatherDisclaimerVisible({
        loading: false,
        error: false,
        locations: places('unavailable', 'stale'),
        isBlockVisible: layoutWith(['todo']),
        keyFigures: [],
        cards: false,
        gardens: null,
      })
    ).toBe(true);
  });
});

describe('weatherDisclaimerVisible — absent when no surface shows a figure, whatever the layout', () => {
  // Every widget on the page, the band showing « À faire aujourd'hui » and
  // « Conseils »: the layout is never the reason here.
  const everything = layoutWith(DASHBOARD_BLOCK_KEYS);
  const keyFigures: KeyFigure[] = ['todo', 'tips', 'free', 'cities'];

  it('while the aggregate loads', () => {
    expect(
      weatherDisclaimerVisible({
        loading: true,
        error: false,
        locations: places('fresh'),
        isBlockVisible: everything,
        keyFigures,
        cards: false,
        gardens: null,
      })
    ).toBe(false);
  });

  it('behind a load error', () => {
    expect(
      weatherDisclaimerVisible({
        loading: false,
        error: true,
        locations: places('fresh'),
        isBlockVisible: everything,
        keyFigures,
        cards: false,
        gardens: null,
      })
    ).toBe(false);
  });

  it('when no place is located', () => {
    expect(
      weatherDisclaimerVisible({
        loading: false,
        error: false,
        locations: places(),
        isBlockVisible: everything,
        keyFigures,
        cards: false,
        gardens: null,
      })
    ).toBe(false);
  });

  it('when every place is unavailable', () => {
    expect(
      weatherDisclaimerVisible({
        loading: false,
        error: false,
        locations: places('unavailable', 'unavailable'),
        isBlockVisible: everything,
        keyFigures,
        cards: false,
        gardens: null,
      })
    ).toBe(false);
  });
});

// SMA-437 lot 1, PR B, step B6 (A-N8, 23/09: « Un avertissement en trop ne
// coûte rien ; un en moins violerait le contrat (V1) ») — the Key figures band
// is a bearer of the warning as soon as it SHOWS « À faire aujourd'hui » or
// « Conseils », figures derived in part from the forecast. Its VISIBLE figures
// are what the rule reads — none when it is hidden — whatever its own state.

/** The band hidden, shown without a weather figure, and shown with its defaults (« À faire aujourd'hui »). */
const BAND_STATES: ReadonlyArray<readonly [string, readonly KeyFigure[]]> = [
  ['hidden', []],
  ['showing no weather figure', ['free', 'occupancy', 'varieties', 'noplan']],
  ['showing its defaults, « À faire aujourd’hui » among them', DEFAULT_KEY_FIGURES],
];

/** Every set of four of the 22 figures — C(22, 4). */
function everySetOfFour(): KeyFigure[][] {
  const sets: KeyFigure[][] = [];
  const all = [...KEY_FIGURES];
  for (let a = 0; a < all.length; a += 1)
    for (let b = a + 1; b < all.length; b += 1)
      for (let c = b + 1; c < all.length; c += 1)
        for (let d = c + 1; d < all.length; d += 1) sets.push([all[a]!, all[b]!, all[c]!, all[d]!]);
  return sets;
}

describe('weatherDisclaimerVisible — the Key figures band bears the weather by what it shows (A-N8)', () => {
  it('names the two figures that read the forecast: « À faire aujourd’hui » and « Conseils »', () => {
    expect([...WEATHER_BEARING_FIGURES]).toEqual(['todo', 'tips']);
  });

  it('shows the warning for a band showing « À faire aujourd’hui », with no other bearer on the page', () => {
    expect(
      weatherDisclaimerVisible({
        loading: false,
        error: false,
        locations: places('fresh'),
        isBlockVisible: layoutWith([...NON_BEARING, 'keyfigures']),
        keyFigures: DEFAULT_KEY_FIGURES,
        cards: false,
        gardens: null,
      })
    ).toBe(true);
  });

  it.each(
    SUBSETS.flatMap((subset) =>
      BAND_STATES.map(([band, figures]) => [subset.length ? subset.join(' + ') : '(none)', band, subset, figures] as const)
    )
  )('visible %s, the band %s → shown if and only if a bearer is on the page or the band shows a weather figure', (_l, _b, subset, figures) => {
    const bandBears = figures.some((figure) => (WEATHER_BEARING_FIGURES as readonly KeyFigure[]).includes(figure));
    expect(
      weatherDisclaimerVisible({
        loading: false,
        error: false,
        locations: places('fresh'),
        isBlockVisible: layoutWith([...NON_BEARING, ...(figures.length ? (['keyfigures'] as const) : []), ...subset]),
        keyFigures: figures,
        cards: false,
        gardens: null,
      })
    ).toBe(subset.length > 0 || bandBears);
  });

  it('never less warning than visible weather — on every one of the 7 315 sets of four figures', () => {
    const sets = everySetOfFour();
    expect(sets).toHaveLength(7315);
    let bearing = 0;
    for (const figures of sets) {
      const shows = figures.includes('todo') || figures.includes('tips');
      if (shows) bearing += 1;
      const shown = weatherDisclaimerVisible({
        loading: false,
        error: false,
        locations: places('fresh'),
        isBlockVisible: layoutWith([...NON_BEARING, 'keyfigures']),
        keyFigures: figures,
        cards: false,
        gardens: null,
      });
      // Never less (V1) — and, with nothing else bearing, never more.
      expect(shown, figures.join(',')).toBe(shows);
    }
    // C(22, 4) − C(20, 4): the sets holding at least one of the two.
    expect(bearing).toBe(7315 - 4845);
  });
});

// SMA-448, lot F2 (V1, contract § 6 « ce que la v3 ajoute », 1) — the Novice
// page bears the warning as soon as one of its cards shows a weather figure:
// a bearer that is not a widget, said by the page from the derivation it
// draws the cards with. A page of widgets says `false` here.
describe('weatherDisclaimerVisible — the Novice page bears the weather by what its cards show (SMA-448, F2)', () => {
  /** The cards page draws no widget: no bearer, no band. */
  const noWidget = layoutWith([]);

  it('shows the warning when a card shows a weather figure, with no widget on the page at all', () => {
    expect(
      weatherDisclaimerVisible({
        loading: false,
        error: false,
        locations: places('fresh'),
        isBlockVisible: noWidget,
        keyFigures: [],
        cards: true,
        gardens: null,
      })
    ).toBe(true);
  });

  it('shows none when no card shows one — the same page, no widget', () => {
    expect(
      weatherDisclaimerVisible({
        loading: false,
        error: false,
        locations: places('fresh'),
        isBlockVisible: noWidget,
        keyFigures: [],
        cards: false,
        gardens: null,
      })
    ).toBe(false);
  });

  it('never behind a load error nor while the aggregate loads, whatever the cards say: no card can show a figure then', () => {
    for (const [loading, error] of [
      [true, false],
      [false, true],
    ] as const) {
      expect(
        weatherDisclaimerVisible({ loading, error, locations: places('fresh'), isBlockVisible: noWidget, keyFigures: [], cards: true, gardens: null }),
        `loading ${loading}, error ${error}`
      ).toBe(false);
    }
  });
});

// SMA-482 (D4 — the provider's terms, V1 of the contract: the warning is never
// absent while a weather figure is on the screen) — the Gardens widget bears
// the warning while it DRAWS its MÉTÉO column: on the page of widgets, at a
// size whose table has one — the Large, the Full width — with its own option
// on (`drawsWeatherColumn`, the very rule the page draws the column by). By
// what it draws, as the band; whatever its own state, as To-do and Tips; the
// rows it shows are not read.
describe('weatherDisclaimerVisible — the Gardens widget bears the weather while it draws its MÉTÉO column (SMA-482, D4)', () => {
  /** On the page, and no other bearer: the five non-bearing widgets and the band, showing no weather figure. */
  const noOtherBearer = layoutWith([...NON_BEARING, 'keyfigures']);
  const calm: KeyFigure[] = ['free', 'occupancy', 'varieties', 'noplan'];

  const STATES: ReadonlyArray<readonly [string, Pick<DashboardBlock, 'size' | 'options'>, boolean]> = [
    ['in Large, its option untouched: shown', gardensAt('large'), true],
    ['in the Full width, its option untouched: shown', gardensAt('wide'), true],
    ['in Large, its option on beside its count: shown', gardensAt('large', { weather: true, count: 5 }), true],
    ['in the Full width, a value of another type: shown', gardensAt('wide', { weather: 'yes' }), true],
    ['in Large, its option off: none', gardensAt('large', { weather: false }), false],
    ['in the Full width, its option off: none', gardensAt('wide', { weather: false, sort: 'name' }), false],
    ['in Medium, whose list has no MÉTÉO column: none', gardensAt('medium'), false],
    ['in Small, which has none either: none', gardensAt('small'), false],
  ];

  it.each(STATES)('the Gardens widget %s — with no other bearer on the page', (_label, gardens, shown) => {
    expect(
      weatherDisclaimerVisible({
        loading: false,
        error: false,
        locations: places('fresh'),
        isBlockVisible: noOtherBearer,
        keyFigures: calm,
        cards: false,
        gardens,
      })
    ).toBe(shown);
  });

  it.each(
    SUBSETS.flatMap((subset) =>
      [true, false].map((drawn) => [subset.length ? subset.join(' + ') : '(none)', drawn ? 'drawing' : 'not drawing', subset, drawn] as const)
    )
  )('visible %s, the Gardens widget %s its column → shown if and only if a bearer is on the page or the column is drawn', (_l, _d, subset, drawn) => {
    expect(
      weatherDisclaimerVisible({
        loading: false,
        error: false,
        locations: places('fresh'),
        isBlockVisible: layoutWith([...NON_BEARING, 'keyfigures', ...subset]),
        keyFigures: calm,
        cards: false,
        gardens: drawn ? gardensAt('large') : gardensAt('large', { weather: false }),
      })
    ).toBe(subset.length > 0 || drawn);
  });

  it('the cards page draws no widget: no Gardens widget handed, so none of its warning — its cards bear their own (F2)', () => {
    expect(
      weatherDisclaimerVisible({
        loading: false,
        error: false,
        locations: places('fresh'),
        isBlockVisible: layoutWith([]),
        keyFigures: [],
        cards: false,
        gardens: null,
      })
    ).toBe(false);
  });

  it('the other conditions stand, the column drawn: none while the aggregate loads, behind an error, with no place, with every place unavailable — and a LAST KNOWN weather is data', () => {
    const drawn = gardensAt('wide');
    const cases = [
      ['while the aggregate loads', true, false, places('fresh')],
      ['behind a load error', false, true, places('fresh')],
      ['when no place is located', false, false, places()],
      ['when every place is unavailable', false, false, places('unavailable', 'unavailable')],
    ] as const;
    for (const [label, loading, error, locations] of cases) {
      expect(
        weatherDisclaimerVisible({ loading, error, locations, isBlockVisible: noOtherBearer, keyFigures: calm, cards: false, gardens: drawn }),
        label
      ).toBe(false);
    }
    expect(
      weatherDisclaimerVisible({
        loading: false,
        error: false,
        locations: places('unavailable', 'stale'),
        isBlockVisible: noOtherBearer,
        keyFigures: calm,
        cards: false,
        gardens: drawn,
      })
    ).toBe(true);
  });
});
