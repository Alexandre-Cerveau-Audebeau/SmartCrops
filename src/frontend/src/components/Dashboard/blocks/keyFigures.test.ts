import { describe, expect, it } from 'vitest';
import i18next from '../../../i18n/i18n';
import { keyFigureTiles, KEY_FIGURE_GROUPS, type KeyFiguresInput, type KeyFigureTile } from './keyFigures';
import { KEY_FIGURES, type KeyFigure } from './keyFiguresOptions';
import { gardenAdvice } from './gardenAdvice';
import { monthCalendar } from './plantCalendar';
import { localTimeClock, todoTasks, type TodoClock } from './todoTasks';
import { gardens as sceneGardens, varieties as sceneVarieties, weatherAll, weatherPartial } from '../../../test/layout/scenes';
import { LAYOUT_NOW_MS } from '../../../test/layout/clock';
import { gardenFixture, varietyFixture } from '../../../test/fixtures/dashboard';
import { placement } from '../../../test/fixtures/placements';
import { linkFixture, locationFixture, weatherFixture } from '../../../test/fixtures/weather';
import { EMPTY_WEATHER_DATA, type DashboardWeatherData } from '../../../types/DashboardWeather';
import type { DashboardGardenData, DashboardVarietyData } from '../../../types/DashboardData';
import { formatCount, formatSurface } from '../../../utils/formatNumber';
import { gardenViewOf, isEdibleVariety, ratedCells, sumExposureTallies, type GardenView } from '../../../utils/gardenStats';

// SMA-437 lot 1, PR B, step B3 (pre-flight C.5, D10; arbitrage 4) — the 22
// figures of the Key figures band, each from the source the contract names
// (§ 4.5, « Source exacte »), and the difficult states it draws: never a « 0 »
// that reads as a figure, a dash where nothing can be measured, hectares
// beyond 10 000 m², counts grouped as the language groups them, 0 and 1 in the
// singular — and, when the weather is missing, the value computed without it,
// with a sub-line that says so.

const fr = i18next.getFixedT('fr');
const en = i18next.getFixedT('en');

/** The harness's frozen instant (September 2026) — the calendar and the To-do block read it. */
const CLOCK: TodoClock = { place: localTimeClock, browser: () => new Date(LAYOUT_NOW_MS) };

const NNBSP = '\u202f';

/** An input over the given gardens, their views derived by the page's own engine. */
function inputOf(
  gardens: readonly DashboardGardenData[],
  over: Partial<KeyFiguresInput> = {}
): KeyFiguresInput {
  const varieties = over.varieties ?? [];
  return {
    gardens,
    views: new Map(gardens.map((garden) => [garden.id, gardenViewOf(garden)])),
    varieties,
    totals: {
      gardenCount: gardens.length,
      placementCount: gardens.reduce((sum, garden) => sum + garden.placementCount, 0),
      varietyCount: varieties.length,
      catalogPlantCount: 536,
    },
    weather: EMPTY_WEATHER_DATA,
    weatherStatus: 'ready',
    clock: CLOCK,
    ...over,
  };
}

/** The scene of the layout harness: three gardens, sixteen varieties, 64 placements, every garden in Écully. */
const scene = (weather: DashboardWeatherData = weatherAll(), over: Partial<KeyFiguresInput> = {}) =>
  inputOf(sceneGardens, { varieties: sceneVarieties, weather, ...over });

/** One tile, in French unless told otherwise. */
function tile(figure: KeyFigure, input: KeyFiguresInput, t = fr, language = 'fr'): KeyFigureTile {
  return keyFigureTiles([figure], input, t, language)[0]!;
}

/** The tile's three visible lines, and whether its value is a word. */
const shown = (t: KeyFigureTile) => [t.value, t.unit, t.sub, t.soft];

describe('the catalogue — five groups, the 22 figures once each, in the order of V3-04', () => {
  it('covers the 22 figures of the catalogue, in its order', () => {
    expect(Object.values(KEY_FIGURE_GROUPS).flat()).toEqual([...KEY_FIGURES]);
  });

  it('labels every figure in both languages', () => {
    for (const figure of KEY_FIGURES) {
      expect(tile(figure, scene()).label, figure).not.toMatch(/keyfigures/);
      expect(tile(figure, scene(), en, 'en').label, figure).not.toMatch(/keyfigures/);
    }
  });
});

