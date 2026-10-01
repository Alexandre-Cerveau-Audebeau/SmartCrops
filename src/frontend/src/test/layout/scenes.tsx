import type { ReactNode } from 'react';
import CountersBlock from '../../components/Dashboard/blocks/CountersBlock';
import GardensBlock, { type GardensWeather } from '../../components/Dashboard/blocks/GardensBlock';
import InviteBlock from '../../components/Dashboard/blocks/InviteBlock';
import KeyFiguresBlock from '../../components/Dashboard/blocks/KeyFiguresBlock';
import MonthBlock from '../../components/Dashboard/blocks/MonthBlock';
import StatsBlock from '../../components/Dashboard/blocks/StatsBlock';
import TipsBlock from '../../components/Dashboard/blocks/TipsBlock';
import TodoBlock from '../../components/Dashboard/blocks/TodoBlock';
import WeatherBlock from '../../components/Dashboard/blocks/WeatherBlock';
import { dashboardFixture, gardenFixture, varietyFixture } from '../fixtures/dashboard';
import { placement } from '../fixtures/placements';
import { currentFixture, linkFixture, locationFixture, weatherFixture, weekFixture } from '../fixtures/weather';
import { gardenViewOf, type GardenView } from '../../utils/gardenStats';
import type { KeyFigure } from '../../components/Dashboard/blocks/keyFiguresOptions';
import { cardBearsWeather, noviceCardsOf, type NoviceCard } from '../../components/Dashboard/noviceCards';
import { LAYOUT_NOW_MS } from './clock';
import { capabilitiesFor, catalogFor, presetFor } from '../fixtures/formulas';
import { customOrderIds } from '../../components/Dashboard/blocks/gardensOptions';
import type { GardenOrder } from '../../hooks/useGardenOrder';
import type { GardenLayoutData } from '../../services/gardenLayoutApi';
import type { Garden } from '../../types/Garden';
import type { SaveState } from '../../hooks/useDashboardPreferences';
import type {
  DashboardBlockKey,
  DashboardLevel,
  DashboardSize,
  FormulaCapabilities,
  FormulaRefusalReason,
  FormulasCatalog,
} from '../../types/Dashboard';
import type { DashboardData, DashboardGardenData, DashboardVarietyData } from '../../types/DashboardData';
import type { DashboardWeatherData, WeatherLocation } from '../../types/DashboardWeather';

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
  // PR #301, fix round 1, R3 — the one variety of the scenes with its FOUR
  // lanes, so This month draws a four-bar row as well as one-bar ones: the
  // pruning, sowing and flowering of the repository's own four-lane tomato
  // (`plantCalendar.test.ts`, `lanesOf`), none of them in the harness's
  // September; its harvest stays « this month ».
  variety('tomato', 'tomate', 'Solanum lycopersicum', { count: 7, cells: 7, gardenIds: ['g1', 'g3'], wateringNeedLevel: 'High', minToleratedTempC: 5, sunlightHoursMin: 8, sunlightHoursMax: 12, harvestPeriod: NOW, pruningMonths: 'June,July,August', sowingPeriod: 'march-may', floweringSeason: 'Summer' }),
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

/**
 * SMA-437, lot V3-08, step S6 — FORTY-FOUR varieties, the sixty gardens'
 * aggregate, so Counts has something to fold in the Full width (37 at rest
 * over four columns, 28 over three, 19 over two). The sixteen of the scenes,
 * then REAL plants only (V24: no name invented): the eighteen more of the
 * repository's seeder (`DataSeeder.cs`), under its French names and its plant
 * types, and ten of the repository's fixtures — seven of them without a
 * common name, shown by their scientific one as the product shows an
 * enrichment gap. None of the twenty-eight has a known calendar: This month
 * counts them in its foot.
 */
const seeded = (plantId: string, commonName: string | null, scientificName: string, plantType: string, index: number) =>
  varietyFixture({
    plantId,
    commonName,
    scientificName,
    plantType,
    isEdible: null,
    count: 1 + (index % 3),
    cells: 1 + (index % 3),
    gardenIds: [`p${index + 1}`],
  });

export const varietiesFortyFour: DashboardVarietyData[] = [
  ...varieties,
  ...(
    [
      ['pepper', 'poivron', 'Capsicum annuum', 'Vegetable'],
      ['raspberry', 'framboise', 'Rubus idaeus', 'Fruit'],
      ['blueberry', 'myrtille', 'Vaccinium corymbosum', 'Fruit'],
      ['fig', 'figue', 'Ficus carica', 'Fruit'],
      ['grape', 'raisin', 'Vitis vinifera', 'Fruit'],
      ['apple', 'pomme', 'Malus domestica', 'Fruit'],
      ['parsley', 'persil', 'Petroselinum crispum', 'Herb'],
      ['cilantro', 'coriandre', 'Coriandrum sativum', 'Herb'],
      ['sunflower', 'tournesol', 'Helianthus annuus', 'Ornamental'],
      ['rose', 'rose', 'Rosa gallica', 'Ornamental'],
      ['dahlia', 'dahlia', 'Dahlia pinnata', 'Ornamental'],
      ['tulip', 'tulipe', 'Tulipa gesneriana', 'Ornamental'],
      ['jasmine', 'jasmin', 'Jasminum officinale', 'Ornamental'],
      ['chamomile', 'camomille', 'Matricaria chamomilla', 'Medicinal'],
      ['aloe', 'aloe vera', 'Aloe vera', 'Medicinal'],
      ['echinacea', 'échinacée', 'Echinacea purpurea', 'Medicinal'],
      ['sage', 'sauge', 'Salvia officinalis', 'Medicinal'],
      ['calendula', 'souci', 'Calendula officinalis', 'Medicinal'],
      ['ivy', 'lierre', 'Hedera helix', 'Ornamental'],
      ['maize', 'maïs', 'Zea mays', 'Vegetable'],
      ['eggplant', 'aubergine', 'Solanum melongena', 'Vegetable'],
      ['athyrium', null, 'Athyrium vidalii', 'Ornamental'],
      ['aster', null, 'Aster amellus', 'Ornamental'],
      ['sneezewort', null, 'Achillea ptarmica', 'Ornamental'],
      ['yarrow', null, 'Achillea millefolium', 'Medicinal'],
      ['peppermint', null, 'Mentha piperita', 'Herb'],
      ['abelia', null, 'Abelia chinensis', 'Ornamental'],
      ['bauhinia', null, 'Bauhinia blakeana', 'Ornamental'],
    ] as const
  ).map(([plantId, commonName, scientificName, plantType], index) => seeded(plantId, commonName, scientificName, plantType, index)),
];

