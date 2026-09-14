import {
  isLocationSource,
  isWeatherStatus,
  type DashboardWeatherData,
  type LocationPick,
  type LocationSource,
  type WeatherAlert,
  type WeatherCurrent,
  type WeatherDay,
  type WeatherGardenLink,
  type WeatherHour,
  type WeatherLocation,
  type WeatherStatus,
} from '../types/DashboardWeather';
import { fetchJson } from './fetchJson';
import {
  arrayOf,
  isBoolean,
  isFiniteNumber,
  isNullableString,
  isString,
  isWholeNumber,
  matches,
  nullable,
  type Check,
} from './wireChecks';

const API_BASE = '/api';

// Every endpoint here sits behind [Authorize] — `credentials: 'include'` so
// the HttpOnly auth cookie flows (SMA-280 policy: every call site states it).

/**
 * SMA-336 PR 3b/5 — the weather service boundary, on the patron PR 2/5 fixed
 * over eight rounds (pre-flight § D.5): one validator per wire record, each a
 * `Checks<T>` map the compiler holds EXHAUSTIVE over the type and typed field
 * by field, so a field added to a weather type without its check — or with a
 * check of the wrong type — is a build error, not a runtime surprise.
 *
 * The numbers are the point of this file. A temperature is negative and
 * decimal, a wind or a rainfall decimal: every one of them goes through
 * `isFiniteNumber`, never `isWholeNumber`, which would refuse « −2 °C ».
 * Percentages are whole and bounded (`isPercent`); condition codes are whole
 * (the icon table degrades an unknown code, it never throws).
 *
 * Five fields ACCEPT `null` (PR 3a round 1, K3): `current.isDay`,
 * `day.chanceOfRain`, `day.chanceOfSnow`, `hour.isDay`, `hour.chanceOfRain` —
 * the provider did not say, and the server relays that rather than guessing
 * « night » or « 0 % ».
 *
 * Bodies are READ, never rebuilt: an unknown property a newer server adds
 * travels through untouched.
 */

/** 0..100, whole — a probability the provider states as a percentage. */
const isPercent: Check<number> = (value): value is number =>
  isWholeNumber(value) && value <= 100;

/** `fresh` | `stale` | `unavailable` — an unknown status is a malformed body. */
const isStatus: Check<WeatherStatus> = (value): value is WeatherStatus =>
  isString(value) && isWeatherStatus(value);

/** `garden` | `profile`. */
const isSource: Check<LocationSource> = (value): value is LocationSource =>
  isString(value) && isLocationSource(value);

const isCurrentRecord = matches<WeatherCurrent>({
  tempC: isFiniteNumber,
  feelsLikeC: nullable(isFiniteNumber),
  conditionCode: isWholeNumber,
  conditionText: isNullableString,
  isDay: nullable(isBoolean),
  windKph: nullable(isFiniteNumber),
  gustKph: nullable(isFiniteNumber),
  humidity: nullable(isWholeNumber),
  precipMm: nullable(isFiniteNumber),
  uv: nullable(isFiniteNumber),
  lastUpdated: isNullableString,
});

const isHourRecord = matches<WeatherHour>({
  time: isString,
  tempC: isFiniteNumber,
  conditionCode: isWholeNumber,
  isDay: nullable(isBoolean),
  chanceOfRain: nullable(isPercent),
  precipMm: nullable(isFiniteNumber),
  windKph: nullable(isFiniteNumber),
});

const isDayRecord = matches<WeatherDay>({
  date: isString,
  minTempC: isFiniteNumber,
  maxTempC: isFiniteNumber,
  avgTempC: nullable(isFiniteNumber),
  conditionCode: isWholeNumber,
  conditionText: isNullableString,
  chanceOfRain: nullable(isPercent),
  chanceOfSnow: nullable(isPercent),
  totalPrecipMm: nullable(isFiniteNumber),
  maxWindKph: nullable(isFiniteNumber),
  sunrise: isNullableString,
  sunset: isNullableString,
  hours: arrayOf(isHourRecord),
});

const isAlertRecord = matches<WeatherAlert>({
  headline: isString,
  event: isNullableString,
  severity: isNullableString,
  urgency: isNullableString,
  effective: isNullableString,
  expires: isNullableString,
  areas: isNullableString,
});

const isLocationRecord = matches<WeatherLocation>({
  key: isString,
  name: isString,
  region: isNullableString,
  country: isNullableString,
  status: isStatus,
  fetchedAt: isNullableString,
  timeZone: isNullableString,
  localTime: isNullableString,
  current: nullable(isCurrentRecord),
  days: arrayOf(isDayRecord),
  alerts: arrayOf(isAlertRecord),
});

const isGardenLink = matches<WeatherGardenLink>({
  gardenId: isString,
  locationKey: isNullableString,
  source: nullable(isSource),
});

