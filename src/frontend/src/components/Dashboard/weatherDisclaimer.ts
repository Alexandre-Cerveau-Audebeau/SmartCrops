import type { DashboardBlock, DashboardBlockKey } from '../../types/Dashboard';
import type { WeatherLocation } from '../../types/DashboardWeather';
import { drawsWeatherColumn } from './blocks/gardensOptions';
import type { KeyFigure } from './blocks/keyFiguresOptions';

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
 * The widgets that draw a figure of the weather aggregate whenever they are on
 * the page — the ones the warning follows by their presence. The Gardens
 * widget is NOT listed: it draws one only in its MÉTÉO column, a setting of
 * its own (SMA-482), and bears the warning by what it draws — `gardens`
 * below. « Ce mois-ci » reads the aggregate for the place's local month only
 * and prints no weather figure, so it is out.
 */
export const WEATHER_BEARING_BLOCKS = [
  'weather',
  'todo',
  'tips',
] as const satisfies readonly DashboardBlockKey[];

/**
 * SMA-437 lot 1, PR B, step B6 (A-N8, 23/09) — the figures of the Key figures
 * band that count things derived in part from the forecast: « À faire
 * aujourd'hui » (the watering, cold and frost tasks) and « Conseils » (the
 * watering family). The band bears the warning while it SHOWS one of them —
 * by what it displays, not by being on the page: « Un avertissement en trop ne
 * coûte rien ; un en moins violerait le contrat (V1). »
 */
export const WEATHER_BEARING_FIGURES = ['todo', 'tips'] as const satisfies readonly KeyFigure[];

export interface WeatherDisclaimerInput {
  /** The weather aggregate is still loading: every surface shows a skeleton. */
  loading: boolean;
  /** The aggregate could not be read: every surface shows the error, not a figure. */
  error: boolean;
  /** The places of the aggregate — only their status is read. */
  locations: readonly Pick<WeatherLocation, 'status'>[];
  /** Whether a widget is ON the page (`hidden: false` in the layout). */
  isBlockVisible: (key: DashboardBlockKey) => boolean;
  /**
   * The figures the Key figures band SHOWS — its four, read through
   * `keyFiguresOptions` like the band itself — or none when it is off the
   * page or the formula has no band (A-N8).
   */
  keyFigures: readonly KeyFigure[];
  /**
   * SMA-448, lot F2 (V1, contract v3 § 6 — « ce que la v3 ajoute », 1) — the
   * Novice page shows a figure of the weather on at least one of its cards: a
   * temperature at the garden's city, or a task read from a forecast
   * (`cardBearsWeather`). A bearer that is not a widget: the page says it,
   * from the same derivation it draws the cards with. False on a page of
   * widgets, whose bearers are the inputs above and below.
   */
  cards: boolean;
  /**
   * SMA-482 (D4) — the Gardens widget as the page of widgets draws it, its
   * size and its options; null, or left out, when no Gardens widget is drawn
   * (the cards page). It bears the warning while it draws its MÉTÉO column —
   * `drawsWeatherColumn`, the very rule the page draws the column by —
   * whatever its own state, as the rule treats To-do and Tips: the rows it
   * shows are not read.
   */
  gardens?: Pick<DashboardBlock, 'size' | 'options'> | null;
}

/**
 * Whether the page shows the weather warning. True if and only if ALL of:
 * the aggregate is neither loading nor in error; at least one place carries
 * data a surface draws — « fresh » or « stale », i.e. anything but
 * « unavailable » (a status added later is treated as data, so the warning
 * errs on the side of showing); and at least one of `WEATHER_BEARING_BLOCKS`
 * is visible — or the Gardens widget draws its MÉTÉO column (SMA-482, D4) —
 * or the Key figures band shows one of `WEATHER_BEARING_FIGURES` (SMA-437,
 * A-N8), whatever its own state (skeleton, invitation), as the rule already
 * treats To-do and Tips — or a card of the Novice page shows a weather figure
 * (SMA-448, lot F2). A layout with every weather-bearing surface off the page
 * shows no weather figure, so it shows no warning either (G1).
 */
export function weatherDisclaimerVisible({
  loading,
  error,
  locations,
  isBlockVisible,
  keyFigures,
  cards,
  gardens = null,
}: WeatherDisclaimerInput): boolean {
  if (loading || error) return false;
  if (!locations.some((place) => place.status !== 'unavailable')) return false;
  const bearing: readonly KeyFigure[] = WEATHER_BEARING_FIGURES;
  return (
    WEATHER_BEARING_BLOCKS.some((key) => isBlockVisible(key)) ||
    (gardens !== null && drawsWeatherColumn(gardens)) ||
    keyFigures.some((figure) => bearing.includes(figure)) ||
    cards
  );
}