describe('each figure, from its source — the scene of the layout harness (contract § 4.5)', () => {
  const input = scene();
  const views = sceneGardens.map((garden) => gardenViewOf(garden)).filter((view) => view.hasPlan);
  const sum = (pick: (view: GardenView) => number) => views.reduce((total, view) => total + pick(view), 0);
  const active = sum((view) => view.activeCells);
  const occupied = sum((view) => view.occupiedCells);
  const free = sum((view) => view.freeCells);

  it('Jardins — `DashboardTotals.gardenCount`, and how many are ornamental', () => {
    expect(shown(tile('gardens', input))).toEqual(['3', null, 'dont 1 ornemental', false]);
  });

  it('Plantes — `DashboardTotals.placementCount`', () => {
    expect(shown(tile('plants', input))).toEqual(['64', null, 'posées dans vos jardins', false]);
  });

  it('Variétés — `DashboardTotals.varietyCount`, DISTINCT (D11)', () => {
    expect(shown(tile('varieties', input))).toEqual(['16', null, 'distinctes, tous jardins confondus', false]);
  });

  it('Variétés comestibles — `varieties.filter(isEdibleVariety)`, on `varietyCount`', () => {
    const edible = sceneVarieties.filter(isEdibleVariety).length;
    expect(edible).toBe(12);
    expect(shown(tile('edible', input))).toEqual(['12', 'sur 16', 'la part du potager', false]);
  });

  it('Jardins ornementaux — `isEdible === false`, on the gardens', () => {
    expect(shown(tile('ornam', input))).toEqual(['1', 'sur 3', 'sans récolte attendue', false]);
  });

  it('Surface — Σ `surfaceM2` of the gardens with a plan', () => {
    const surface = formatSurface(sum((view) => view.surfaceM2), 'fr');
    expect(shown(tile('surface', input))).toEqual([surface.value, 'm²', 'cultivable, en cases actives', false]);
  });

  it('Cases actives, Cases plantées, Cases libres — Σ `activeCells`, `occupiedCells`, `freeCells`', () => {
    expect(shown(tile('active', input))).toEqual([formatCount(active, 'fr'), null, 'plantables', false]);
    expect(shown(tile('planted', input))).toEqual([formatCount(occupied, 'fr'), null, 'occupées par vos plantes', false]);
    expect(shown(tile('free', input))).toEqual([formatCount(free, 'fr'), null, 'où planter la suite', false]);
  });

  it('Occupation — Σ occupied / Σ active, the Statistics chip’s formula, never an average of percentages', () => {
    const percent = Math.round((occupied / active) * 100);
    expect(shown(tile('occupancy', input))).toEqual([
      String(percent),
      '%',
      `${occupied} cases plantées sur ${formatCount(active, 'fr')}`,
      false,
    ]);
  });

  it('Cases libres en plein soleil — `sumExposureTallies(freeExposure).full`', () => {
    const sunny = sumExposureTallies(views.map((view) => view.freeExposure)).full;
    expect(tile('freeSun', input).value).toBe(formatCount(sunny, 'fr'));
    expect(tile('freeSun', input).sub).toBe(`sur ${formatCount(free, 'fr')} libres`);
  });

  it('Part en plein soleil — full / rated, at summer · noon', () => {
    const exposure = sumExposureTallies(views.map((view) => view.exposure));
    const percent = Math.round((exposure.full / ratedCells(exposure)) * 100);
    expect(shown(tile('sunShare', input))).toEqual([String(percent), '%', 'de vos cases, en été à midi', false]);
  });

  it('the four « ce mois-ci » — `monthCalendar(…).active.<lane>.length`, in varieties', () => {
    const { active: lanes } = monthCalendar(sceneGardens, sceneVarieties, weatherAll(), CLOCK.browser);
    for (const lane of ['prune', 'sow', 'harvest', 'flower'] as const) {
      const n = lanes[lane].length;
      const expected = n > 0 ? [String(n), n === 1 ? 'variété' : 'variétés', null, false] : ['Aucune', null, null, true];
      expect(shown(tile(lane, input)), lane).toEqual(expected);
    }
  });

  it('À faire aujourd’hui — `todoTasks(…).length`, the To-do block’s own chip, and in how many gardens', () => {
    const tasks = todoTasks(sceneGardens, sceneVarieties, weatherAll(), CLOCK);
    expect(tasks.length).toBeGreaterThan(1);
    const gardens = new Set(tasks.map((task) => task.gardenId)).size;
    expect(shown(tile('todo', input))).toEqual([
      String(tasks.length),
      'tâches',
      gardens === 1 ? 'dans 1 jardin' : `dans ${gardens} jardins`,
      false,
    ]);
  });

  it('Conseils — `gardenAdvice(…).tips.length`, the Tips chip', () => {
    const { tips } = gardenAdvice(sceneGardens, input.views, sceneVarieties, weatherAll());
    expect(tile('tips', input).value).toBe(tips.length > 0 ? String(tips.length) : 'Aucun');
  });

  it('Plans à dessiner — every scene garden has a plan: « Aucun », said, never « 0 »', () => {
    expect(shown(tile('noplan', input))).toEqual(['Aucun', null, 'tous vos plans sont dessinés', true]);
  });

  it('Jardins sans orientation — `gardenAdvice(…).gardensWithoutOrientation` (Balcon sud)', () => {
    expect(shown(tile('noorient', input))).toEqual(['1', null, 'à renseigner pour les conseils', false]);
  });

  it('Jardins localisés and Villes — the weather aggregate’s links and places', () => {
    expect(shown(tile('located', input))).toEqual(['3', 'sur 3', 'tous vos jardins ont une ville', false]);
    expect(shown(tile('cities', input))).toEqual(['1', null, 'Écully', false]);
    const partial = scene(weatherPartial());
    expect(shown(tile('located', partial))).toEqual(['2', 'sur 3', 'Balcon sud n’a pas de ville', false]);
  });

  it('says the whole tile in one sentence for a screen reader', () => {
    expect(tile('free', input).spoken).toBe(`Cases libres\u00a0: ${formatCount(free, 'fr')} — où planter la suite`);
    expect(tile('edible', input, en, 'en').spoken).toBe('Edible varieties: 12 of 16 — the kitchen-garden share');
  });
});

