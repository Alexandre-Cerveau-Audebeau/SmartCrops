import type { ReactNode } from 'react';
import CountersBlock from '../../components/Dashboard/blocks/CountersBlock';
import GardensBlock, { type GardensWeather } from '../../components/Dashboard/blocks/GardensBlock';
import InviteBlock from '../../components/Dashboard/blocks/InviteBlock';
import MonthBlock from '../../components/Dashboard/blocks/MonthBlock';
import StatsBlock from '../../components/Dashboard/blocks/StatsBlock';
import TipsBlock from '../../components/Dashboard/blocks/TipsBlock';
import TodoBlock from '../../components/Dashboard/blocks/TodoBlock';
import WeatherBlock from '../../components/Dashboard/blocks/WeatherBlock';
import { dashboardFixture, gardenFixture, varietyFixture } from '../fixtures/dashboard';
import { placement } from '../fixtures/placements';
import { linkFixture, locationFixture, weatherFixture, weekFixture } from '../fixtures/weather';
import { gardenViewOf } from '../../utils/gardenStats';
import { LAYOUT_NOW_MS } from './clock';
import { presetFor } from '../../constants/dashboardPresets';
import type { DashboardBlockKey, DashboardLevel, DashboardSize } from '../../types/Dashboard';
import type { DashboardGardenData, DashboardVarietyData } from '../../types/DashboardData';
import type { DashboardWeatherData } from '../../types/DashboardWeather';

/**
 * SMA-336 mobile lot, step 7 (pre-flight D7) — the SCENE the layout harness
 * measures: the twenty-nine widget states the pre-flight measured `5282852`
 * with, on the same data, so the numbers of that report and the numbers of
 * this test are the same measurements — and, since fix round 2 (#9), the
 * Medium Tips card with TWO gardens without orientation.
 *
 * Three gardens — Terrasse (10 × 8, south, a wall, a description), Balcon sud
 * (12 × 4, ornamental, NO orientation: the Tips invitation), Potager du fond
 * (13 × 6) — sixteen varieties and sixty-four placements, calendars keyed on
 * the month of the harness's FIXED instant (`clock.ts`, fix round 1 #8) so
 * the calendar widget is never idle and the measure is the same whichever
 * month the suite runs in, and the weather of Écully on the shared five-day week
 * (`weekFixture`: 14:30, six slots from 14 h, wind on Tuesday). Two weather
 * states: every garden located, and Balcon sud without a city — the
 * « 2/3 localisé » chip and the To-do / Weather invitations. Two more scenes
 * carry longer garden names, which is what reproduces V34 on a desktop.
 *
 * Synthetic fixtures throughout (`Tests/ExternalApis/WeatherApi/Fixtures` is
 * the backend's rule, `src/test/fixtures` the frontend's): no provider is
 * ever called, and the harness page disables `fetch` before it mounts.
 */

const MONTH_TOKENS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
] as const;
/** The month the scenes are dated on — the harness's instant, never the machine's (#8): September, whichever month the suite runs in. */
const thisMonth = new Date(LAYOUT_NOW_MS).getUTCMonth() + 1;
/** The calendar token of a month number, wrapping past December. */
const token = (month: number) => MONTH_TOKENS[(month - 1 + 12) % 12]!;
const NOW = token(thisMonth);
const OPPOSITE = token(thisMonth + 6);

/** A catalog variety of the scene, over the fixture's defaults. */
const variety = (
  plantId: string,
  commonName: string,
  scientificName: string,
  over: Partial<DashboardVarietyData>
) => varietyFixture({ plantId, commonName, scientificName, ...over });