/** One placement of a variety at a cell. */
const plant = (plantId: string, row: number, col: number) =>
  placement({ id: `${plantId}-${row}-${col}`, plantId, startRow: row, startCol: col });
/** The same variety on several cells. */
const many = (plantId: string, cells: Array<[number, number]>) =>
  cells.map(([row, col]) => plant(plantId, row, col));
/** One planting over `spanRows` × `spanCols` cells from its top-left corner (PR #296, fix round 2, U2: the elongated ones). */
const spread = (plantId: string, row: number, col: number, spanRows: number, spanCols: number) =>
  placement({ id: `${plantId}-${row}-${col}-${spanRows}x${spanCols}`, plantId, startRow: row, startCol: col, spanRows, spanCols });

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
/** The scenes' aggregate, whole — what the page scenes' `fetch` serves the page (SMA-437, lot V39, PR B, B9). */
export const SCENE_DATA = data;
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
const gardensWeather = (weather: DashboardWeatherData, list: readonly DashboardGardenData[] = gardens): GardensWeather => ({
  status: 'ready',
  byGarden: new Map(
    list.map((garden) => {
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
  /**
   * The Key figures band's data (SMA-437 lot 1, PR B, step B7): its four
   * defaults on the scene's gardens; the EXTREME set — seven digits, hectares,
   * the longest label; no garden (the invitation); gardens with plans and
   * nothing planted (« — », « Aucune », « Rien »).
   */
  band?: 'default' | 'extreme' | 'empty' | 'unplanted';
  /**
   * SMA-448, lot F5-a — the Gardens widget under its settings, on TWELVE
   * gardens: at rest (the count as the cap — 8 on a desktop, 5 on a phone —,
   * the foot, the search bar), unfolded in place, a search on, a search
   * without a result, « Tous ».
   */
  gardens?: { expanded?: boolean; query?: string; options?: Record<string, unknown> | null; list?: GardensListKind };
  /**
   * SMA-437, lot V3-08, step S6 — Statistics, Counts or This month in the
   * Full width, on the gardens of `list` (their forty-four varieties with the
   * sixty), folded at rest or unfolded in place.
   */
  wide?: { list: GardensListKind; expanded?: boolean };
}

/**
 * SMA-448, lot F5-b — the gardens a Gardens scene mounts: the page's Terrasse
 * alone; the five of the page; the twelve of lot F5-a (the default); sixty —
 * `panelGardens`, one in ten under a very long name —; the three under the
 * very long names of the Novice scenes.
 */
export type GardensListKind = 'one' | 'five' | 'twelve' | 'sixty' | 'long';
export const GARDENS_LIST_KINDS: readonly GardensListKind[] = ['one', 'five', 'twelve', 'sixty', 'long'];

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
  // SMA-437 lot 1, PR B, step B7 — the Key figures band, in its one size, at
  // every width of the runs: the desktop, the two tablets on either side of
  // the 900 px where its tiles go from two by two to four in a row
  // (arbitrage 2), the phones two by two.
  scenes.push({ name: 'keyfigures-wide', key: 'keyfigures', size: 'wide', weather: 'all', band: 'default' });
  scenes.push({ name: 'keyfigures-wide-extreme', key: 'keyfigures', size: 'wide', weather: 'all', band: 'extreme' });
  scenes.push({ name: 'keyfigures-wide-empty', key: 'keyfigures', size: 'wide', weather: 'all', band: 'empty' });
  scenes.push({ name: 'keyfigures-wide-unplanted', key: 'keyfigures', size: 'wide', weather: 'all', band: 'unplanted' });
  // SMA-448, lot F5-a — the Gardens widget's settings on twelve gardens (V5:
  // every new form becomes a scene): the cut and its foot, the search bar;
  // the list unfolded in place; a search that finds two, one beyond the cut;
  // a search with no result, its state; « Tous »; and the Medium list, which
  // keeps its three rows.
  scenes.push({ name: 'gardens-large-twelve', key: 'gardens', size: 'large', weather: 'all', gardens: {} });
  scenes.push({ name: 'gardens-large-unfolded', key: 'gardens', size: 'large', weather: 'all', gardens: { expanded: true } });
  scenes.push({ name: 'gardens-large-search', key: 'gardens', size: 'large', weather: 'all', gardens: { query: 'verger' } });
  scenes.push({ name: 'gardens-large-search-empty', key: 'gardens', size: 'large', weather: 'all', gardens: { query: 'verger nord' } });
  scenes.push({ name: 'gardens-large-all', key: 'gardens', size: 'large', weather: 'all', gardens: { options: { count: 'all' } } });
  scenes.push({ name: 'gardens-medium-twelve', key: 'gardens', size: 'medium', weather: 'all', gardens: {} });
  // SMA-448, lot F5-b (V5) — the Gardens widget in the FULL WIDTH, the
  // Expert's (V3-03, V3-04): one garden, five, twelve at rest (the cut, the
  // foot, the search bar), unfolded in place under the rule « Au-delà des N
  // affichés », a search on, a search without a result, « Tous », sixty at
  // rest and unfolded, three very long names, and the twelve in Edit mode.
  scenes.push({ name: 'gardens-wide-one', key: 'gardens', size: 'wide', weather: 'all', gardens: { list: 'one' } });
  scenes.push({ name: 'gardens-wide-five', key: 'gardens', size: 'wide', weather: 'all', gardens: { list: 'five' } });
  scenes.push({ name: 'gardens-wide-twelve', key: 'gardens', size: 'wide', weather: 'all', gardens: {} });
  scenes.push({ name: 'gardens-wide-unfolded', key: 'gardens', size: 'wide', weather: 'all', gardens: { expanded: true } });
  scenes.push({ name: 'gardens-wide-search', key: 'gardens', size: 'wide', weather: 'all', gardens: { query: 'verger' } });
  scenes.push({ name: 'gardens-wide-search-empty', key: 'gardens', size: 'wide', weather: 'all', gardens: { query: 'verger nord' } });
  scenes.push({ name: 'gardens-wide-all', key: 'gardens', size: 'wide', weather: 'all', gardens: { options: { count: 'all' } } });
  scenes.push({ name: 'gardens-wide-sixty', key: 'gardens', size: 'wide', weather: 'all', gardens: { list: 'sixty' } });
  scenes.push({ name: 'gardens-wide-sixty-unfolded', key: 'gardens', size: 'wide', weather: 'all', gardens: { list: 'sixty', expanded: true } });
  scenes.push({ name: 'gardens-wide-long', key: 'gardens', size: 'wide', weather: 'all', gardens: { list: 'long' } });
  scenes.push({ name: 'gardens-wide-edit', key: 'gardens', size: 'wide', weather: 'all', editing: true, gardens: {} });
  // SMA-437, lot V3-08, step S6 (V5) — STATISTICS, COUNTS AND THIS MONTH IN
  // THE FULL WIDTH (A-14): on one garden, five, twelve, sixty and three very
  // long names, at rest — ten lines —, then unfolded in place where the list
  // outgrows them: the twelve and the sixty gardens of Statistics, the
  // forty-four varieties of Counts, the thirteen calendars of This month.
  for (const key of ['stats', 'counters', 'month'] as const) {
    for (const list of GARDENS_LIST_KINDS) {
      scenes.push({ name: `${key}-wide-${list}`, key, size: 'wide', weather: 'all', wide: { list } });
    }
  }
  scenes.push({ name: 'stats-wide-twelve-unfolded', key: 'stats', size: 'wide', weather: 'all', wide: { list: 'twelve', expanded: true } });
  scenes.push({ name: 'stats-wide-sixty-unfolded', key: 'stats', size: 'wide', weather: 'all', wide: { list: 'sixty', expanded: true } });
  scenes.push({ name: 'counters-wide-sixty-unfolded', key: 'counters', size: 'wide', weather: 'all', wide: { list: 'sixty', expanded: true } });
  scenes.push({ name: 'month-wide-twelve-unfolded', key: 'month', size: 'wide', weather: 'all', wide: { list: 'twelve', expanded: true } });
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
 * The Gardener preset (Weather M, Gardens L, Tips M, This month M, To-do L —
 * since PR #301's fix round 1, no half row left empty —, Counts M) and the
 * Expert one (the band, the Gardens and the Weather in the Full width, Tips
 * in Large beside To-do and Harvest in Medium, then This month, Counts and
 * Statistics in the Full width — SMA-437, lot V3-08: the preset without a
 * hole, the alternative B since PR #301's fix round 1), at rest and in Edit
 * mode.
 */
export const GRID_SCENES: GridScene[] = [
  ...(['gardener', 'expert'] as const).flatMap((level) => [
    { name: `grid-${level}`, level, editing: false, blocks: presetGrid(level) },
    { name: `grid-${level}-edit`, level, editing: true, blocks: presetGrid(level) },
  ]),
  // SMA-437 lot 1, PR B, step B7 (pre-flight C.8) — the band BETWEEN two
  // ordinary rows: Weather M, Gardens L, Tips S, This month S, then the band,
  // then To-do M and Counters M — pinned rows above and below a row as tall as
  // its content; at rest and in Edit mode.
  ...[false, true].map((editing) => ({
    name: `grid-expert-band-between${editing ? '-edit' : ''}`,
    level: 'expert' as const,
    editing,
    blocks: [
      { key: 'weather', size: 'medium' },
      { key: 'gardens', size: 'large' },
      { key: 'tips', size: 'small' },
      { key: 'month', size: 'small' },
      { key: 'keyfigures', size: 'wide' },
      { key: 'todo', size: 'medium' },
      { key: 'counters', size: 'medium' },
    ] satisfies GridScene['blocks'],
  })),
  // SMA-448, lot F5-b — the Gardens widget in Full width BETWEEN two ordinary
  // rows: Weather M, Tips S, This month S, then the Gardens, then To-do M and
  // Counters M — pinned rows above and below a row as tall as its card
  // (A-N10); at rest and in Edit mode.
  ...[false, true].map((editing) => ({
    name: `grid-expert-gardens-wide${editing ? '-edit' : ''}`,
    level: 'expert' as const,
    editing,
    blocks: [
      { key: 'weather', size: 'medium' },
      { key: 'tips', size: 'small' },
      { key: 'month', size: 'small' },
      { key: 'gardens', size: 'wide' },
      { key: 'todo', size: 'medium' },
      { key: 'counters', size: 'medium' },
    ] satisfies GridScene['blocks'],
  })),
  // SMA-437, lot V3-08, step S5 — THE PROBE of the hole measure (the rule of
  // SMA-446: an instrument never shown a defect proves nothing): the Expert
  // preset as PR #300 left it, written out — the Weather in Large, then the
  // Gardens in the Full width, which cannot share the Weather's two rows. At
  // four columns it leaves 566 × 566 px empty right of the Weather (SMA-448,
  // 29/09); at two and one, nothing. At rest.
  {
    name: 'grid-expert-hole-probe',
    level: 'expert',
    editing: false,
    blocks: [
      { key: 'keyfigures', size: 'wide' },
      { key: 'weather', size: 'large' },
      { key: 'gardens', size: 'wide' },
      { key: 'tips', size: 'large' },
      { key: 'month', size: 'large' },
      { key: 'todo', size: 'large' },
      { key: 'counters', size: 'large' },
      { key: 'stats', size: 'large' },
      { key: 'harvest', size: 'large' },
    ] satisfies GridScene['blocks'],
  },
];

/**
 * SMA-448, lot F2, step N5 (V5: « toute forme nouvelle devient une scène ») —
 * THE NOVICE PAGE as a scene: the header (the title, its meta line, the chip
 * that opens the choice of formula, « Créer un jardin »), one card per garden,
 * the foot message and the weather warning — with 0, 1 and 3 gardens, 5 (an
 * account beyond the Novice's limit keeps its gardens — « Votre formule —
 * conservée »), very long garden names, and a garden without a city.
 */
export interface NoviceScene {
  /** `novice-0`, `novice-1`, `novice-3`, `novice-5`, `novice-3-long`, `novice-3-partial`. */
  name: string;
  /** How many gardens the page shows. */
  count: 0 | 1 | 3 | 5;
  /** Garden names far longer than V34's probe: the one ellipsis a source allows (SMA-436), the task and the plants wrapping. */
  long?: boolean;
  /** Balcon sud without a city: the dashed « Ajouter une ville » in a foot. */
  weather: 'all' | 'partial';
}

export const NOVICE_SCENES: NoviceScene[] = [
  { name: 'novice-0', count: 0, weather: 'all' },
  { name: 'novice-1', count: 1, weather: 'all' },
  { name: 'novice-3', count: 3, weather: 'all' },
  { name: 'novice-5', count: 5, weather: 'all' },
  { name: 'novice-3-long', count: 3, long: true, weather: 'all' },
  { name: 'novice-3-partial', count: 3, weather: 'partial' },
];

/**
 * Two more gardens, on the product's own fields — a greenhouse, a small
 * square of thyme. The greenhouse carries the ELONGATED plantings (PR #296,
 * fix round 2, U2 — GitHub `4115367541`): a row of courgettes over 1 × 7
 * cells, a bean trellis over 7 × 1, a lettuce strip over 1 × 3, a potato bed
 * over 4 × 4, beside 1 × 1 herbs — the shapes a planting must keep in the
 * band, whatever it spans. Under the crop, at every width of the page.
 */
const serre: DashboardGardenData = {
  ...terrasse,
  id: 'g4',
  name: 'Serre nord',
  description: null,
  width: 8,
  height: 8,
  cellsJson: null,
  config: { ...terrasse.config, gardenType: 'greenhouse' },
  placements: [
    spread('courgette', 0, 0, 1, 7),
    spread('bean', 1, 7, 7, 1),
    spread('lettuce', 2, 0, 1, 3),
    spread('potato', 3, 2, 4, 4),
    ...many('mint', [[1, 0], [1, 1]]),
    ...many('basil', [[2, 4], [2, 5], [2, 6]]),
    ...many('thyme', [[7, 0], [7, 1], [7, 2], [7, 3]]),
  ],
  placementCount: 13,
  varietyCount: 7,
  occupiedCells: 42,
  updatedAt: '2026-09-18T08:00:00Z',
};
const carre: DashboardGardenData = {
  ...potager,
  id: 'g5',
  name: 'Carré aromatique',
  width: 4,
  height: 4,
  cellSize: '25cm',
  config: { ...potager.config, gardenType: 'inground' },
  placements: [...many('thyme', [[0, 0], [0, 1], [1, 0]]), ...many('rosemary', [[2, 2], [3, 3]])],
  placementCount: 5,
  varietyCount: 2,
  occupiedCells: 5,
  updatedAt: '2026-09-11T16:00:00Z',
};

/**
 * SMA-448, lot F5-a — TWELVE gardens for the Gardens widget's settings: the
 * five of the page, and seven more cloned from them under names a gardener
 * types. Their last modification is set so that « Derniers ouverts » (never
 * opened: the fallback on the modification) lists them in THIS order, with
 * « Verger bas » tenth — beyond the eight of a desktop and the five of a
 * phone — so a search for « verger » finds one shown and one beyond the cut.
 */
const TWELVE_NAMES = [
  'Terrasse',
  'Balcon sud',
  'Serre nord',
  'Potager du fond',
  'Carré aromatique',
  'Grand verger',
  'Pépinière',
  'Bac à fleurs',
  'Haie fruitière',
  'Verger bas',
  'Jardin d’hiver',
  'Rocaille',
] as const;
const FIVE: readonly DashboardGardenData[] = [terrasse, balcon, serre, potager, carre];
export const gardensTwelve: DashboardGardenData[] = TWELVE_NAMES.map((name, index) => {
  const base = FIVE[index % FIVE.length]!;
  return {
    ...base,
    id: index < FIVE.length ? base.id : `g${index + 1}`,
    name,
    updatedAt: `2026-09-${String(27 - index).padStart(2, '0')}T12:00:00Z`,
    createdAt: `2026-01-${String(index + 1).padStart(2, '0')}T12:00:00Z`,
    // The three first ranked — 2, 0, 1 —, the others not: the custom order
    // puts them after the nine unranked.
    sortOrder: index === 0 ? 2 : index === 1 ? 0 : index === 2 ? 1 : null,
  };
});

/**
 * SMA-448, lot F5-a — THE GEAR PANEL as a scene, with 60 and 100 gardens: the
 * Expert's custom order on the complete list, in the 320 px Popover the
 * product draws it in, whose paper scrolls inside the screen. One garden in
 * ten carries a long name — the row must wrap it, never cut it (V5).
 */
export interface PanelScene {
  name: 'gardens-panel-60' | 'gardens-panel-100' | 'gardens-panel-100-all';
  gardens: 60 | 100;
  options: Record<string, unknown>;
}

export const PANEL_SCENES: PanelScene[] = [
  { name: 'gardens-panel-60', gardens: 60, options: { sort: 'custom' } },
  { name: 'gardens-panel-100', gardens: 100, options: { sort: 'custom' } },
  { name: 'gardens-panel-100-all', gardens: 100, options: { sort: 'custom', count: 'all' } },
];

/** `count` gardens of the panel scenes: the twelve, then clones, a long name on every tenth; a third of them ranked. */
export function panelGardens(count: number): DashboardGardenData[] {
  const list: DashboardGardenData[] = [];
  for (let index = 0; index < count; index++) {
    const base = gardensTwelve[index % gardensTwelve.length]!;
    const long = index > 0 && index % 10 === 0;
    list.push({
      ...base,
      id: `p${index + 1}`,
      name: long ? `${NOVICE_LONG_NAMES[(index / 10) % NOVICE_LONG_NAMES.length]}` : `${base.name} ${index + 1}`,
      createdAt: `2026-0${1 + (index % 8)}-${String(1 + (index % 27)).padStart(2, '0')}T12:00:00Z`,
      sortOrder: index % 3 === 0 ? Math.floor(index / 3) : null,
    });
  }
  return list;
}

/** What the panel scene mounts: its gardens, their served order — read, never written — and the Expert's five sorts. */
export function panelSceneData(scene: PanelScene): {
  gardens: DashboardGardenData[];
  order: GardenOrder;
  sorts: FormulaCapabilities['gardenSorts'];
} {
  const list = panelGardens(scene.gardens);
  return {
    gardens: list,
    order: { ids: customOrderIds(list), order: null, state: 'idle', move: noop },
    sorts: capabilitiesFor('expert').gardenSorts,
  };
}

/** The very long names of the long scene — real sentences a gardener might type. */
export const NOVICE_LONG_NAMES = [
  'Le grand potager derrière la maison de mes grands-parents, côté verger',
  'Balcon sud de l’appartement du troisième étage, au-dessus de la rue',
  'Petite serre en verre tout au fond du jardin, près du vieux cerisier',
] as const;
const gardensVeryLong: DashboardGardenData[] = [
  { ...terrasse, name: NOVICE_LONG_NAMES[0] },
  { ...balcon, name: NOVICE_LONG_NAMES[1] },
  { ...potager, name: NOVICE_LONG_NAMES[2] },
];

/** The gardens of a Gardens scene, by kind (SMA-448, lot F5-b). */
export function gardensListOf(kind: GardensListKind): DashboardGardenData[] {
  switch (kind) {
    case 'one':
      return [terrasse];
    case 'five':
      return [...FIVE];
    case 'twelve':
      return gardensTwelve;
    case 'sixty':
      return panelGardens(60);
    case 'long':
      return gardensVeryLong;
  }
}

/**
 * SMA-448, lot F5-b, step W4 — what the page launcher's `fetch` serves the
 * REAL page for a Gardens scene: the aggregate of the list, and a weather
 * where every garden reads Écully — the MÉTÉO column filled on every row,
 * the Weather widget bearing the warning (V1).
 */
export function gardensSceneData(kind: GardensListKind): {
  gardens: DashboardGardenData[];
  data: DashboardData;
  weather: DashboardWeatherData;
} {
  const list = gardensListOf(kind);
  return {
    gardens: list,
    data: dashboardFixture(list, { varieties }),
    weather: weatherFixture(
      [ecully],
      list.map((garden) => linkFixture({ gardenId: garden.id, locationKey: ecully.key, source: 'profile' }))
    ),
  };
}

/** The weather of a Novice scene: every garden in Écully — but Balcon sud when partial. */
const noviceWeather = (list: readonly DashboardGardenData[], partial: boolean): DashboardWeatherData =>
  weatherFixture(
    [ecully],
    list.map((garden) =>
      partial && garden.id === 'g2'
        ? linkFixture({ gardenId: garden.id, locationKey: null, source: null })
        : linkFixture({ gardenId: garden.id, locationKey: ecully.key, source: garden.id === 'g3' ? 'garden' : 'profile' })
    )
  );

/**
 * A Novice scene: its gardens, its cards as the page derives them, the
 * header's figures, whether the warning shows — and what the page launcher's
 * `fetch` serves the REAL page for it (PR #296, fix round 1, S1): the
 * aggregate and the weather the cards above are derived from, so what the
 * page draws and what the suite expects come from the same data.
 */
export interface NoviceSceneData {
  gardens: DashboardGardenData[];
  cards: NoviceCard[];
  figures: { gardens: number; plants: number; surfaceM2: number };
  /** V1: a card shows a temperature — every scene but the empty one. */
  warning: boolean;
  /** `/api/dashboard` for this scene. */
  data: DashboardData;
  /** `/api/dashboard/weather` for this scene. */
  weather: DashboardWeatherData;
}

export function noviceSceneData(scene: NoviceScene): NoviceSceneData {
  const list = scene.long ? gardensVeryLong : [...gardens, serre, carre].slice(0, scene.count);
  const sceneViews = new Map(list.map((garden) => [garden.id, gardenViewOf(garden)]));
  const weather = noviceWeather(list, scene.weather === 'partial');
  const cards = noviceCardsOf(list, varieties, sceneViews, weather, 'ready');
  return {
    gardens: list,
    cards,
    data: dashboardFixture(list, { varieties }),
    weather,
    figures: {
      gardens: list.length,
      plants: list.reduce((sum, garden) => sum + garden.placementCount, 0),
      surfaceM2: list.reduce((sum, garden) => sum + (sceneViews.get(garden.id)?.surfaceM2 ?? 0), 0),
    },
    warning: cards.some(cardBearsWeather),
  };
}

/** The scene of one card of a grid scene: the widget at its size, on every garden located. */
export const gridCardScene = (grid: GridScene, block: GridScene['blocks'][number]): LayoutScene => ({
  name: `${grid.name}/${block.key}`,
  key: block.key,
  size: block.size,
  weather: 'all',
  editing: grid.editing,
});

/**
 * SMA-437, lot V39, step A4 (pre-flight C.6, n° 1) — the header's ACTIONS
 * ZONE, `DashboardActions`, alone: the level chip, the save indicator and the
 * page's buttons, at rest and in Edit mode, in each state of the indicator —
 * « Enregistrement… », « Enregistré » and the failure following the first
 * change, which also turns the chip to « · ajustée » — and while the layout
 * loads. At the two formulas that draw the buttons: the Gardener, whose chip
 * is the widest (« Vue Jardinier · ajustée »), and the Expert.
 */
export interface ActionsScene {
  /** `actions-gardener-edit-pending`… */
  name: string;
  level: DashboardLevel;
  /** `rest-idle`, `edit-error`…: the mode, then the indicator's state or `loading`. */
  state: string;
  editing: boolean;
  saveState: SaveState;
  adjusted: boolean;
  unavailable: boolean;
}

/** The states of the zone: at rest and in Edit mode, the indicator before any change and in its three states; and the load. */
const ACTION_STATES: Array<Omit<ActionsScene, 'name' | 'level'>> = [
  { state: 'rest-loading', editing: false, saveState: 'idle', adjusted: false, unavailable: true },
  ...([false, true] as const).flatMap((editing) =>
    (['idle', 'pending', 'saved', 'error'] as const).map((saveState) => ({
      state: `${editing ? 'edit' : 'rest'}-${saveState}`,
      editing,
      saveState,
      adjusted: saveState !== 'idle',
      unavailable: false,
    }))
  ),
];

export const ACTIONS_SCENES: ActionsScene[] = (['gardener', 'expert'] as const).flatMap((level) =>
  ACTION_STATES.map((state) => ({ name: `actions-${level}-${state.state}`, level, ...state }))
);

/**
 * SMA-437, lot V39, PR B, step T0 — the actions zone UNDER THE HEADER'S REAL
 * LAYOUT (finding E3 of #291's round 1): `DASHBOARD_HEADER_SX`, the page's
 * title block on the left, the zone beside it or under it, where the header
 * puts it. Every state of {@link ACTIONS_SCENES}, renamed `header-…`.
 */
export const HEADER_SCENES: ActionsScene[] = ACTIONS_SCENES.map((scene) => ({
  ...scene,
  name: scene.name.replace(/^actions-/, 'header-'),
}));

/**
 * The figures of the header's meta line for the scenes' three gardens — their
 * count, their plants and their surface — derived as the page derives them:
 * the aggregate's `placementCount`, the sum of the plans' surfaces.
 */
export const HEADER_FIGURES = {
  gardens: gardens.length,
  plants: data.totals.placementCount,
  surfaceM2: gardens.reduce((sum, garden) => sum + (views.get(garden.id)?.surfaceM2 ?? 0), 0),
};

/**
 * The EXTREME band (pre-flight C.5, « le jeu extrême »): seven digits in a
 * tile — 1 284 630 plants, 1 284 630 free cells, 1 284 000 of them in full sun
 * — 24,56 ha, and the longest label of the catalogue, « Cases libres en plein
 * soleil ». The views are the scene's own, their sums raised: the band reads
 * them as the page's shared views, and no engine has to lay out a million
 * cells for it.
 */
const EXTREME_FIGURES: KeyFigure[] = ['freeSun', 'surface', 'plants', 'free'];
const extremeViews = new Map(
  gardens.map((garden, index): [string, GardenView] => {
    const view = gardenViewOf(garden);
    return [
      garden.id,
      {
        ...view,
        activeCells: 428_310,
        occupiedCells: 100,
        freeCells: 428_210,
        surfaceM2: [100_000, 100_000, 45_600][index]!,
        freeExposure: { ...view.freeExposure, full: 428_000 },
      },
    ];
  })
);

/** Three gardens with a plan and nothing planted: « — », « Aucune », « Rien ». */
const unplantedGardens: DashboardGardenData[] = gardens.map((garden) => ({
  ...garden,
  placements: [],
  placementCount: 0,
  varietyCount: 0,
  occupiedCells: 0,
  isEdible: null,
}));
const unplantedViews = new Map(unplantedGardens.map((garden) => [garden.id, gardenViewOf(garden)]));

/** The Key figures band of a scene: its data, as the page would hand it. */
function bandWidget(scene: LayoutScene, weather: DashboardWeatherData): ReactNode {
  const band = scene.band ?? 'default';
  const common = {
    size: scene.size,
    editing: scene.editing ?? false,
    weather,
    weatherStatus: 'ready' as const,
    loading: false,
    loadError: false,
    onRetry: noop,
    onCreate: noop,
  };
  if (band === 'extreme') {
    return (
      <KeyFiguresBlock
        {...common}
        options={{ figures: EXTREME_FIGURES }}
        gardens={gardens}
        views={extremeViews}
        varieties={varieties}
        totals={{ ...data.totals, placementCount: 1_284_630 }}
      />
    );
  }
  if (band === 'empty') {
    return (
      <KeyFiguresBlock
        {...common}
        options={null}
        gardens={[]}
        views={new Map()}
        varieties={[]}
        totals={{ gardenCount: 0, placementCount: 0, varietyCount: 0, catalogPlantCount: 536 }}
      />
    );
  }
  if (band === 'unplanted') {
    return (
      <KeyFiguresBlock
        {...common}
        options={null}
        gardens={unplantedGardens}
        views={unplantedViews}
        varieties={[]}
        totals={{ gardenCount: 3, placementCount: 0, varietyCount: 0, catalogPlantCount: 536 }}
      />
    );
  }
  return (
    <KeyFiguresBlock
      {...common}
      options={null}
      gardens={gardens}
      views={views}
      varieties={varieties}
      totals={data.totals}
    />
  );
}

/** The varieties of a Full-width scene (SMA-437, lot V3-08, S6): the forty-four with the sixty gardens, the scenes' sixteen otherwise. */
export const wideVarietiesOf = (list: GardensListKind): DashboardVarietyData[] =>
  list === 'sixty' ? varietiesFortyFour : varieties;

/** The widget of a scene, with the props the page would hand it. */
export function sceneWidget(scene: LayoutScene): ReactNode {
  const weather = scene.weather === 'all' ? weatherAll() : weatherPartial();
  const gs = scene.twoInvites ? gardensTwoUnoriented : scene.long ? gardensLong : gardens;
  const vs = scene.twoInvites ? viewsTwoUnoriented : scene.long ? viewsLong : views;
  const common = { size: scene.size, editing: scene.editing, loading: false, loadError: false, onRetry: noop };
  switch (scene.key) {
    case 'weather':
      return <WeatherBlock {...common} weather={weather} cities="all" gardens={gs} onLocate={noop} onLocated={noop} />;
    case 'gardens': {
      // SMA-448, lot F5-a: twelve gardens under the widget's settings when the
      // scene says so — or the list the scene names (lot F5-b: one, five,
      // sixty, very long names); the page's three otherwise.
      const list = scene.gardens ? gardensListOf(scene.gardens.list ?? 'twelve') : gs;
      return (
        <GardensBlock
          {...common}
          gardens={list}
          showWeatherColumn
          showHarvestColumn={false}
          weather={gardensWeather(weather, list)}
          onLocate={noop}
          onCreateClick={noop}
          onChanged={noop}
          onDeleted={noop}
          onExpand={noop}
          options={scene.gardens?.options ?? null}
          sorts={capabilitiesFor('expert').gardenSorts}
          defaultExpanded={scene.gardens?.expanded}
          defaultQuery={scene.gardens?.query}
        />
      );
    }
    case 'counters': {
      // SMA-437, lot V3-08, S6: the Full width on the gardens the scene names
      // — and, with the sixty, their forty-four varieties, whose fold is drawn.
      if (scene.wide) {
        const list = gardensListOf(scene.wide.list);
        const kinds = wideVarietiesOf(scene.wide.list);
        return (
          <CountersBlock
            {...common}
            options={null}
            varieties={kinds}
            gardens={list}
            totals={{ ...dashboardFixture(list).totals, varietyCount: kinds.length }}
            onOptionsChange={noop}
            defaultExpanded={scene.wide.expanded}
          />
        );
      }
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
    }
    case 'month':
      if (scene.wide) {
        return (
          <MonthBlock
            {...common}
            gardens={gardensListOf(scene.wide.list)}
            varieties={wideVarietiesOf(scene.wide.list)}
            weather={weather}
            defaultExpanded={scene.wide.expanded}
          />
        );
      }
      return <MonthBlock {...common} gardens={gs} varieties={varieties} weather={weather} />;
    case 'tips':
      return <TipsBlock {...common} gardens={gs} views={vs} varieties={varieties} weather={weather} onExpand={noop} />;
    case 'stats':
      if (scene.wide) {
        return <StatsBlock {...common} gardens={gardensListOf(scene.wide.list)} defaultExpanded={scene.wide.expanded} />;
      }
      return <StatsBlock {...common} gardens={gs} />;
    case 'todo':
      return <TodoBlock {...common} gardens={gs} varieties={varieties} weather={weather} onLocate={noop} onExpand={noop} />;
    case 'harvest':
      // « Bientôt disponible », as the page draws it (SMA-437: the Expert
      // preset's grid scene holds it).
      return <InviteBlock blockKey="harvest" size={scene.size} editing={scene.editing} />;
    case 'keyfigures':
      // The Key figures band (SMA-437 lot 1, PR B): its data by the scene's
      // `band` — its four defaults on the scene's gardens unless told otherwise.
      return bandWidget(scene, weather);
    default:
      throw new Error(`No scene for the widget ${scene.key}`);
  }
}

/**
 * SMA-448, lot F3, step L7 (V5: every new form of the v3 enters the harness
 * as a scene) — THE CHOICE SCREEN's situations (V3-01, and the one it left
 * undrawn): a first visit; a change from the chip over the dashboard; an
 * account with five gardens, Novice unavailable; twelve gardens, Novice and
 * Gardener unavailable, Expert current; twelve gardens still on Gardener,
 * kept beyond its own limit. What `/api/formulas` serves the real page, and
 * whether the account chose (the layout's read) — the screen then opens by
 * itself, or from the chip.
 */
export interface ChoiceScene {
  name: 'choice-first' | 'choice-change' | 'choice-five' | 'choice-twelve' | 'choice-kept';
  level: DashboardLevel;
  chosen: boolean;
  gardenCount: number;
  unavailable: Partial<Record<DashboardLevel, FormulaRefusalReason[]>>;
  /** Mandatory at load (the account never chose), or opened from the chip, the dashboard veiled behind. */
  opened: 'mandatory' | 'chip';
}

const gardensOver = (have: number, limit: number): FormulaRefusalReason[] => [{ kind: 'gardens', have, limit }];

export const CHOICE_SCENES: ChoiceScene[] = [
  { name: 'choice-first', level: 'gardener', chosen: false, gardenCount: 0, unavailable: {}, opened: 'mandatory' },
  { name: 'choice-change', level: 'gardener', chosen: true, gardenCount: 2, unavailable: {}, opened: 'chip' },
  { name: 'choice-five', level: 'gardener', chosen: false, gardenCount: 5, unavailable: { novice: gardensOver(5, 3) }, opened: 'mandatory' },
  {
    name: 'choice-twelve',
    level: 'expert',
    chosen: false,
    gardenCount: 12,
    unavailable: { novice: gardensOver(12, 3), gardener: gardensOver(12, 10) },
    opened: 'mandatory',
  },
  {
    name: 'choice-kept',
    level: 'gardener',
    chosen: false,
    gardenCount: 12,
    unavailable: { novice: gardensOver(12, 3), gardener: gardensOver(12, 10) },
    opened: 'mandatory',
  },
];

/** What `/api/formulas` serves the page for a choice scene. */
export const choiceSceneCatalog = (scene: ChoiceScene): FormulasCatalog =>
  catalogFor(scene.level, { chosen: scene.chosen, gardenCount: scene.gardenCount, unavailable: scene.unavailable });

/**
 * SMA-448, lot F3, step L7 — the planner's garden for the refusal scenes: a
 * 20 x 20 plan, the Novice's largest, so the add buttons stop at the bound
 * and the server's refusal of a 21st row can be drawn.
 */
export const PLANNER_GARDEN = {
  id: 'g1',
  name: 'Terrasse',
  description: null,
  layoutWidth: 20,
  layoutHeight: 20,
  cellSize: '50cm',
  orientation: 'S',
  gardenType: 'terrace',
  lightSchedule: null,
  hemisphere: 'N',
  latitudeBand: 'mid',
  location: null,
  locationSource: null,
} as unknown as Garden;

export const PLANNER_LAYOUT: GardenLayoutData = {
  width: 20,
  height: 20,
  cellSize: '50cm',
  cellsJson: null,
  config: { orientation: 'S', gardenType: 'terrace', lightSchedule: null, hemisphere: 'N', latitudeBand: 'mid' },
  placements: [],
};

// ── The Weather widget by formula, on the real page (SMA-448, lot F4, W5) ──

/**
 * SMA-448, lot F4, step W5 (V5: « toute forme nouvelle devient une scène »)
 * — the cities the page launcher serves the Weather widget: ONE (Écully, the
 * scene's), TWO (Écully for Terrasse and Balcon sud, Annecy for Potager du
 * fond), FIVE (a garden each — the two Novice gardens join the three), and
 * five with LONG names — what a navigator, a row of tabs and a column head
 * must ellipsize, and what a Gardener's honest line must name.
 */
export const WEATHER_CITY_SCENES = ['one', 'two', 'five', 'long'] as const;
export type WeatherCityScene = (typeof WEATHER_CITY_SCENES)[number];

/** The city names of each scene, in the order the aggregate serves them. */
export const WEATHER_CITY_NAMES: Record<WeatherCityScene, readonly string[]> = {
  one: ['Écully'],
  two: ['Écully', 'Annecy'],
  five: ['Écully', 'Annecy', 'Grenoble', 'Valence', 'Chambéry'],
  long: [
    'Saint-Rémy-en-Bouzemont-Saint-Genest-et-Isson',
    'Villefranche-sur-Saône',
    'Bourg-Saint-Maurice',
    'Châteauneuf-du-Rhône',
    'Saint-Étienne-de-Saint-Geoirs',
  ],
};

export interface WeatherCitySceneData {
  /** The gardens' aggregate `/api/dashboard` serves: three gardens, or five. */
  data: DashboardData;
  /** The weather aggregate: one place per city, each garden reading one. */
  weather: DashboardWeatherData;
  cities: number;
  gardens: number;
}

/**
 * The aggregate of a scene: Écully first — the same place every other scene
 * reads —, then one place per further city on the shared five-day week, a
 * current temperature of its own; the first two gardens on the first city
 * under `two`, one garden per city under `five` and `long`.
 */
export function weatherCitySceneData(kind: WeatherCityScene): WeatherCitySceneData {
  const names = WEATHER_CITY_NAMES[kind];
  const list = names.length > 3 ? [...gardens, serre, carre] : gardens;
  const places: WeatherLocation[] = names.map((name, index) =>
    index === 0 && kind !== 'long'
      ? ecully
      : locationFixture({
          key: `45.${index + 1}0,5.${index + 1}0`,
          name,
          region: 'Auvergne-Rhône-Alpes',
          days: weekFixture(),
          current: currentFixture({ tempC: 18 + index }),
        })
  );
  const links = list.map((garden, index) => {
    // `two`: the third garden alone on the second city; otherwise one per city.
    const place = places[kind === 'two' ? (index === 2 ? 1 : 0) : Math.min(index, places.length - 1)]!;
    return linkFixture({ gardenId: garden.id, locationKey: place.key, source: index === 0 ? 'profile' : 'garden' });
  });
  return {
    data: dashboardFixture(list, { varieties }),
    weather: weatherFixture(places, links),
    cities: places.length,
    gardens: list.length,
  };
}

// ── The edges of the page's cards, on the real page (SMA-437, lot V3-06) ────

/**
 * SMA-437, lot V3-06 (contract A-21 to A-23, A-25; V5: « toute forme nouvelle
 * de la v3 entre dans le harnais comme une scène […] le pied collant ») —
 * what the page launcher's `fetch` serves the REAL page so Tips and To-do,
 * in Large, draw their invitation in its new forms:
 * - `full` — the five gardens of the page, Balcon sud without an orientation
 *   and without a city, every other one in Écully: Tips groups the four
 *   others and names Balcon sud in the foot stuck at the bottom of its zone
 *   (A-21); To-do lists the tasks of the four and names Balcon sud in its
 *   own (A-22) — five gardens, so that both zones scroll where the card is
 *   pinned, the case the foot exists for (E4: with the three gardens of the
 *   scenes, the To-do zone held its tasks whole at every width);
 * - `empty` — the scenes' three gardens, none oriented, none located: no tip
 *   and no garden checked, Tips' invitation in the middle of the card (A-23).
 */
export type EdgesScene = 'full' | 'empty';
export const EDGES_SCENES: readonly EdgesScene[] = ['full', 'empty'];

export function edgesSceneData(kind: EdgesScene): { data: DashboardData; weather: DashboardWeatherData } {
  if (kind === 'full') {
    const list = [...FIVE];
    return {
      data: dashboardFixture(list, { varieties }),
      weather: weatherFixture(
        [ecully],
        list.map((garden) =>
          garden.id === balcon.id
            ? linkFixture({ gardenId: garden.id, locationKey: null, source: null })
            : linkFixture({ gardenId: garden.id, locationKey: ecully.key, source: 'profile' })
        )
      ),
    };
  }
  const unoriented = gardens.map((garden) => ({ ...garden, config: { ...garden.config, orientation: null } }));
  return {
    data: dashboardFixture(unoriented, { varieties, totals: data.totals }),
    weather: weatherFixture([], unoriented.map((garden) => linkFixture({ gardenId: garden.id, locationKey: null, source: null }))),
  };
}
