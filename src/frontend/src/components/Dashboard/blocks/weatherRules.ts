import type {
  WeatherAlert,
  WeatherDay,
  WeatherLocation,
} from '../../../types/DashboardWeather';
import { hourOf, localHourOf } from './weatherTime';

/**
 * SMA-336 PR 3b/5 — the gardening rules the browser derives from the forecast
 * (decision T9: the server transports, the browser derives), pre-flight § E.2
 * and § E.3. Pure functions over `days[]`, `hours[]` and `alerts[]`; the
 * components only draw what comes out.
 *
 * EVERY threshold below is a product choice, not a law of physics, except the
 * freezing point. Each is named, its status written beside it, and all live in
 * ONE exported object so a future widget option can override them without
 * rewriting the functions.
 */
export const WEATHER_RULES = {
  /** Frost chip — « Gel jeudi · −2° » — when the day's minimum is at or under this. PHYSICAL: the freezing point. */
  frostMaxC: 0,
  /**
   * Frost-risk chip — « Risque de gel jeudi · 2° » — when `frostMaxC < min ≤ this`.
   * ARBITRARY: the 2 m air temperature the provider reports overestimates the
   * ground temperature on a clear night; 2–3 °C is the gardener's usual margin.
   */
  frostRiskMaxC: 2,
  /** Heat chip — « Forte chaleur samedi · 34° » — when the day's maximum reaches this. ARBITRARY: heat-wave vigilance thresholds are regional; 30 °C is a common water-stress threshold. */
  heatMinC: 30,
  /** Wind chip — « Vent fort jeudi · 55 km/h » — when the day's maximum wind reaches this. ARBITRARY but anchored: Beaufort 7 (« grand frais ») begins at 50 km/h; the artboard shows 55. */
  strongWindMinKph: 50,
  /** Rain chip — « Pluie forte mercredi · 25 mm » — when the day's total reaches this. ARBITRARY: the usual waterlogging threshold of vegetable soils, per 24 h. */
  heavyRainMinMm: 20,
  /** The gardener's sentence of the day's band (`.gard`). ARBITRARY thresholds, consigned beside the chips. */
  sentence: {
    /** « Gel possible cette nuit » when tonight's minimum, or any night slot, is at or under this. */
    frostNightMaxC: 2,
    /** « Pluie prévue — inutile d'arroser » when the chance of rain reaches this… */
    rainChanceMin: 60,
    /** …or the day's total rainfall reaches this. */
    rainMinMm: 2,
    /** « arrosez en soirée » (the artboard's sentence) when the day's maximum reaches this; « selon les besoins » below. */
    warmMinC: 28,
    /** Night slots for the frost sentence: from this hour on day 0… */
    nightFromHour: 18,
    /** …to before this hour on day 1. The evening starts at 18 h like the To-do block's « ce soir » (§ H.8). */
    nightUntilHour: 7,
  },
  /** The alert line of the Large card holds at most this many chips (§ E.3, rule 5 « le contenu reste dans sa carte »). */
  maxChips: 3,
  /** …of which at most this many are derived by these rules; officials come first. */
  maxDerivedChips: 2,
  /** An official alert is shown from this CAP severity up (Q7). */
  officialMinSeverity: 'moderate',
  /** An official chip prints `event` cut to this many characters; the headline sits in its tooltip. */
  eventMaxChars: 40,
} as const;

/** The five derived chips, in the severity order the cap applies (frost > heat > wind > rain). */
export const GARDENING_CHIP_KINDS = ['frost', 'frostRisk', 'heat', 'wind', 'rain'] as const;

export type GardeningChipKind = (typeof GARDENING_CHIP_KINDS)[number];

export interface GardeningChip {
  kind: GardeningChipKind;
  /** The day the chip names (« jeudi »). */
  date: string;
  /** Its index in `days[]` — the tie-break « closest first ». */
  dayIndex: number;
  /** °C for frost, frostRisk and heat; km/h for wind; mm for rain — METRIC, the component converts. */
  value: number;
}

/**
 * Every derived chip the week earns — at most ONE per kind, on the earliest
 * day that earns it — ordered closest day first, then by severity.
 */
export function derivedChips(days: readonly WeatherDay[]): GardeningChip[] {
  const found = new Map<GardeningChipKind, GardeningChip>();
  const claim = (kind: GardeningChipKind, dayIndex: number, value: number) => {
    if (!found.has(kind)) {
      found.set(kind, { kind, date: days[dayIndex]!.date, dayIndex, value });
    }
  };

  days.forEach((day, index) => {
    if (day.minTempC <= WEATHER_RULES.frostMaxC) {
      claim('frost', index, day.minTempC);
    } else if (day.minTempC <= WEATHER_RULES.frostRiskMaxC) {
      claim('frostRisk', index, day.minTempC);
    }
    if (day.maxTempC >= WEATHER_RULES.heatMinC) claim('heat', index, day.maxTempC);
    if (day.maxWindKph !== null && day.maxWindKph >= WEATHER_RULES.strongWindMinKph) {
      claim('wind', index, day.maxWindKph);
    }
    if (day.totalPrecipMm !== null && day.totalPrecipMm >= WEATHER_RULES.heavyRainMinMm) {
      claim('rain', index, day.totalPrecipMm);
    }
  });

  return [...found.values()].sort(
    (a, b) =>
      a.dayIndex - b.dayIndex ||
      GARDENING_CHIP_KINDS.indexOf(a.kind) - GARDENING_CHIP_KINDS.indexOf(b.kind)
  );
}

/** The theme an official alert and a derived chip can share — the dedup key of § E.3. */
export type AlertTheme = 'wind' | 'frost' | 'heat' | 'rain';