describe('the difficult states (R5, contract § 4.5) — never a zero that reads as a figure', () => {
  const unplanned = [
    gardenFixture({ id: 'g1', name: 'Terrasse', width: null, height: null }),
    gardenFixture({ id: 'g2', name: 'Balcon', width: null, height: null }),
  ];

  it('without a single plan, every figure of the place is a dash — « aucun plan dessiné »', () => {
    for (const figure of KEY_FIGURE_GROUPS.space) {
      expect(shown(tile(figure, inputOf(unplanned))), figure).toEqual(['—', null, 'aucun plan dessiné', true]);
    }
    expect(shown(tile('noplan', inputOf(unplanned)))).toEqual(['2', null, 'rien ne s’y calcule encore', false]);
  });

  it('gardens, a plan, nothing planted: « — », « Aucune », « Rien » — as V3-04 draws it', () => {
    const empty = inputOf([gardenFixture({ id: 'g1', name: 'Terrasse', width: 10, height: 8 })]);
    expect(shown(tile('free', empty))).toEqual(['80', null, 'où planter la suite', false]);
    expect(shown(tile('occupancy', empty))).toEqual(['—', null, 'aucune plante posée', true]);
    expect(shown(tile('planted', empty))).toEqual(['Aucune', null, 'aucune plante posée', true]);
    expect(shown(tile('varieties', empty))).toEqual(['Aucune', null, 'ajoutez des plantes depuis la Bibliothèque', true]);
    expect(shown(tile('plants', empty))).toEqual(['Aucune', null, 'ajoutez des plantes depuis la Bibliothèque', true]);
    expect(shown(tile('edible', empty))).toEqual(['Aucune', null, 'aucune plante posée', true]);
    expect(shown(tile('todo', empty))).toEqual(['Rien', null, 'aujourd’hui', true]);
    expect(shown(tile('tips', empty))).toEqual(['Aucun', null, 'pour l’instant', true]);
    expect(shown(tile('prune', empty))).toEqual(['Aucune', null, null, true]);
  });

  it('a garden whose every cell is planted: no free cell, said', () => {
    const full = inputOf([
      gardenFixture({
        id: 'g1',
        width: 2,
        height: 1,
        placements: [placement({ id: 'a', startRow: 0, startCol: 0 }), placement({ id: 'b', startRow: 0, startCol: 1 })],
        placementCount: 2,
        occupiedCells: 2,
      }),
    ]);
    expect(shown(tile('free', full))).toEqual(['Aucune', null, 'tout est planté', true]);
    expect(shown(tile('freeSun', full))).toEqual(['Aucune', null, 'tout est planté', true]);
    expect(shown(tile('occupancy', full))).toEqual(['100', '%', '2 cases plantées sur 2', false]);
  });

  it('writes hectares beyond 10 000 m² — « 2,66 ha », « 24,56 ha », « 3 ha », never « 245 600 m² » (A-N16)', () => {
    const surfaceOf = (m2: number, language = 'fr') => {
      const garden = gardenFixture({ id: 'g1', width: 10, height: 10 });
      const view = { ...gardenViewOf(garden), surfaceM2: m2 };
      const input = inputOf([garden], { views: new Map([[garden.id, view]]) });
      const t = language === 'fr' ? fr : en;
      const shownTile = tile('surface', input, t, language);
      return `${shownTile.value} ${shownTile.unit}`;
    };
    expect(surfaceOf(26_642)).toBe('2,66 ha');
    expect(surfaceOf(245_600)).toBe('24,56 ha');
    expect(surfaceOf(30_000)).toBe('3 ha');
    expect(surfaceOf(42.5)).toBe('42,5 m²');
    expect(surfaceOf(26_642, 'en')).toBe('2.66 ha');
  });

  it('groups seven digits with the narrow no-break space French writes — « 1 284 630 », never cut', () => {
    const big = inputOf([gardenFixture({ id: 'g1' })]);
    big.totals = { ...big.totals, placementCount: 1_284_630 };
    expect(tile('plants', big).value).toBe(`1${NNBSP}284${NNBSP}630`);
    expect(tile('plants', big, en, 'en').value).toBe('1,284,630');
  });

  it('puts 0 and 1 in the singular — the rule i18next applies', () => {
    const one = inputOf(
      [
        gardenFixture({
          id: 'g1',
          width: 2,
          height: 1,
          placements: [placement({ id: 'a', plantId: 'p-1', startRow: 0, startCol: 0 })],
          placementCount: 1,
          occupiedCells: 1,
        }),
      ],
      { varieties: [varietyFixture({ plantId: 'p-1', gardenIds: ['g1'] })] }
    );
    expect(tile('plants', one).sub).toBe('posée dans vos jardins');
    expect(tile('varieties', one).sub).toBe('distincte, tous jardins confondus');
    expect(tile('active', one).sub).toBe('plantables');
    expect(tile('planted', one).sub).toBe('occupée par vos plantes');
    expect(tile('freeSun', one).sub).toBe('sur 1 libre');
    expect(tile('occupancy', one).sub).toBe('1 case plantée sur 2');
  });
});

