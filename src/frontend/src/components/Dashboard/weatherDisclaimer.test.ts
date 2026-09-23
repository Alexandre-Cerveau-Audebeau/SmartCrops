import { describe, expect, it } from 'vitest';
import { WEATHER_BEARING_BLOCKS, weatherDisclaimerVisible } from './weatherDisclaimer';
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

/** The six widgets that draw no weather figure. */
const NON_BEARING = DASHBOARD_BLOCK_KEYS.filter(
  (key) => !(WEATHER_BEARING_BLOCKS as readonly DashboardBlockKey[]).includes(key)
);

describe('weatherDisclaimerVisible — with data, the warning follows the weather-bearing widgets', () => {
  it('enumerates the eight subsets, the empty one included', () => {
    expect(SUBSETS).toHaveLength(8);
    expect(SUBSETS.filter((subset) => subset.length === 0)).toHaveLength(1);
    // SMA-437 lot 1, PR B, step B1: the Key figures band is a block now, and
    // it draws no figure yet — the page renders it as an invitation until its
    // widget lands.
    expect(NON_BEARING).toEqual(['gardens', 'month', 'counters', 'stats', 'harvest', 'keyfigures']);
  });

  it.each(SUBSETS.map((subset) => [subset.length ? subset.join(' + ') : '(none)', subset] as const))(
    'visible %s → shown if and only if at least one is visible',
    (_label, subset) => {
      // The six non-bearing widgets are ALWAYS on the page here: they must
      // never count as weather.
      const isBlockVisible = layoutWith([...NON_BEARING, ...subset]);

      expect(
        weatherDisclaimerVisible({
          loading: false,
          error: false,
          locations: places('fresh'),
          isBlockVisible,
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
      })
    ).toBe(true);
  });
});

describe('weatherDisclaimerVisible — absent when no surface shows a figure, whatever the layout', () => {
  // Every widget on the page: the layout is never the reason here.
  const everything = layoutWith(DASHBOARD_BLOCK_KEYS);

  it('while the aggregate loads', () => {
    expect(
      weatherDisclaimerVisible({
        loading: true,
        error: false,
        locations: places('fresh'),
        isBlockVisible: everything,
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
      })
    ).toBe(false);
  });
});
