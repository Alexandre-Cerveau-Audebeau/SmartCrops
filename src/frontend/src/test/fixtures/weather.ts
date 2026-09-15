import type {
  DashboardWeatherData,
  LocationPick,
  WeatherAlert,
  WeatherCurrent,
  WeatherDay,
  WeatherGardenLink,
  WeatherHour,
  WeatherLocation,
} from '../../types/DashboardWeather';

/**
 * SMA-336 PR 3b/5 — ONE builder per weather wire record, on the rule of
 * `dashboard.ts` beside it: a test overrides what it is about, and the fields
 * that carry meaning stay at the call site.
 *
 * The default place is the artboards' own Lyon of Saturday 12 September 2026
 * at 14:30 local time (`A5MeteoTailles.dc.html`, `_spec.md` § 9): 24 °C,
 * sunny, 29 / 16 on the day, a week from 9 ° to 29 °, one strong-wind
 * Thursday. SYNTHETIC — built from the shape the server documents, never from
 * a provider call.
 */

/** « yyyy-MM-dd HH:mm » for a day and a whole hour — the provider's own local format. */
export const at = (date: string, hour: number): string =>
  `${date} ${String(hour).padStart(2, '0')}:00`;

export const hourFixture = (over: Partial<WeatherHour> = {}): WeatherHour => ({
  time: '2026-09-12 13:00',
  tempC: 26,
  conditionCode: 1000,
  isDay: true,
  chanceOfRain: 0,
  precipMm: 0,
  windKph: 12,
  ...over,
});

/** Twenty-four slots of one day, a smooth curve from `night` at 04:00 to `peak` at 15:00. */
export const hoursOf = (
  date: string,
  night: number,
  peak: number,
  over: Partial<WeatherHour> = {}
): WeatherHour[] =>
  Array.from({ length: 24 }, (_, hour) => {
    const phase = Math.cos(((hour - 15) / 24) * 2 * Math.PI);
    const tempC = Math.round(night + ((peak - night) * (phase + 1)) / 2);
    return hourFixture({
      time: at(date, hour),
      tempC,
      isDay: hour >= 7 && hour < 20,
      ...over,
    });
  });

export const dayFixture = (over: Partial<WeatherDay> = {}): WeatherDay => ({
  date: '2026-09-12',
  minTempC: 16,
  maxTempC: 29,
  avgTempC: 22,
  conditionCode: 1000,
  conditionText: 'Ensoleillé',
  chanceOfRain: 0,
  chanceOfSnow: 0,
  totalPrecipMm: 0,
  maxWindKph: 18,
  sunrise: '07:16 AM',
  sunset: '07:58 PM',
  hours: [],
  ...over,
});

export const currentFixture = (over: Partial<WeatherCurrent> = {}): WeatherCurrent => ({
  tempC: 24,
  feelsLikeC: 24,
  conditionCode: 1000,
  conditionText: 'Ensoleillé',
  isDay: true,
  windKph: 12,
  gustKph: 20,
  humidity: 45,
  precipMm: 0,
  uv: 6,
  lastUpdated: '2026-09-12 14:15',
  ...over,
});

export const alertFixture = (over: Partial<WeatherAlert> = {}): WeatherAlert => ({
  headline: 'Vigilance orange vent violent',
  event: 'Vent violent',
  severity: 'Severe',
  urgency: 'Expected',
  effective: '2026-09-17T06:00:00+02:00',
  expires: '2026-09-17T22:00:00+02:00',
  areas: 'Rhône',
  ...over,
});

/**
 * The artboards' week — « Auj. 0 % 16–29 · Mar. 0 % 15–28 · Mer. 10 % 14–27 ·
 * Jeu. 80 % 9–17 · Ven. 30 % 11–20 » — on the five days from Saturday 12
 * September 2026. The weekday NAMES of the artboard are illustrative; the
 * figures are what the tests read. Hours on the first two days only, like the
 * server sends them.
 */
export const weekFixture = (): WeatherDay[] => [
  dayFixture({
    date: '2026-09-12',
    minTempC: 16,
    maxTempC: 29,
    chanceOfRain: 0,
    hours: hoursOf('2026-09-12', 16, 29),
  }),
  dayFixture({
    date: '2026-09-13',
    minTempC: 15,
    maxTempC: 28,
    chanceOfRain: 0,
    hours: hoursOf('2026-09-13', 15, 28),
  }),
  dayFixture({
    date: '2026-09-14',
    minTempC: 14,
    maxTempC: 27,
    chanceOfRain: 10,
    conditionCode: 1003,
    conditionText: 'Partiellement nuageux',
  }),
  dayFixture({
    date: '2026-09-15',
    minTempC: 9,
    maxTempC: 17,
    chanceOfRain: 80,
    totalPrecipMm: 6,
    maxWindKph: 55,
    conditionCode: 1189,
    conditionText: 'Pluie modérée',
  }),
  dayFixture({
    date: '2026-09-16',
    minTempC: 11,
    maxTempC: 20,
    chanceOfRain: 30,
    conditionCode: 1006,
    conditionText: 'Nuageux',
  }),
];

export const locationFixture = (
  over: Partial<WeatherLocation> = {}
): WeatherLocation => ({
  key: '45.76,4.84',
  name: 'Lyon',
  region: 'Auvergne-Rhône-Alpes',
  country: 'France',
  status: 'fresh',
  fetchedAt: '2026-09-12T12:30:00Z',
  timeZone: 'Europe/Paris',
  localTime: '2026-09-12 14:30',
  current: currentFixture(),
  days: weekFixture(),
  alerts: [],
  ...over,
});

export const linkFixture = (over: Partial<WeatherGardenLink> = {}): WeatherGardenLink => ({
  gardenId: 'g1',
  locationKey: '45.76,4.84',
  source: 'profile',
  ...over,
});

/**
 * An aggregate whose links AGREE with its places: every garden of `links`
 * reads a key of `locations` or none. A test that models a dangling key says
 * so on the line it models it.
 */
export const weatherFixture = (
  locations: WeatherLocation[],
  links: WeatherGardenLink[],
  over: Partial<DashboardWeatherData> = {}
): DashboardWeatherData => ({
  locations,
  gardens: links,
  profileLocated: links.some((link) => link.source === 'profile'),
  ...over,
});

export const pickFixture = (over: Partial<LocationPick> = {}): LocationPick => ({
  name: 'Lyon',
  region: 'Auvergne-Rhône-Alpes',
  country: 'France',
  latitude: 45.764,
  longitude: 4.8357,
  ...over,
});
