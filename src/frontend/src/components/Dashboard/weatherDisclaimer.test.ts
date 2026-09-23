import { describe, expect, it } from 'vitest';
import { WEATHER_BEARING_BLOCKS, WEATHER_BEARING_FIGURES, weatherDisclaimerVisible } from './weatherDisclaimer';
import { DEFAULT_KEY_FIGURES, KEY_FIGURES, type KeyFigure } from './blocks/keyFiguresOptions';
import { DASHBOARD_BLOCK_KEYS, type DashboardBlockKey } from '../../types/Dashboard';
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
 * The five widgets that never draw a weather figure. The Key figures band is
 * NEITHER a bearer nor one of them: it bears the weather by what it SHOWS
 * (A-N8, 23/09 — see its own describe below).
 */
const NON_BEARING = DASHBOARD_BLOCK_KEYS.filter(
  (key) => !(WEATHER_BEARING_BLOCKS as readonly DashboardBlockKey[]).includes(key) && key !== 'keyfigures'
);

describe('weatherDisclaimerVisible — with data, the warning follows the weather-bearing widgets', () => {
  it('enumerates the eight subsets, the empty one included', () => {
    expect(SUBSETS).toHaveLength(8);
    expect(SUBSETS.filter((subset) => subset.length === 0)).toHaveLength(1);
    expect(NON_BEARING).toEqual(['gardens', 'month', 'counters', 'stats', 'harvest']);
  });

  it.each(SUBSETS.map((subset) => [subset.length ? subset.join(' + ') : '(none)', subset] as const))(
    'visible %s → shown if and only if at least one is visible',
    (_label, subset) => {
      // The five non-bearing widgets are ALWAYS on the page here: they must
      // never count as weather — nor must the band, showing no weather figure.
      const isBlockVisible = layoutWith([...NON_BEARING, 'keyfigures', ...subset]);

      expect(
        weatherDisclaimerVisible({
          loading: false,
          error: false,
          locations: places('fresh'),
          isBlockVisible,
          keyFigures: ['free', 'occupancy', 'varieties', 'noplan'],
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
      });
      // Never less (V1) — and, with nothing else bearing, never more.
      expect(shown, figures.join(',')).toBe(shows);
    }
    // C(22, 4) − C(20, 4): the sets holding at least one of the two.
    expect(bearing).toBe(7315 - 4845);
  });
});