export const varieties: DashboardVarietyData[] = [
  variety('tomato', 'tomate', 'Solanum lycopersicum', { count: 7, cells: 7, gardenIds: ['g1', 'g3'], wateringNeedLevel: 'High', minToleratedTempC: 5, sunlightHoursMin: 8, sunlightHoursMax: 12, harvestPeriod: NOW }),
  variety('basil', 'basilic', 'Ocimum basilicum', { count: 3, cells: 3, gardenIds: ['g1'], wateringNeedLevel: 'Frequent', minToleratedTempC: 8, sunlightHoursMin: 6, sunlightHoursMax: 8, sowingPeriod: OPPOSITE }),
  variety('hydrangea', 'hortensia', 'Hydrangea macrophylla', { count: 1, cells: 1, gardenIds: ['g1'], plantType: 'Ornamental', isEdible: false, wateringNeedLevel: 'Average', minToleratedTempC: null, sunlightHoursMin: 4, sunlightHoursMax: 6, pruningMonths: NOW }),
  variety('thyme', 'thym', 'Thymus vulgaris', { count: 4, cells: 4, gardenIds: ['g1'], wateringNeedLevel: 'Low', minToleratedTempC: null, sunlightHoursMin: 6, sunlightHoursMax: 8, pruningMonths: NOW }),
  variety('rosemary', 'romarin', 'Salvia rosmarinus', { count: 2, cells: 2, gardenIds: ['g1'], wateringNeedLevel: 'Low', minToleratedTempC: null, sunlightHoursMin: 6, sunlightHoursMax: 8, pruningMonths: NOW }),
  variety('courgette', 'courgette', 'Cucurbita pepo', { count: 3, cells: 3, gardenIds: ['g1'], wateringNeedLevel: 'High', minToleratedTempC: null, sunlightHoursMin: 6, sunlightHoursMax: 8, harvestPeriod: NOW }),
  variety('lettuce', 'laitue', 'Lactuca sativa', { count: 5, cells: 5, gardenIds: ['g1'], wateringNeedLevel: 'Average', minToleratedTempC: null, sunlightHoursMin: 4, sunlightHoursMax: 8, sowingPeriod: NOW, harvestPeriod: NOW }),
  variety('mint', 'menthe', 'Mentha spicata', { count: 4, cells: 4, gardenIds: ['g1', 'g3'], wateringNeedLevel: 'Frequent', minToleratedTempC: null, sunlightHoursMin: 4, sunlightHoursMax: 8 }),
  variety('geranium', 'géranium', 'Pelargonium zonale', { count: 4, cells: 4, gardenIds: ['g2'], plantType: 'Ornamental', isEdible: false, wateringNeedLevel: 'Average', minToleratedTempC: null }),
  variety('petunia', 'pétunia', 'Petunia × atkinsiana', { count: 3, cells: 3, gardenIds: ['g2'], plantType: 'Ornamental', isEdible: false, wateringNeedLevel: 'Average', minToleratedTempC: null }),
  variety('lavender', 'lavande', 'Lavandula angustifolia', { count: 2, cells: 2, gardenIds: ['g2'], plantType: 'Ornamental', isEdible: false, wateringNeedLevel: 'Low', minToleratedTempC: null, pruningMonths: OPPOSITE, floweringSeason: 'Summer' }),
  variety('carrot', 'carotte', 'Daucus carota', { count: 5, cells: 5, gardenIds: ['g3'], wateringNeedLevel: 'Average', minToleratedTempC: null, sowingPeriod: 'march-april', harvestPeriod: NOW }),
  variety('leek', 'poireau', 'Allium porrum', { count: 6, cells: 6, gardenIds: ['g3'], wateringNeedLevel: 'Low', minToleratedTempC: null, harvestPeriod: NOW }),
  variety('potato', 'pomme de terre', 'Solanum tuberosum', { count: 8, cells: 8, gardenIds: ['g3'], wateringNeedLevel: 'Average', minToleratedTempC: null, harvestPeriod: NOW }),
  variety('bean', 'haricot vert', 'Phaseolus vulgaris', { count: 4, cells: 4, gardenIds: ['g3'], wateringNeedLevel: 'Average', minToleratedTempC: null, harvestPeriod: NOW, floweringSeason: 'Summer' }),
  variety('strawberry', 'fraisier', 'Fragaria × ananassa', { count: 3, cells: 3, gardenIds: ['g3'], wateringNeedLevel: 'Average', minToleratedTempC: null, harvestPeriod: 'may-june', floweringSeason: 'Spring' }),
];

