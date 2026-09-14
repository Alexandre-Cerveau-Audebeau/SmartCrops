import type {
  DashboardGardenData,
  DashboardVarietyData,
} from '../../../types/DashboardData';
import type {
  DashboardWeatherData,
  WeatherDay,
  WeatherLocation,
} from '../../../types/DashboardWeather';
import { hourOf, localDateOf, parseLocalDateTime } from './weatherTime';

/**
 * SMA-336 PR 3b/5 — the weather tasks of « À faire aujourd'hui » (pre-flight
 * § F.5, § H.8), derived in the browser from the transport aggregate and the
 * weather aggregate (decision T9). ONE pure function feeds both the header
 * chip « N tâches » and the list — the `resolveCountersFigures` lesson: a
 * surface that states a number the list did not pass through cannot agree
 * with it.
 *
 * Two tasks in this lot, both PER GARDEN, both counting PLACEMENTS (« 30
 * plantes », never varieties): watering tonight, and protecting from the cold
 * in its two rules (arbitrage Q9). « Tailler » and « Semer » arrive in PR 4/5
 * in this same function; a garden WITHOUT weather — not located, or a place
 * the provider could not describe — produces NO weather task and is named by
 * {@link gardensWithoutWeather} for the block's invitation instead.
 *
 * Every threshold is named and consigned as arbitrary except the freezing
 * point; all live in {@link TODO_RULES}.
 */
export const TODO_RULES = {
  watering: {
    /** « Arroser ce soir » for the placements of varieties at these catalog watering needs. */
    highNeedLevels: ['High', 'Frequent'] as readonly string[],
    /** …when the day's chance of rain is UNDER this (§ F.5 « chanceOfRain < 30 »). ARBITRARY. */
    maxChanceOfRain: 30,
    /** …and the day's total rainfall is UNDER this, mm (§ F.5 « totalPrecipMm < 1 »). ARBITRARY. */
    maxPrecipMm: 1,
    /** « Ce soir » is the place's hours from this one… (§ H.8 « heures 18–23 du lieu »). */
    eveningFromHour: 18,
    /** …to this one inclusive; no task once the place's clock has passed it. */
    eveningUntilHour: 23,
  },
  cold: {
    /**
     * Rule (a) — « Protéger du froid — N plantes sensibles sous T° »: a
     * placement is at risk on a day whose minimum is at or under its variety's
     * KNOWN tolerance plus this margin. ARBITRARY: the 2 m air temperature
     * overestimates the ground, and a forecast minimum is itself uncertain.
     */
    marginC: 3,
    /**
     * …and ONLY on a day whose minimum is at or under this (round 1, O1).
     * ARBITRARY: a tropical houseplant tolerating 15 °C raised « Protéger du
     * froid — 1 plante connue sensible, 17° ce soir » on a September evening
     * — exact, and useless. Under 12 °C a cold warning is one a gardener acts
     * on; above it, the tolerance is shown in the sentence and nothing is
     * asked. Rule (b), the frost, is untouched.
     */
    maxC: 12,
  },
  frost: {
    /** Rule (b) — « Protéger du gel — N plantes »: EVERY placement, on a day whose minimum is at or under this. PHYSICAL. */
    maxC: 0,
  },
} as const;

export type TodoTaskKind = 'water' | 'cold' | 'frost';

