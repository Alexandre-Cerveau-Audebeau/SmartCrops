import type { GardenViews } from '../../hooks/useGardenViews';
import type { DashboardGardenData, DashboardVarietyData } from '../../types/DashboardData';
import type { DashboardWeatherData, WeatherCurrent, WeatherLocation } from '../../types/DashboardWeather';
import type { GardenView } from '../../utils/gardenStats';
import type { KeyFiguresWeatherStatus } from './blocks/keyFigures';
import { varietyName } from './blocks/plantCalendar';
import { todoTasks, type TodoTask, type TodoTaskKind } from './blocks/todoTasks';

/**
 * SMA-448, lot F2 (SMA-436) — what a card of the Novice page SAYS of its
 * garden, derived ONCE for the page: the render draws it, the weather warning
 * reads it (V1), so the two cannot disagree — the rule of
 * `docs/coding-guidelines.md`, « a section's visibility gate and its render
 * derive from the same parse ».
 */

/**
 * The weather a card shows in its foot. The page's ONE weather derivation
 * feeds it (`displayWeather`, contract A-4): none while the aggregate is in
 * failure, so a failed weather feeds neither a temperature nor a task read
 * from a forecast — « une page ne se contredit jamais ».
 */
export type NoviceCardWeather =
  /** The aggregate is still loading: a skeleton where the figure will be. */
  | { kind: 'loading' }
  /** The aggregate could not be read: « Sans météo », never a kept figure. */
  | { kind: 'unavailable' }
  /** The garden has no city: the dashed « Ajouter une ville ». */
  | { kind: 'unlocated' }
  /** Located, but the provider had nothing to say of the place: the place and a dash, never an invented figure. */
  | { kind: 'silent'; place: WeatherLocation }
  /** The temperature of the moment, at the garden's own city. */
  | { kind: 'figure'; place: WeatherLocation; current: WeatherCurrent };

export interface NoviceCard {
  garden: DashboardGardenData;
  /** The derived view of the garden's plan — the page's shared derivation (`useGardenViews`). */
  view: GardenView | undefined;
  /** The names of its varieties, distinct, in the plan's order — what the card lists. */
  plants: string[];
  /** Its task of the day — the first `todoTasks` derives for it — or null. */
  task: TodoTask | null;
  weather: NoviceCardWeather;
}

/**
 * The kinds of task read from a FORECAST — watering tonight, the cold, the
 * frost. Shown on a card, such a task is a figure of the weather (V1), like
 * the temperature beside it; « Tailler » and « Semer » come from the plans
 * and the catalog alone.
 */
export const FORECAST_TASK_KINDS: readonly TodoTaskKind[] = ['water', 'cold', 'frost'];

/**
 * The variety names a card lists: each placed variety once, in the order of
 * the plan's placements — the order `todoTasks` lists them in too, so the
 * card and its task name plants in one order.
 */
function plantsOf(
  garden: DashboardGardenData,
  byPlant: ReadonlyMap<string, DashboardVarietyData>
): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const placement of garden.placements) {
    if (seen.has(placement.plantId)) continue;
    seen.add(placement.plantId);
    const variety = byPlant.get(placement.plantId);
    if (variety) names.push(varietyName(variety));
  }
  return names;
}

/** The weather of one garden's foot, from the page's weather and the state of its aggregate. */
function weatherOf(
  gardenId: string,
  weather: DashboardWeatherData,
  status: KeyFiguresWeatherStatus
): NoviceCardWeather {
  if (status === 'loading') return { kind: 'loading' };
  if (status === 'error') return { kind: 'unavailable' };
  const link = weather.gardens.find((entry) => entry.gardenId === gardenId);
  const place = link?.locationKey
    ? weather.locations.find((candidate) => candidate.key === link.locationKey)
    : undefined;
  if (!place) return { kind: 'unlocated' };
  if (!place.current) return { kind: 'silent', place };
  return { kind: 'figure', place, current: place.current };
}

/**
 * The cards of the Novice page, one per garden, in the gardens' order — the
 * order the aggregate serves them in (newest first), which the page does not
 * choose (SMA-436, 25/09: reordering the cards is an idea for later, on
 * users' feedback).
 *
 * @param weather the page's `displayWeather`: the aggregate, or none while it is in failure (A-4).
 * @param status the state of the weather aggregate, for the foot of each card.
 */
export function noviceCardsOf(
  gardens: readonly DashboardGardenData[],
  varieties: readonly DashboardVarietyData[],
  views: GardenViews,
  weather: DashboardWeatherData,
  status: KeyFiguresWeatherStatus
): NoviceCard[] {
  const tasks = todoTasks(gardens, varieties, weather);
  const byPlant = new Map(varieties.map((variety) => [variety.plantId, variety]));
  return gardens.map((garden) => ({
    garden,
    view: views.get(garden.id),
    plants: plantsOf(garden, byPlant),
    task: tasks.find((task) => task.gardenId === garden.id) ?? null,
    weather: weatherOf(garden.id, weather, status),
  }));
}

/**
 * Whether a card shows a figure of the weather (V1, SMA-387): a temperature,
 * or a task read from a forecast. The page bears the weather warning as soon
 * as one card does.
 */
export function cardBearsWeather(card: NoviceCard): boolean {
  return (
    card.weather.kind === 'figure' ||
    (card.task !== null && FORECAST_TASK_KINDS.includes(card.task.kind))
  );
}