describe('the figures that read the weather, when it is missing (arbitrage 4)', () => {
  const calendarOnly = todoTasks(sceneGardens, sceneVarieties, EMPTY_WEATHER_DATA, CLOCK).length;

  it('while the weather loads: the value WITHOUT it, and a sub-line that says so', () => {
    const input = scene(weatherAll(), { weatherStatus: 'loading' });
    expect(calendarOnly).toBeGreaterThan(0);
    expect(shown(tile('todo', input))).toEqual([
      String(calendarOnly),
      calendarOnly === 1 ? 'tâche' : 'tâches',
      'sans la météo — en cours de chargement',
      false,
    ]);
    expect(tile('tips', input).sub).toBe('sans la météo — en cours de chargement');
    expect(shown(tile('located', input))).toEqual(['—', null, 'sans la météo — en cours de chargement', true]);
    expect(shown(tile('cities', input))).toEqual(['—', null, 'sans la météo — en cours de chargement', true]);
  });

  it('behind a failure: « indisponible » — and the last aggregate is not counted on', () => {
    const input = scene(weatherAll(), { weatherStatus: 'error' });
    expect(tile('todo', input).value).toBe(String(calendarOnly));
    expect(tile('todo', input).sub).toBe('sans la météo — indisponible');
    expect(shown(tile('located', input))).toEqual(['—', null, 'sans la météo — indisponible', true]);
    expect(tile('todo', input, en, 'en').sub).toBe('without the weather — unavailable');
  });

  it('with no city at all: « ajoutez une ville » — and the gardens located, « Aucun », said', () => {
    const nowhere = weatherFixture(
      [],
      sceneGardens.map((garden) => linkFixture({ gardenId: garden.id, locationKey: null, source: null }))
    );
    const input = scene(nowhere);
    expect(tile('todo', input).sub).toBe('sans la météo — ajoutez une ville');
    expect(tile('tips', input).sub).toBe('sans la météo — ajoutez une ville');
    expect(shown(tile('located', input))).toEqual(['Aucun', 'sur 3', 'ajoutez une ville', true]);
    expect(shown(tile('cities', input))).toEqual(['Aucune', null, 'ajoutez une ville', true]);
  });

  it('with one planted garden without its city: « sans la météo de 1 jardin — ajoutez une ville »', () => {
    expect(tile('todo', scene(weatherPartial())).sub).toBe('sans la météo de 1 jardin — ajoutez une ville');
    expect(tile('todo', scene(weatherPartial()), en, 'en').sub).toBe(
      'without the weather of 1 garden — add a city'
    );
  });

  it('with a place whose weather is unavailable: « indisponible », not « ajoutez une ville »', () => {
    const dark = locationFixture({ key: '45.77,4.77', name: 'Écully', status: 'unavailable', days: [], current: null });
    const unavailable = weatherFixture(
      [dark],
      sceneGardens.map((garden) => linkFixture({ gardenId: garden.id, locationKey: dark.key }))
    );
    expect(tile('todo', scene(unavailable)).sub).toBe('sans la météo — indisponible');
    // The links are there: the gardens ARE located.
    expect(tile('located', scene(unavailable)).value).toBe('3');
  });

  it('never a misleading zero: nothing to do without the weather is « Rien », with its reason', () => {
    const idle = inputOf([gardenFixture({ id: 'g1', width: 2, height: 2 })], { weatherStatus: 'error' });
    expect(shown(tile('todo', idle))).toEqual(['Rien', null, 'sans la météo — indisponible', true]);
  });

  it('with every planted garden read, no weather sub-line at all', () => {
    expect(tile('todo', scene()).sub).not.toMatch(/météo/);
    expect(tile('tips', scene()).sub).not.toMatch(/météo/);
  });
});

describe('the cities, named', () => {
  it('names two cities, then counts the others', () => {
    const places = ['Lyon', 'Annecy', 'Grenoble', 'Nice'].map((name, index) =>
      locationFixture({ key: `4${index}.00,4.00`, name })
    );
    const weather = weatherFixture(
      places,
      places.map((place, index) => linkFixture({ gardenId: `g${index}`, locationKey: place.key }))
    );
    const input = inputOf(
      places.map((_, index) => gardenFixture({ id: `g${index}` })),
      { weather }
    );
    expect(shown(tile('cities', input))).toEqual(['4', null, 'Lyon, Annecy +2', false]);
  });
});

describe('the varieties of a garden that is not in the aggregate still count as their catalogue says', () => {
  it('reads the edible verdict from the variety rows alone (rule R4)', () => {
    const rows: DashboardVarietyData[] = [
      varietyFixture({ plantId: 'a', plantType: 'Ornamental', isEdible: false }),
      varietyFixture({ plantId: 'b', plantType: 'Vegetable', isEdible: null }),
    ];
    const input = inputOf([gardenFixture({ id: 'g1' })], { varieties: rows });
    expect(shown(tile('edible', input))).toEqual(['1', 'sur 2', 'la part du potager', false]);
  });
});