export interface TodoTask {
  /**
   * The session checkbox key: the kind, the garden AND a digest of the content
   * — date, count, threshold (round 1, E9 / E10). A weather refresh that moves
   * a task to another day, another count or another minimum makes ANOTHER
   * task, whose box starts unticked; a refresh that changes nothing keeps it.
   */
  id: string;
  kind: TodoTaskKind;
  gardenId: string;
  gardenName: string;
  /** PLACEMENTS concerned, never varieties. */
  count: number;
  /** The day the task names, in the place's own calendar (« jeudi »). */
  date: string;
  /** Whether that day is the place's own today (« ce soir »). */
  today: boolean;
  /** The day's minimum, °C, for cold and frost; null for watering. */
  tempC: number | null;
  /**
   * Rule (a) only: the KNOWN tolerance the sentence names — « sensibles sous
   * 8° » — the HIGHEST among the placements counted, i.e. the most fragile
   * plant's (round 1, O1). Null for watering and frost.
   */
  toleranceC: number | null;
  /**
   * The place's weather is its LAST KNOWN one, not a fresh forecast (round 1,
   * G2): the task is still planned — a stale forecast beats no plan — and the
   * block says so beside it.
   */
  stale: boolean;
  /** Its index in the place's `days[]` — the tie-break between the two cold rules. */
  dayIndex: number;
}

/**
 * Where « now » comes from for a place: its own `localTime`, never the
 * browser clock. Injected so a test pins the hour without touching a fixture.
 */
export type LocalClock = (location: WeatherLocation) => string | null;

export const localTimeClock: LocalClock = (location) => location.localTime;

/** The place a garden reads, when the aggregate holds one WITH forecast days; null otherwise. */
export function locationOfGarden(
  gardenId: string,
  weather: DashboardWeatherData
): WeatherLocation | null {
  const link = weather.gardens.find((entry) => entry.gardenId === gardenId);
  if (!link?.locationKey) return null;
  const location = weather.locations.find((place) => place.key === link.locationKey);
  return location && location.days.length > 0 ? location : null;
}

/** The gardens the block cannot plan for — the subjects of « Sans la météo de X et Y… ». */
export function gardensWithoutWeather(
  gardens: readonly DashboardGardenData[],
  weather: DashboardWeatherData
): DashboardGardenData[] {
  return gardens.filter((garden) => locationOfGarden(garden.id, weather) === null);
}

/** Whether a day is dry enough to water: both figures under their ceilings, and at least one of them KNOWN (K3). */
function isDryDay(day: WeatherDay): boolean {
  const { maxChanceOfRain, maxPrecipMm } = TODO_RULES.watering;
  if (day.chanceOfRain === null && day.totalPrecipMm === null) return false;
  return (
    (day.chanceOfRain === null || day.chanceOfRain < maxChanceOfRain) &&
    (day.totalPrecipMm === null || day.totalPrecipMm < maxPrecipMm)
  );
}

/** Whether the evening slots of the day (18 h–23 h) stay dry; an unknown slot value asserts no rain. */
function isDryEvening(day: WeatherDay): boolean {
  const { eveningFromHour, eveningUntilHour, maxChanceOfRain, maxPrecipMm } = TODO_RULES.watering;
  return day.hours
    .filter((hour) => {
      const h = hourOf(hour);
      return h !== null && h >= eveningFromHour && h <= eveningUntilHour;
    })
    .every(
      (hour) => (hour.chanceOfRain ?? 0) < maxChanceOfRain && (hour.precipMm ?? 0) < maxPrecipMm
    );
}