/** One placement of a variety at a cell. */
const plant = (plantId: string, row: number, col: number) =>
  placement({ id: `${plantId}-${row}-${col}`, plantId, startRow: row, startCol: col });
/** The same variety on several cells. */
const many = (plantId: string, cells: Array<[number, number]>) =>
  cells.map(([row, col]) => plant(plantId, row, col));

const terrasse = gardenFixture({
  id: 'g1',
  name: 'Terrasse',
  description: 'Terrasse plein sud, potager en carrés surélevés',
  width: 10,
  height: 8,
  cellSize: '50cm',
  cellsJson: JSON.stringify([{ row: 2, col: 0, infrastructure: 'wall' }]),
  config: { orientation: 'S', gardenType: 'terrace', lightSchedule: null, hemisphere: 'N', latitudeBand: 'mid' },
  placements: [
    plant('tomato', 2, 1),
    ...many('basil', [[0, 1], [0, 2], [0, 4]]),
    plant('hydrangea', 0, 3),
    ...many('thyme', [[4, 0], [4, 1], [4, 2], [4, 3]]),
    ...many('rosemary', [[5, 0], [5, 1]]),
    ...many('courgette', [[6, 2], [6, 4], [6, 6]]),
    ...many('lettuce', [[7, 0], [7, 1], [7, 2], [7, 3], [7, 4]]),
    ...many('mint', [[3, 8], [3, 9]]),
  ],
  placementCount: 21,
  varietyCount: 8,
  occupiedCells: 21,
  isEdible: true,
  updatedAt: '2026-09-20T18:00:00Z',
});
const balcon = gardenFixture({
  id: 'g2',
  name: 'Balcon sud',
  description: null,
  width: 12,
  height: 4,
  cellSize: '25cm',
  config: { orientation: null, gardenType: 'balcony', lightSchedule: null, hemisphere: 'N', latitudeBand: 'mid' },
  placements: [
    ...many('geranium', [[0, 0], [0, 1], [0, 2], [0, 3]]),
    ...many('petunia', [[2, 0], [2, 1], [2, 2]]),
    ...many('lavender', [[0, 10], [0, 11]]),
  ],
  placementCount: 9,
  varietyCount: 3,
  occupiedCells: 9,
  isEdible: false,
  updatedAt: '2026-09-19T09:00:00Z',
});
const potager = gardenFixture({
  id: 'g3',
  name: 'Potager du fond',
  description: null,
  width: 13,
  height: 6,
  cellSize: '50cm',
  config: { orientation: 'S', gardenType: 'inground', lightSchedule: null, hemisphere: 'N', latitudeBand: 'mid' },
  placements: [
    ...many('tomato', [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5]]),
    ...many('mint', [[0, 11], [0, 12]]),
    ...many('carrot', [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4]]),
    ...many('leek', [[2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [2, 5]]),
    ...many('potato', [[3, 0], [3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [3, 6], [3, 7]]),
    ...many('bean', [[4, 0], [4, 1], [4, 2], [4, 3]]),
    ...many('strawberry', [[5, 0], [5, 1], [5, 2]]),
  ],
  placementCount: 34,
  varietyCount: 7,
  occupiedCells: 34,
  isEdible: true,
  updatedAt: '2026-09-15T12:00:00Z',
});

export const gardens: DashboardGardenData[] = [terrasse, balcon, potager];
const data = dashboardFixture(gardens, {
  varieties,
  totals: { gardenCount: 3, placementCount: 64, varietyCount: 16, catalogPlantCount: 536 },
});
const views = new Map(gardens.map((garden) => [garden.id, gardenViewOf(garden)]));

