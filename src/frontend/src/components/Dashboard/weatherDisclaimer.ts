import type { DashboardBlockKey } from '../../types/Dashboard';
import type { WeatherLocation } from '../../types/DashboardWeather';

/**
 * SMA-387 — the WeatherAPI.com terms of service ask for a clear, prominent
 * warning for the end user wherever weather data from the API is shown. The
 * dashboard carries ONE, under the grid; this module decides WHEN, as a pure
 * function the page calls and the tests pin.
 *
 * The invariant it guarantees, in one line: the warning is NEVER absent while
 * a weather figure is on the page. The converse — never present without one —
 * is the presentation side (review round 1, G1 — GitHub 4067551264): with the
 * three weather-bearing widgets taken off the dashboard, a usable place kept
 * the warning rendered under a grid that showed no weather at all.
 */

/**
 * The widgets that draw a figure of the weather aggregate — the ones the
 * warning follows. The Gardens table's MÉTÉO column is NOT listed on purpose:
 * it follows the Weather widget's own visibility (`showWeatherColumn`), so it
 * is covered by `weather`. « Ce mois-ci » reads the aggregate for the place's
 * local month only and prints no weather figure, so it is out.
 */
export const WEATHER_BEARING_BLOCKS = [
  'weather',
  'todo',
  'tips',
] as const satisfies readonly DashboardBlockKey[];

export interface WeatherDisclaimerInput {
  /** The weather aggregate is still loading: every surface shows a skeleton. */
  loading: boolean;
  /** The aggregate could not be read: every surface shows the error, not a figure. */
  error: boolean;
  /** The places of the aggregate — only their status is read. */
  locations: readonly Pick<WeatherLocation, 'status'>[];
  /** Whether a widget is ON the page (`hidden: false` in the layout). */
  isBlockVisible: (key: DashboardBlockKey) => boolean;
}

/**
 * Whether the page shows the weather warning. True if and only if ALL of:
 * the aggregate is neither loading nor in error; at least one place carries
 * data a surface draws — « fresh » or « stale », i.e. anything but
 * « unavailable » (a status added later is treated as data, so the warning
 * errs on the side of showing); and at least one of `WEATHER_BEARING_BLOCKS`
 * is visible. A layout with every weather-bearing widget hidden shows no
 * weather figure, so it shows no warning either (G1).
 */
export function weatherDisclaimerVisible({
  loading,
  error,
  locations,
  isBlockVisible,
}: WeatherDisclaimerInput): boolean {
  if (loading || error) return false;
  if (!locations.some((place) => place.status !== 'unavailable')) return false;
  return WEATHER_BEARING_BLOCKS.some((key) => isBlockVisible(key));
}