export function todoTasks(
  gardens: readonly DashboardGardenData[],
  varieties: readonly DashboardVarietyData[],
  weather: DashboardWeatherData,
  now: LocalClock = localTimeClock
): TodoTask[] {
  const byPlant = new Map(varieties.map((variety) => [variety.plantId, variety]));
  const tasks: TodoTask[] = [];

  for (const garden of gardens) {
    const location = locationOfGarden(garden.id, weather);
    if (!location || garden.placements.length === 0) continue;
    const today = localDateOf(location);
    const nowHour = (() => {
      const stamp = now(location);
      return stamp ? (parseLocalDateTime(stamp)?.hour ?? null) : null;
    })();
    // Chosen over « no task at all » (round 1, G2): a place whose refresh
    // failed still holds the best forecast there is, and a gardener told
    // « d'après la dernière météo connue » can weigh it — while an unlocated
    // garden's invitation would be the wrong sentence for a garden that IS
    // located.
    const stale = location.status === 'stale';

    // Placements per variety — the unit every count is stated in.
    const placementsOf = new Map<string, number>();
    for (const placement of garden.placements) {
      placementsOf.set(placement.plantId, (placementsOf.get(placement.plantId) ?? 0) + 1);
    }

    // ── Watering tonight ────────────────────────────────────────────────
    const day0 = location.days[0]!;
    const highNeed = [...placementsOf].reduce((sum, [plantId, count]) => {
      const level = byPlant.get(plantId)?.wateringNeedLevel;
      return level && TODO_RULES.watering.highNeedLevels.includes(level) ? sum + count : sum;
    }, 0);
    const eveningAhead = nowHour === null || nowHour <= TODO_RULES.watering.eveningUntilHour - 1;
    // « Ce soir » is the PLACE's own evening (round 1, G2 — GitHub 4008082494):
    // a stale aggregate read after the place's midnight still carries
    // yesterday as `days[0]`, and « Arroser ce soir » for a day that has ended
    // is a wrong instruction, not a late one. Unknown date: trusted, as before.
    const day0IsToday = today === null || day0.date === today;
    if (highNeed > 0 && day0IsToday && eveningAhead && isDryDay(day0) && isDryEvening(day0)) {
      tasks.push({
        id: `water:${garden.id}:${day0.date}:${highNeed}`,
        kind: 'water',
        gardenId: garden.id,
        gardenName: garden.name,
        count: highNeed,
        date: day0.date,
        today: true,
        tempC: null,
        toleranceC: null,
        stale,
        dayIndex: 0,
      });
    }

    // ── Cold, rule (a): the placements whose tolerance is KNOWN ────────
    let cold: TodoTask | null = null;
    location.days.some((day, index) => {
      // O1: no cold warning above the named ceiling, whatever a plant tolerates.
      if (day.minTempC > TODO_RULES.cold.maxC) return false;
      let sensitive = 0;
      let mostFragile: number | null = null;
      for (const [plantId, count] of placementsOf) {
        const tolerance = byPlant.get(plantId)?.minToleratedTempC;
        if (tolerance === null || tolerance === undefined) continue;
        if (day.minTempC > tolerance + TODO_RULES.cold.marginC) continue;
        sensitive += count;
        mostFragile = mostFragile === null ? tolerance : Math.max(mostFragile, tolerance);
      }
      if (sensitive === 0) return false;
      cold = {
        id: `cold:${garden.id}:${day.date}:${sensitive}:${mostFragile}`,
        kind: 'cold',
        gardenId: garden.id,
        gardenName: garden.name,
        count: sensitive,
        date: day.date,
        today: day.date === today,
        tempC: day.minTempC,
        toleranceC: mostFragile,
        stale,
        dayIndex: index,
      };
      return true;
    });

    // ── Cold, rule (b): frost on EVERY placement ───────────────────────
    let frost: TodoTask | null = null;
    location.days.some((day, index) => {
      if (day.minTempC > TODO_RULES.frost.maxC) return false;
      frost = {
        id: `frost:${garden.id}:${day.date}:${garden.placements.length}:${day.minTempC}`,
        kind: 'frost',
        gardenId: garden.id,
        gardenName: garden.name,
        count: garden.placements.length,
        date: day.date,
        today: day.date === today,
        tempC: day.minTempC,
        toleranceC: null,
        stale,
        dayIndex: index,
      };
      return true;
    });

    // Frost covers every placement: rule (a) only adds something when it
    // fires on an EARLIER day than the frost.
    const coldTask = cold as TodoTask | null;
    const frostTask = frost as TodoTask | null;
    if (coldTask && (!frostTask || coldTask.dayIndex < frostTask.dayIndex)) tasks.push(coldTask);
    if (frostTask) tasks.push(frostTask);
  }

  return tasks;
}
