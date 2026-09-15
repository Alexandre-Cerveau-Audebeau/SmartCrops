/**
 * SMA-336 PR 3b/5 — the wire shape of `GET /api/dashboard/weather`, delivered
 * by PR 3a/5 (`DashboardWeatherResponse.cs`, pre-flight § D.2): the weather of
 * every distinct place the caller's gardens sit in, plus which garden reads
 * which place.
 *
 * A TRANSPORT aggregate (decision D9), METRIC only: the server relays what the
 * provider gave, the browser converts (°F, mph follow `useUnitSystem`), maps
 * the condition codes to icons, derives the gardener's sentence, the frost /
 * heat / wind / rain chips and the day's tasks, and draws.
 *
 * Five fields are NULLABLE on purpose (PR 3a round 1, K3): `current.isDay`,
 * `day.chanceOfRain`, `day.chanceOfSnow`, `hour.isDay` and `hour.chanceOfRain`
 * are `null` when the provider did not say — never a guessed « night » or
 * « 0 % ». A reader renders « unknown », not a value.
 */

/** Data from the fresh window, the last known data, or nothing to show. */
export const WEATHER_STATUSES = ['fresh', 'stale', 'unavailable'] as const;

export type WeatherStatus = (typeof WEATHER_STATUSES)[number];

/** Where a garden's location comes from — its own override, or the account's default. */
export const LOCATION_SOURCES = ['garden', 'profile'] as const;

export type LocationSource = (typeof LOCATION_SOURCES)[number];

/** Current conditions, metric. */
export interface WeatherCurrent {
  tempC: number;
  feelsLikeC: number | null;
  /** The provider's condition code — `weatherIcons.ts` maps it, an unknown code degrades to « cloudy ». */
  conditionCode: number;
  /** The condition in the requested language, as the provider wrote it. */
  conditionText: string | null;
  /** Day or night for the icon variant; null when the provider did not say. */
  isDay: boolean | null;
  windKph: number | null;
  gustKph: number | null;
  humidity: number | null;
  precipMm: number | null;
  uv: number | null;
  lastUpdated: string | null;
}

/** One hourly slot, metric. */
export interface WeatherHour {
  /** « yyyy-MM-dd HH:mm », LOCAL to the place — the six slots are placed without any time zone. */
  time: string;
  tempC: number;
  conditionCode: number;
  isDay: boolean | null;
  /** 0..100, or null when the provider did not say. */
  chanceOfRain: number | null;
  precipMm: number | null;
  windKph: number | null;
}

/** One forecast day, metric. */
export interface WeatherDay {
  /** « yyyy-MM-dd », local to the place. Built into a Date with `new Date(y, m − 1, d)`, never parsed as UTC. */
  date: string;
  minTempC: number;
  maxTempC: number;
  avgTempC: number | null;
  conditionCode: number;
  conditionText: string | null;
  /** 0..100, or null when the provider did not say. */
  chanceOfRain: number | null;
  chanceOfSnow: number | null;
  totalPrecipMm: number | null;
  maxWindKph: number | null;
  sunrise: string | null;
  sunset: string | null;
  /** 24 entries on the first two days, none on the others: the six slots can straddle midnight. */
  hours: WeatherHour[];
}

/** One official alert — its identity and timing, never its paragraphs. */
export interface WeatherAlert {
  headline: string;
  event: string | null;
  /** CAP severity as the provider gives it (Minor / Moderate / Severe / Extreme), or null. */
  severity: string | null;
  urgency: string | null;
  effective: string | null;
  expires: string | null;
  areas: string | null;
}

/** One place and its weather. */
export interface WeatherLocation {
  /** Coordinates rounded to two decimals, « 45.76,4.84 » — the identity of the place and of its tab. */
  key: string;
  /** The STORED place name, what the user chose — never the provider's. */
  name: string;
  region: string | null;
  country: string | null;
  status: WeatherStatus;
  /** UTC ISO instant of the provider call that produced the data; null when unavailable. */
  fetchedAt: string | null;
  timeZone: string | null;
  /** « yyyy-MM-dd HH:mm », local to the place — the ONLY « now » the widget reads. */
  localTime: string | null;
  current: WeatherCurrent | null;
  /** Up to five days, today first; empty when unavailable. */
  days: WeatherDay[];
  /** Official alerts, unexpired, at most five. */
  alerts: WeatherAlert[];
}

/** Which place a garden reads, and why. */
export interface WeatherGardenLink {
  gardenId: string;
  /** The {@link WeatherLocation.key} it reads, or null when the garden is not located. */
  locationKey: string | null;
  source: LocationSource | null;
}

export interface DashboardWeatherData {
  /** One entry per distinct place, in the order of the gardens (newest first). */
  locations: WeatherLocation[];
  /** EVERY garden of the caller, located or not. */
  gardens: WeatherGardenLink[];
  /** Whether the account carries a default location. */
  profileLocated: boolean;
}

/**
 * A place the geocoder handed back (`GET /api/geocode/search`), sent back AS IS
 * to `PUT /api/gardens/{id}/location` and `PUT /api/auth/profile/location`:
 * the browser stores a result it was given and never invents one.
 */
export interface LocationPick {
  name: string;
  region: string | null;
  /** Country NAME as the provider returned it — never an ISO code. */
  country: string | null;
  latitude: number;
  longitude: number;
}

export function isWeatherStatus(value: string): value is WeatherStatus {
  return (WEATHER_STATUSES as readonly string[]).includes(value);
}

export function isLocationSource(value: string): value is LocationSource {
  return (LOCATION_SOURCES as readonly string[]).includes(value);
}

/**
 * What the page hands the weather widget, the Gardens table and the To-do
 * block while the aggregate is in flight or has failed.
 *
 * FROZEN, and frozen deep — the same rule as `EMPTY_DASHBOARD_DATA` (round 1,
 * E20): every widget mounted during a load holds these same references, and
 * `locations` and `gardens` are exactly what a widget would `sort` or `push`
 * into. One in-place write anywhere downstream would poison the empty state
 * for the whole application until a reload.
 */
export const EMPTY_WEATHER_DATA: DashboardWeatherData = freezeDeep({
  locations: [],
  gardens: [],
  profileLocated: false,
});

/**
 * Freezes the aggregate AND every container it holds — derived from the VALUE,
 * not from a field list, so a container added to the shape is covered the day
 * it arrives (round 6, Extension #4-19).
 */
function freezeDeep(data: DashboardWeatherData): DashboardWeatherData {
  for (const value of Object.values(data)) {
    if (typeof value === 'object' && value !== null) Object.freeze(value);
  }
  return Object.freeze(data);
}