/**
 * Is this body the weather aggregate?
 *
 * A 204 or an empty body makes `fetchJson` resolve `undefined` (round 1, E19):
 * `isRecord` inside `matches` refuses it, so the page draws its error state
 * instead of dereferencing `weather.locations` during render. Every level is
 * checked: a malformed hour inside a day inside a place rejects the body.
 */
const isWeatherData = matches<DashboardWeatherData>({
  locations: arrayOf(isLocationRecord),
  gardens: arrayOf(isGardenLink),
  profileLocated: isBoolean,
});

/**
 * Decimal degrees within the globe (round 1, G10 — GitHub 4008082556):
 * `isFiniteNumber` let a latitude of 120 or a longitude of 250 through, and
 * `searchLocations` handed back a pick the location endpoints would refuse
 * (`SaveLocationRequest` holds ±90 / ±180). Rejected HERE, as a malformed
 * answer, the way every other out-of-domain value of the aggregate is.
 */
const isLatitude: Check<number> = (value): value is number =>
  isFiniteNumber(value) && value >= -90 && value <= 90;

const isLongitude: Check<number> = (value): value is number =>
  isFiniteNumber(value) && value >= -180 && value <= 180;

/** One geocoder match — exactly what the location endpoints accept back. */
const isLocationPick = matches<LocationPick>({
  name: isString,
  region: isNullableString,
  country: isNullableString,
  latitude: isLatitude,
  longitude: isLongitude,
});

const isLocationPickList = arrayOf(isLocationPick);

/**
 * `GET /api/dashboard/weather?lang=` — the weather of every place the caller's
 * gardens sit in, in ONE call, so the weather widget, the MÉTÉO column of the
 * Gardens table and the To-do block read the same response.
 *
 * Always 200 for an authenticated caller: a place whose refresh failed carries
 * `status: 'stale'` with its last known data, or `'unavailable'` with none.
 * Rejects a body that is not the aggregate rather than returning it — throwing
 * puts the failure on the path the page already handles: `useDashboardWeather`
 * catches it, keeps `EMPTY_WEATHER_DATA` and raises `loadError`.
 */
export async function fetchDashboardWeather(
  language: string,
  signal?: AbortSignal
): Promise<DashboardWeatherData> {
  const body = await fetchJson<unknown>(
    `${API_BASE}/dashboard/weather?lang=${encodeURIComponent(language)}`,
    { credentials: 'include', signal }
  );

  if (!isWeatherData(body)) {
    throw new Error(
      'Malformed weather aggregate: locations, gardens or profileLocated is ' +
        'missing, or a place, a day, an hour, an alert or a garden link does ' +
        'not match the expected shape.'
    );
  }

  return body;
}

/**
 * `GET /api/geocode/search?q=` — the places matching a typed query, for the
 * « Ville » field.
 *
 * The server answers `200 []` when nothing matches and `503` when the
 * geocoder is unavailable; the 503 reaches the caller as an `HttpStatusError`
 * (fetchJson contract) and is drawn as « Recherche momentanément
 * indisponible ». The caller — `LocationField` — never sends a query under
 * three characters, debounces at 400 ms and aborts the request in flight
 * through `signal` when the next one starts.
 */
export async function searchLocations(
  query: string,
  signal?: AbortSignal
): Promise<LocationPick[]> {
  const body = await fetchJson<unknown>(
    `${API_BASE}/geocode/search?q=${encodeURIComponent(query)}`,
    { credentials: 'include', signal }
  );

  if (!isLocationPickList(body)) {
    throw new Error(
      'Malformed geocode response: a list of places was expected, each with a ' +
        'name, a region, a country and finite coordinates.'
    );
  }

  return body;
}

/** `PUT /api/gardens/{id}/location` — a garden's own override; 204 on success. */
export async function saveGardenLocation(
  gardenId: string,
  pick: LocationPick
): Promise<void> {
  return fetchJson<void>(
    `${API_BASE}/gardens/${encodeURIComponent(gardenId)}/location`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(pick),
    }
  );
}

/** `DELETE /api/gardens/{id}/location` — back to the profile's default; 204. */
export async function clearGardenLocation(gardenId: string): Promise<void> {
  return fetchJson<void>(
    `${API_BASE}/gardens/${encodeURIComponent(gardenId)}/location`,
    { method: 'DELETE', credentials: 'include' }
  );
}

/**
 * `PUT /api/auth/profile/location` — the account's default, inherited by every
 * garden without an override (ADR-0006); 204. Zero coupling with the profile's
 * free-text `City` (Q2): the « Utiliser la ville de mon profil » link only
 * PRE-FILLS the field with it.
 */
export async function saveProfileLocation(pick: LocationPick): Promise<void> {
  return fetchJson<void>(`${API_BASE}/auth/profile/location`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(pick),
  });
}

/** `DELETE /api/auth/profile/location`; 204. */
export async function clearProfileLocation(): Promise<void> {
  return fetchJson<void>(`${API_BASE}/auth/profile/location`, {
    method: 'DELETE',
    credentials: 'include',
  });
}
