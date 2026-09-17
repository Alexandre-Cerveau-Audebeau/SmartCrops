import type { DashboardGardenData, DashboardVarietyData } from '../../../types/DashboardData';
import type { DashboardWeatherData } from '../../../types/DashboardWeather';
import { cellRef } from '../../../utils/cellRef';
import type { ExposureCategory, MomentsLit } from '../../../utils/exposure';
import { clipPlacement, placementExposure, type GardenView } from '../../../utils/gardenStats';
import { varietyName } from './plantCalendar';
import { TODO_RULES, isDryDay, locationOfGarden } from './todoTasks';
import { WEATHER_RULES } from './weatherRules';
import { localDateOf } from './weatherTime';

/**
 * SMA-336 PR 4b/5 — the « Conseils » of the dashboard, derived in the browser
 * from the plans, the catalog and the forecast (decision D9), pre-flight § B and
 * plan ④b.9. PURE: no React, no clock, no DOM. ONE function, {@link gardenAdvice},
 * feeds the header chip « 3 conseils », the three sizes of the widget and the
 * gallery thumbnail — the `resolveCountersFigures` lesson.
 *
 * TWO families, the ones the frozen artboards draw (`Main.dc.html` l. 295-309,
 * `A3Expert.dc.html` l. 315-334), and nothing the artboards do not draw:
 *
 * - EXPOSURE — the catalog's daily sunlight hours of a variety against the
 *   exposure of the cell its placement is anchored on, at « summer · noon »
 *   (D12, arbitrage Q3), read off the SAME engine pass the Statistics widget
 *   counts from ({@link placementExposure}, PR 4b/5 step 1). Two rules,
 *   {@link ADVICE_RULES.exposure}: « préfère le plein soleil — cette case est à
 *   l'ombre l'après-midi » and « préfère la mi-ombre — cette case est en plein
 *   soleil à midi ». One tip per (variety, garden), on the FIRST anchor
 *   concerned in the plan's order; the verdict is the anchor cell's (T3) — a
 *   footprint may straddle two categories, and a sentence has to name ONE cell.
 * - WATERING — a variety of high watering need against the rain the forecast
 *   holds for the garden's place: « aime une terre toujours fraîche — pas de
 *   pluie avant jeudi ». ONE tip per garden (arbitrage Q7, T7), naming the
 *   high-need varieties and the cell of the first of them.
 *
 * THE BOUNDARY WITH THE TO-DO TASK (pre-flight § B.2, constat 13). ③b's
 * « Arroser ce soir — N plantes (Terrasse), pas de pluie prévue » and this
 * widget's watering tip read the same catalog field and the same forecast,
 * so they could say the same thing twice. They do not, by construction:
 *
 * - The TASK says TONIGHT: one action, dated today, counting PLACEMENTS —
 *   it fires on a dry `days[0]` (`isDryDay`) with a dry evening still ahead.
 * - The TIP says THIS PLANT, AT THIS CELL, AND WHY, over THE WEEK: it names
 *   the varieties and a cell, and fires only when at least
 *   {@link ADVICE_RULES.watering.drySpellMinDays} consecutive dry days start
 *   today, stating the first rainy day of the forecast (« avant jeudi ») or
 *   its absence (« pas de pluie prévue cette semaine »).
 * - So when TODAY is the only dry day, the task speaks and the tip is
 *   SILENT — there, the tip would only repeat the task. When two or more dry
 *   days follow, both exist and say different things: the hour on one side,
 *   the plant, the cell and the horizon on the other. `gardenAdvice.test.ts`
 *   pins both halves of this on the same fixture.
 *
 * A dry day is the task's own {@link isDryDay} — one predicate, imported, so
 * the two surfaces cannot disagree on what « dry » means; a rainy day is the
 * Weather widget's own sentence thresholds (`WEATHER_RULES.sentence`), so
 * « pas de pluie avant jeudi » names the day the gardener's band would call
 * rain.
 *
 * SILENCE, not a second invitation, on a garden with no weather (Q7, T6): the
 * To-do block already carries « Sans la météo de X — Ajouter une ville → »,
 * and the Design Reference (§ 1.4) allows an invitation or nothing.
 *
 * NO exposure tip on a garden whose orientation is unknown (arbitrage Q6): the
 * engine assumes « S » there (`exposure.ts`, `normalizeOrientation`) and the
 * Statistics widget prints the tally so, but a tip about ONE plant on a
 * default would be an assertion, not an information. The A4 invitation is
 * drawn instead — « Sans l'orientation de « Balcon sud », impossible de
 * comparer l'exposition — Configurer le jardin → » — and it is COUNTED, never
 * flagged (D2). Indoor gardens are likewise excluded from the exposure family
 * in this lot (T4): their category is uniform and schedule-driven, the
 * sentence « cette case est à l'ombre l'après-midi » has no meaning there.
 *
 * NO tip of the third kind the pre-flight examined and rejected (§ B.4,
 * constat 14; Alexandre's arbitrage of 17 Sept. 2026): the calendar of ④a says
 * the month and the To-do task says today, and a third surface saying the
 * same would break that rule.
 *
 * Every threshold is named and consigned as ARBITRARY beside its measure.
 */