/** The same gardens with longer, still plausible names — the desktop probe of V34. */
const gardensLong: DashboardGardenData[] = [
  { ...terrasse, name: 'Terrasse de la maison' },
  { ...balcon, name: 'Balcon sud de l’appartement' },
  { ...potager, name: 'Potager du fond du jardin' },
];
const viewsLong = new Map(gardensLong.map((garden) => [garden.id, gardenViewOf(garden)]));

/**
 * Potager du fond without its orientation either: two gardens the Tips card
 * invites to configure — both Medium slots taken by an invitation, every tip
 * in « +N conseils → » (fix round 2, #9 — GitHub `r4059946374`).
 */
const gardensTwoUnoriented: DashboardGardenData[] = [
  terrasse,
  balcon,
  { ...potager, config: { ...potager.config, orientation: null } },
];
const viewsTwoUnoriented = new Map(gardensTwoUnoriented.map((garden) => [garden.id, gardenViewOf(garden)]));

const ecully = locationFixture({
  key: '45.77,4.77',
  name: 'Écully',
  region: 'Auvergne-Rhône-Alpes',
  days: weekFixture(),
});

/** Every garden reads Écully. */
export const weatherAll = (): DashboardWeatherData =>
  weatherFixture(
    [ecully],
    [
      linkFixture({ gardenId: 'g1', locationKey: ecully.key, source: 'profile' }),
      linkFixture({ gardenId: 'g2', locationKey: ecully.key, source: 'profile' }),
      linkFixture({ gardenId: 'g3', locationKey: ecully.key, source: 'garden' }),
    ]
  );

/** Balcon sud has no city: « 2/3 localisé », and the invitations. */
export const weatherPartial = (): DashboardWeatherData =>
  weatherFixture(
    [ecully],
    [
      linkFixture({ gardenId: 'g1', locationKey: ecully.key, source: 'profile' }),
      linkFixture({ gardenId: 'g2', locationKey: null, source: null }),
      linkFixture({ gardenId: 'g3', locationKey: ecully.key, source: 'garden' }),
    ]
  );

/** The `GardensBlock` view of the weather: each garden's location, or null when it has none. */
const gardensWeather = (weather: DashboardWeatherData): GardensWeather => ({
  status: 'ready',
  byGarden: new Map(
    gardens.map((garden) => {
      const link = weather.gardens.find((l) => l.gardenId === garden.id);
      const key = link?.locationKey ?? null;
      return [garden.id, key ? (weather.locations.find((l) => l.key === key) ?? null) : null];
    })
  ),
});

/** The callbacks the scenes never fire. */
const noop = () => {};

export interface LayoutScene {
  /** `weather-medium`, `todo-medium-partial`, `tips-medium-long`… */
  name: string;
  key: DashboardBlockKey;
  size: DashboardSize;
  weather: 'all' | 'partial';
  /** The long-named gardens. */
  long?: boolean;
  /** Two gardens without orientation: both Medium Tips slots to an invitation (fix round 2, #9). */
  twoInvites?: boolean;
  /** In Edit mode: the widget reserves the top padding its controls sit in (SMA-437, D19). */
  editing?: boolean;
}

const SIZES: DashboardSize[] = ['small', 'medium', 'large'];
const WIDGETS: DashboardBlockKey[] = ['gardens', 'counters', 'stats', 'weather', 'todo', 'month', 'tips'];

/** The twenty-nine scenes of the pre-flight, in its order, then the two-invitation Tips card (fix round 2, #9). */
export const LAYOUT_SCENES: LayoutScene[] = (() => {
  const scenes: LayoutScene[] = [];
  for (const key of WIDGETS) {
    for (const size of SIZES) {
      scenes.push({ name: `${key}-${size}`, key, size, weather: 'all' });
      if (key === 'weather' || key === 'todo') {
        scenes.push({ name: `${key}-${size}-partial`, key, size, weather: 'partial' });
      }
    }
  }
  scenes.push({ name: 'todo-medium-long', key: 'todo', size: 'medium', weather: 'all', long: true });
  scenes.push({ name: 'tips-medium-long', key: 'tips', size: 'medium', weather: 'all', long: true });
  scenes.push({ name: 'tips-medium-two-invites', key: 'tips', size: 'medium', weather: 'all', twoInvites: true });
  return scenes;
})();