const CHIP_THEMES: Record<GardeningChipKind, AlertTheme> = {
  frost: 'frost',
  frostRisk: 'frost',
  heat: 'heat',
  wind: 'wind',
  rain: 'rain',
};

/**
 * Keyword detection on `event` + `headline`, FR and EN. FRAGILE BY NATURE
 * (pre-flight § E.3): official alerts arrive in the local language of the
 * place, and a keyword list cannot know every language. It is the one rule of
 * this file marked arbitrary for its FORM and not only for its numbers, and it
 * fails safe — an alert no pattern recognises simply keeps its derived twin.
 * Wind is tested first: a « thunderstorm » is a storm before it is thunder.
 */
const THEME_PATTERNS: ReadonlyArray<[AlertTheme, RegExp]> = [
  ['wind', /vent|wind|temp[êe]te|storm|gale/i],
  ['frost', /gel|frost|freez|froid|cold|neige|snow/i],
  ['heat', /chaleur|heat|canicule/i],
  ['rain', /pluie|rain|inondation|flood|orage|thunder/i],
];

export function alertTheme(alert: WeatherAlert): AlertTheme | null {
  const text = `${alert.event ?? ''} ${alert.headline}`;
  return THEME_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

/** CAP severities, ranked. Anything else — « Unknown », a typo, null — ranks 0 and is not shown. */
const SEVERITY_RANK: Readonly<Record<string, number>> = {
  minor: 1,
  moderate: 2,
  severe: 3,
  extreme: 4,
};

function severityRank(severity: string | null): number {
  return severity ? (SEVERITY_RANK[severity.trim().toLowerCase()] ?? 0) : 0;
}

/**
 * The official alerts worth a chip (Q7): severity at or above Moderate, and
 * DEDUPLICATED when the same alert arrives twice — typically once per language
 * (Météo-France issues FR and EN bulletins of one vigilance). The key is
 * `event` + `effective` + `expires`: two bulletins of one event over one
 * window are one alert, whatever the headline's language. Order preserved.
 */
export function officialAlerts(alerts: readonly WeatherAlert[]): WeatherAlert[] {
  const minimum = SEVERITY_RANK[WEATHER_RULES.officialMinSeverity]!;
  const seen = new Set<string>();
  return alerts.filter((alert) => {
    if (severityRank(alert.severity) < minimum) return false;
    const key = [
      (alert.event ?? alert.headline).trim().toLowerCase(),
      alert.effective ?? '',
      alert.expires ?? '',
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface WeatherChipLine {
  official: WeatherAlert[];
  derived: GardeningChip[];
}

/**
 * What the alert line of the Large card shows (§ E.3): the official alerts
 * first, then the derived chips whose theme no official already states, the
 * whole capped at `maxChips` and the derived part at `maxDerivedChips`.
 *
 * The two cannot contradict each other, only complete: a derived chip asserts
 * a threshold crossed, never the absence of a risk, and an official one asserts
 * a risk our thresholds did not see.
 */
export function weatherChips(
  days: readonly WeatherDay[],
  alerts: readonly WeatherAlert[]
): WeatherChipLine {
  const official = officialAlerts(alerts).slice(0, WEATHER_RULES.maxChips);
  const covered = new Set(official.map(alertTheme).filter((theme) => theme !== null));
  const room = Math.min(WEATHER_RULES.maxDerivedChips, WEATHER_RULES.maxChips - official.length);
  const derived = derivedChips(days)
    .filter((chip) => !covered.has(CHIP_THEMES[chip.kind]))
    .slice(0, Math.max(0, room));
  return { official, derived };
}

/** The four sentences of the gardener's band, by priority (§ E.2). */
export type GardenerSentence = 'frostTonight' | 'rainToday' | 'waterEvening' | 'waterAsNeeded';

/**
 * The sentence of the day, from `days[0]` and the night slots — null when the
 * place has no day to speak of. Night slots are those of day 0 from
 * `nightFromHour` and those of day 1 before `nightUntilHour`; a slot whose
 * hour cannot be read is ignored.
 */
export function gardenerSentence(location: WeatherLocation): GardenerSentence | null {
  const today = location.days[0];
  if (!today) return null;
  const rules = WEATHER_RULES.sentence;

  const tonight = [
    ...today.hours.filter((hour) => {
      const h = hourOf(hour);
      return h !== null && h >= rules.nightFromHour;
    }),
    ...(location.days[1]?.hours ?? []).filter((hour) => {
      const h = hourOf(hour);
      return h !== null && h < rules.nightUntilHour;
    }),
  ];
  const frostTonight =
    today.minTempC <= rules.frostNightMaxC ||
    tonight.some((hour) => hour.tempC <= rules.frostNightMaxC);
  if (frostTonight) return 'frostTonight';

  // A null chance is UNKNOWN (K3): it asserts no rain, so the sentence falls to
  // the total rainfall alone, and to « no rain » when that is unknown too.
  const rainToday =
    (today.chanceOfRain ?? 0) >= rules.rainChanceMin ||
    (today.totalPrecipMm ?? 0) >= rules.rainMinMm;
  if (rainToday) return 'rainToday';

  return today.maxTempC >= rules.warmMinC ? 'waterEvening' : 'waterAsNeeded';
}

/**
 * Whether the place's evening is still ahead — the To-do block's « Arroser ce
 * soir » has no point at 23 h. From `localTime`; true when the hour is unknown.
 */
export function eveningAhead(location: WeatherLocation): boolean {
  const hour = localHourOf(location);
  return hour === null || hour < 23;
}