export const ADVICE_RULES = {
  exposure: {
    /**
     * « préfère le plein soleil » — the variety's `sunlightHoursMin` at or
     * over this, on an anchor that is NOT full sun. ARBITRARY, MEASURED
     * (pre-flight § B.1.2): « min ≥ 6 h » coincides with « full sun » in the
     * gated text for 335 of the 355 catalog plants at or over it; ≥ 8 would
     * keep 56. It still misfiles ≈ 4 % (20 declared shade plants carry a
     * min ≥ 6), which is why the « Pourquoi » prints the hours.
     */
    sunLoverMinHours: 6,
    /**
     * « préfère la mi-ombre » — `sunlightHoursMax` KNOWN and at or under
     * this… ARBITRARY, MEASURED: 116 catalog plants qualify with the pair
     * below; « max ≤ 4 » alone would keep 15. A shade plant whose max is
     * unknown (37 % of the catalog) cannot be recognised — the honest limit
     * of the data, not a threshold to lower.
     */
    shadeLoverMaxHours: 6,
    /** …AND `sunlightHoursMin` at or under this, on an anchor in full sun. ARBITRARY, same measure. */
    shadeLoverMinHours: 4,
  },
  watering: {
    /**
     * The tip needs at least this many CONSECUTIVE dry days from the place's
     * today. ARBITRARY: it is the boundary with the To-do task (module doc) —
     * one dry day is « ce soir », the task's; two are a spell, the tip's.
     */
    drySpellMinDays: 2,
  },
} as const;

/** The two families, the way the widget picks an icon and a sentence. */
export type TipKind = 'sunLover' | 'shadeLover' | 'watering';

/** When the anchor cell is shaded — the half of the sun-lover sentence after the dash. */
export type ShadedAt = 'morning' | 'noon' | 'afternoon';

interface TipBase {
  /**
   * Content-bearing identity (lesson E9 / E10 of ③b): the kind, the garden,
   * the cell and whatever the sentence prints — a refresh that changes the
   * sentence makes ANOTHER tip. It is the React key and the key of the
   * session-only « Pourquoi » state.
   */
  id: string;
  gardenId: string;
  gardenName: string;
  /** « F3 » — the anchor cell the sentence points at, in the planner's own grammar (`cellRef`). */
  cell: string;
  /** The varieties the sentence names — ONE for an exposure tip — by display name, in the plan's order. */
  names: string[];
  /** Their ids, in the same order. */
  plantIds: string[];
}

export interface SunLoverTip extends TipBase {
  kind: 'sunLover';
  /** The catalog's minimum the « Pourquoi » prints. */
  sunlightHoursMin: number;
  /** The anchor's category, as the engine rated it. */
  category: ExposureCategory;
  shadedAt: ShadedAt;
}

export interface ShadeLoverTip extends TipBase {
  kind: 'shadeLover';
  sunlightHoursMin: number;
  sunlightHoursMax: number;
  /** Always `full` — kept so the « Pourquoi » reads the same field on both exposure tips. */
  category: ExposureCategory;
}