/**
 * SMA-437 lot 1, PR A, step A7 (pre-flight D19) — a scene of SEVERAL widgets:
 * a whole grid, measured card by card and as a grid — the rows it resolves,
 * each card's box, and, in Edit mode, each card's controls. The layouts are
 * the product's own presets, read from `presetFor` rather than copied, so the
 * scene follows them.
 */
export interface GridScene {
  name: string;
  level: DashboardLevel;
  editing: boolean;
  blocks: Array<{ key: DashboardBlockKey; size: DashboardSize }>;
}

/** The visible widgets of a level's preset, in order. */
const presetGrid = (level: DashboardLevel) =>
  presetFor(level)
    .filter((block) => !block.hidden)
    .map(({ key, size }) => ({ key, size }));

/**
 * The Gardener preset (Weather M, Gardens L, four Mediums) and the Expert one
 * (the eight widgets in Large), at rest and in Edit mode.
 */
export const GRID_SCENES: GridScene[] = (['gardener', 'expert'] as const).flatMap((level) => [
  { name: `grid-${level}`, level, editing: false, blocks: presetGrid(level) },
  { name: `grid-${level}-edit`, level, editing: true, blocks: presetGrid(level) },
]);

/** The scene of one card of a grid scene: the widget at its size, on every garden located. */
export const gridCardScene = (grid: GridScene, block: GridScene['blocks'][number]): LayoutScene => ({
  name: `${grid.name}/${block.key}`,
  key: block.key,
  size: block.size,
  weather: 'all',
  editing: grid.editing,
});

/** The widget of a scene, with the props the page would hand it. */
export function sceneWidget(scene: LayoutScene): ReactNode {
  const weather = scene.weather === 'all' ? weatherAll() : weatherPartial();
  const gs = scene.twoInvites ? gardensTwoUnoriented : scene.long ? gardensLong : gardens;
  const vs = scene.twoInvites ? viewsTwoUnoriented : scene.long ? viewsLong : views;
  const common = { size: scene.size, editing: scene.editing, loading: false, loadError: false, onRetry: noop };
  switch (scene.key) {
    case 'weather':
      return <WeatherBlock {...common} weather={weather} gardens={gs} onLocate={noop} onLocated={noop} />;
    case 'gardens':
      return (
        <GardensBlock
          {...common}
          gardens={gs}
          showWeatherColumn
          showHarvestColumn={false}
          weather={gardensWeather(weather)}
          onLocate={noop}
          onCreateClick={noop}
          onChanged={noop}
          onDeleted={noop}
          onExpand={noop}
        />
      );
    case 'counters':
      return (
        <CountersBlock
          {...common}
          options={null}
          varieties={varieties}
          gardens={gs}
          totals={data.totals}
          onOptionsChange={noop}
        />
      );
    case 'month':
      return <MonthBlock {...common} gardens={gs} varieties={varieties} weather={weather} />;
    case 'tips':
      return <TipsBlock {...common} gardens={gs} views={vs} varieties={varieties} weather={weather} onExpand={noop} />;
    case 'stats':
      return <StatsBlock {...common} gardens={gs} />;
    case 'todo':
      return <TodoBlock {...common} gardens={gs} varieties={varieties} weather={weather} onLocate={noop} onExpand={noop} />;
    case 'harvest':
      // « Bientôt disponible », as the page draws it (SMA-437: the Expert
      // preset's grid scene holds it).
      return <InviteBlock blockKey="harvest" size={scene.size} editing={scene.editing} />;
    default:
      throw new Error(`No scene for the widget ${scene.key}`);
  }
}