export interface WateringTip extends TipBase {
  kind: 'watering';
  /** The place the forecast was read for — the « Pourquoi » names it. */
  placeName: string;
  /** Consecutive dry days from the place's today, ≥ `drySpellMinDays`. */
  dryDays: number;
  /** The first rainy day of the forecast, « yyyy-MM-dd », or null when no day known is rainy. */
  nextRainDay: string | null;
  /** Read on the place's LAST KNOWN weather (the G2 rule of ③b): said beside the sentence. */
  stale: boolean;
}

export type Tip = SunLoverTip | ShadeLoverTip | WateringTip;

/** What the widget says about one garden. */
export interface GardenAdvice {
  garden: DashboardGardenData;
  /** Exposure tips in the plan's order, then the watering tip. */
  tips: Tip[];
  /**
   * Whether « Rien à signaler — vos plantes sont là où elles aiment être » may
   * be STATED for this garden when it has no tip (T6): the exposure family
   * was checked — a plan, a known orientation, outdoors — AND the watering
   * family was checked or had nothing to check (no high-need variety). A
   * garden that could not be checked says nothing here: its reason is drawn
   * elsewhere — the orientation invitation below, the To-do block's weather
   * invitation — and « nothing to report » would be a misleading zero.
   */
  evaluated: boolean;
}

export interface Advice {
  /** One entry per garden WITH placements, in the gardens' order. */
  byGarden: GardenAdvice[];
  /** Every tip, in the order the widget lists them — the chip counts THIS. */
  tips: Tip[];
  /** Gardens with placements, outdoors, whose orientation is unknown — the A4 invitation, counted (D2, Q6). */
  gardensWithoutOrientation: DashboardGardenData[];
  /**
   * PLACEMENTS whose variety carries no sunlight hours in the catalog —
   * « N plantes sans exposition connue » (D2, counted). Placements, the unit
   * every « N plantes » of the dashboard is stated in (③b), never varieties.
   */
  unknownExposure: number;
}

/**
 * When the anchor is shaded, from the engine's own triplet when it has one
 * (SMA-309 — « cette case est à l'ombre l'après-midi » is then EXACT), else
 * from the category: a manual override replaces the triplet, and its label
 * is the user's own word for the cell. `null` for a full-sun cell, which no
 * sun-lover sentence is about.
 */
export function shadedAtOf(
  category: ExposureCategory,
  momentsLit: Readonly<MomentsLit> | null
): ShadedAt | null {
  if (momentsLit) {
    // Noon decides the category (`aggregateExposure`), so it is named first.
    if (!momentsLit.noon) return 'noon';
    if (!momentsLit.evening) return 'afternoon';
    if (!momentsLit.morning) return 'morning';
    return null;
  }
  switch (category) {
    case 'morning':
      return 'afternoon';
    case 'afternoon':
      return 'morning';
    case 'shade':
      return 'noon';
    default:
      return null;
  }
}

/** The placed varieties of a garden, DISTINCT, in the plan's order — the order every sentence lists them in. */
function placedVarietiesOf(
  garden: DashboardGardenData,
  byPlant: ReadonlyMap<string, DashboardVarietyData>
): DashboardVarietyData[] {
  const seen = new Set<string>();
  const placed: DashboardVarietyData[] = [];
  for (const placement of garden.placements) {
    if (seen.has(placement.plantId)) continue;
    seen.add(placement.plantId);
    const variety = byPlant.get(placement.plantId);
    if (variety) placed.push(variety);
  }
  return placed;
}

/** Whether the exposure family can be judged on this garden at all: outdoors, oriented, and drawn. */
function exposureApplies(garden: DashboardGardenData, view: GardenView | undefined): boolean {
  return (
    garden.config.gardenType !== 'indoor' &&
    garden.config.orientation !== null &&
    view?.hasPlan === true
  );
}

/**
 * The exposure tips of ONE garden — nothing when the family does not apply
 * to it (see {@link exposureApplies}; the caller draws the invitation).
 *
 * The placements are walked in the plan's order and the tip of a variety
 * points at the FIRST anchor that earns one (T3): a sun lover planted twice
 * in the sun and once in the shade gets one tip, on the shaded cell, and a
 * later placement of the same variety adds nothing — the sentence is about
 * the variety in this garden and points at one cell. A placement the view
 * has no exposure for (outside the plan, on a switched-off cell) is skipped,
 * never defaulted: {@link placementExposure} answers null there and null
 * means « nothing to say ».
 */
export function exposureTips(
  garden: DashboardGardenData,
  view: GardenView | undefined,
  varieties: readonly DashboardVarietyData[]
): Array<SunLoverTip | ShadeLoverTip> {
  if (!view || !exposureApplies(garden, view)) return [];
  const byPlant = new Map(varieties.map((variety) => [variety.plantId, variety]));
  const { sunLoverMinHours, shadeLoverMaxHours, shadeLoverMinHours } = ADVICE_RULES.exposure;

  const tipped = new Set<string>();
  const tips: Array<SunLoverTip | ShadeLoverTip> = [];
  for (const placement of garden.placements) {
    if (tipped.has(placement.plantId)) continue;
    const variety = byPlant.get(placement.plantId);
    if (!variety || variety.sunlightHoursMin === null) continue;

    const exposure = placementExposure(view, placement);
    if (!exposure) continue;

    const cell = cellRef(exposure.row, exposure.col);
    const base = {
      gardenId: garden.id,
      gardenName: garden.name,
      cell,
      names: [varietyName(variety)],
      plantIds: [variety.plantId],
    };
    const min = variety.sunlightHoursMin;
    const max = variety.sunlightHoursMax;

    if (min >= sunLoverMinHours && exposure.category !== 'full') {
      const shadedAt = shadedAtOf(exposure.category, exposure.momentsLit);
      if (shadedAt === null) continue;
      tipped.add(variety.plantId);
      tips.push({
        ...base,
        id: `sunLover:${garden.id}:${variety.plantId}:${cell}:${shadedAt}`,
        kind: 'sunLover',
        sunlightHoursMin: min,
        category: exposure.category,
        shadedAt,
      });
    } else if (
      max !== null &&
      max <= shadeLoverMaxHours &&
      min <= shadeLoverMinHours &&
      exposure.category === 'full'
    ) {
      tipped.add(variety.plantId);
      tips.push({
        ...base,
        id: `shadeLover:${garden.id}:${variety.plantId}:${cell}`,
        kind: 'shadeLover',
        sunlightHoursMin: min,
        sunlightHoursMax: max,
        category: exposure.category,
      });
    }
  }
  return tips;
}

/** Whether a variety is one « Arroser ce soir » counts — the task's own list of levels, so the two surfaces read the same plants. */
function isHighNeed(variety: DashboardVarietyData): boolean {
  return (
    variety.wateringNeedLevel !== null &&
    TODO_RULES.watering.highNeedLevels.includes(variety.wateringNeedLevel)
  );
}

/**
 * « B2 » — the anchor cell of the first placement, in the plan's order, that
 * belongs to one of `plantIds` AND lands in the plan (clipped by the one
 * `clipPlacement` the occupancy and the thumbnail use); null when none does,
 * and then there is no cell for a sentence to point at, hence no tip.
 */
function firstAnchorCellOf(
  garden: DashboardGardenData,
  plantIds: ReadonlySet<string>
): string | null {
  const rows = garden.height ?? 0;
  const cols = garden.width ?? 0;
  for (const placement of garden.placements) {
    if (!plantIds.has(placement.plantId)) continue;
    const box = clipPlacement(placement, rows, cols);
    if (box) return cellRef(box.row, box.col);
  }
  return null;
}

/** Whether a day is one the Weather widget's own sentence would call rain (`WEATHER_RULES.sentence`). */
function isRainyDay(day: { chanceOfRain: number | null; totalPrecipMm: number | null }): boolean {
  const { rainChanceMin, rainMinMm } = WEATHER_RULES.sentence;
  return (day.chanceOfRain ?? 0) >= rainChanceMin || (day.totalPrecipMm ?? 0) >= rainMinMm;
}

/**
 * The watering tip of ONE garden — at most one (Q7) — or none: no place
 * with forecast days, no high-need variety, no anchor in the plan, or a dry
 * spell shorter than {@link ADVICE_RULES.watering.drySpellMinDays} (the task's
 * ground, see the module doc).
 *
 * The days are the place's own, from its today on — the D1 filter of
 * `todoTasks` — and the spell is counted with the task's own {@link isDryDay}.
 */
export function wateringTips(
  garden: DashboardGardenData,
  varieties: readonly DashboardVarietyData[],
  weather: DashboardWeatherData
): WateringTip[] {
  if (garden.placements.length === 0) return [];
  const location = locationOfGarden(garden.id, weather);
  if (!location) return [];

  const byPlant = new Map(varieties.map((variety) => [variety.plantId, variety]));
  const highNeed = placedVarietiesOf(garden, byPlant).filter(isHighNeed);
  if (highNeed.length === 0) return [];

  const today = localDateOf(location);
  const days = today === null ? location.days : location.days.filter((day) => day.date >= today);
  let dryDays = 0;
  while (dryDays < days.length && isDryDay(days[dryDays]!)) dryDays += 1;
  if (dryDays < ADVICE_RULES.watering.drySpellMinDays) return [];

  const cell = firstAnchorCellOf(garden, new Set(highNeed.map((variety) => variety.plantId)));
  if (cell === null) return [];

  const nextRainDay = days.find(isRainyDay)?.date ?? null;
  const plantIds = highNeed.map((variety) => variety.plantId);
  return [
    {
      id: `watering:${garden.id}:${days[0]!.date}:${dryDays}:${nextRainDay ?? 'none'}:${plantIds.join('|')}`,
      kind: 'watering',
      gardenId: garden.id,
      gardenName: garden.name,
      cell,
      names: highNeed.map(varietyName),
      plantIds,
      placeName: location.name,
      dryDays,
      nextRainDay,
      stale: location.status === 'stale',
    },
  ];
}

/**
 * Everything the widget shows, in one pass over the gardens.
 *
 * `views` is the page's own `useGardenViews` map — one derivation per garden,
 * shared with the Gardens and Statistics widgets — so no engine pass runs
 * here. A garden without placements is not a subject: no tip, no group, no
 * invitation.
 */
export function gardenAdvice(
  gardens: readonly DashboardGardenData[],
  views: ReadonlyMap<string, GardenView>,
  varieties: readonly DashboardVarietyData[],
  weather: DashboardWeatherData
): Advice {
  const byPlant = new Map(varieties.map((variety) => [variety.plantId, variety]));
  const byGarden: GardenAdvice[] = [];
  const gardensWithoutOrientation: DashboardGardenData[] = [];
  let unknownExposure = 0;

  for (const garden of gardens) {
    if (garden.placements.length === 0) continue;
    const view = views.get(garden.id);

    for (const placement of garden.placements) {
      const variety = byPlant.get(placement.plantId);
      if (variety && variety.sunlightHoursMin === null) unknownExposure += 1;
    }

    const outdoors = garden.config.gardenType !== 'indoor';
    if (outdoors && garden.config.orientation === null) gardensWithoutOrientation.push(garden);

    const exposure = exposureTips(garden, view, varieties);
    const watering = wateringTips(garden, varieties, weather);

    // The watering family has something to check only when a high-need
    // variety is planted; then it is checked only when the garden reads a
    // place with forecast days.
    const wateringApplies = placedVarietiesOf(garden, byPlant).some(isHighNeed);
    const wateringChecked = !wateringApplies || locationOfGarden(garden.id, weather) !== null;

    byGarden.push({
      garden,
      tips: [...exposure, ...watering],
      evaluated: exposureApplies(garden, view) && wateringChecked,
    });
  }

  return {
    byGarden,
    tips: byGarden.flatMap((entry) => entry.tips),
    gardensWithoutOrientation,
    unknownExposure,
  };
}
