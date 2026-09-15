import type { SvgIconComponent } from '@mui/icons-material';
import AcUnitOutlinedIcon from '@mui/icons-material/AcUnitOutlined';
import BlurOnOutlinedIcon from '@mui/icons-material/BlurOnOutlined';
import CloudQueueIcon from '@mui/icons-material/CloudQueue';
import FoggyIcon from '@mui/icons-material/Foggy';
import GrainOutlinedIcon from '@mui/icons-material/GrainOutlined';
import NightsStayOutlinedIcon from '@mui/icons-material/NightsStayOutlined';
import ThunderstormOutlinedIcon from '@mui/icons-material/ThunderstormOutlined';
import UmbrellaOutlinedIcon from '@mui/icons-material/UmbrellaOutlined';
import WbCloudyOutlinedIcon from '@mui/icons-material/WbCloudyOutlined';
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined';

/**
 * SMA-336 PR 3b/5 — the provider's `condition:code` mapped to OUR icons
 * (pre-flight § F.2). The provider's icon URL is never displayed; the text
 * beside the icon stays the provider's `conditionText`, translated by `lang`,
 * never a translation of ours.
 *
 * Eleven groups for the SIXTY codes of `conditions.json` (read 2026-09-12 —
 * the twelve « mist / dust / smoke » codes 1012–1048 are a recent extension of
 * the historical 48). Every group has a day icon and, for the two sky states
 * that have one, a night icon; the others draw the same glyph by night.
 *
 * An UNKNOWN code — one the provider adds after this table was written —
 * degrades to `cloudy` and never throws: the icon is a rendering concern, and a
 * widget must not fall over a code it has not met. `weatherIcons.test.ts` pins
 * the sixty against the archived list.
 */
export const WEATHER_ICON_KINDS = [
  'clear',
  'partlyCloudy',
  'cloudy',
  'fog',
  'dust',
  'drizzle',
  'rain',
  'heavyRain',
  'sleet',
  'snow',
  'thunder',
] as const;

export type WeatherIconKind = (typeof WEATHER_ICON_KINDS)[number];

/** The group an unknown code falls into. */
export const UNKNOWN_CONDITION_KIND: WeatherIconKind = 'cloudy';

/** `condition:code` → group, for the sixty codes of `conditions.json` (2026-09-12). */
export const WEATHER_CONDITION_GROUPS: Readonly<Record<number, WeatherIconKind>> = {
  // clear
  1000: 'clear',
  // partly cloudy
  1003: 'partlyCloudy',
  // cloudy, overcast
  1006: 'cloudy',
  1009: 'cloudy',
  // mist, fog, freezing fog, and the low-visibility extension codes
  1030: 'fog',
  1135: 'fog',
  1147: 'fog',
  1012: 'fog',
  1033: 'fog',
  1036: 'fog',
  1039: 'fog',
  1042: 'fog',
  // dust, sand, smoke, haze
  1015: 'dust',
  1018: 'dust',
  1021: 'dust',
  1024: 'dust',
  1027: 'dust',
  1045: 'dust',
  1048: 'dust',
  // patchy rain possible, drizzle, freezing drizzle, light rain showers nearby
  1063: 'drizzle',
  1150: 'drizzle',
  1153: 'drizzle',
  1168: 'drizzle',
  1171: 'drizzle',
  1180: 'drizzle',
  1072: 'drizzle',
  // light and moderate rain, light and moderate showers, light freezing rain
  1183: 'rain',
  1186: 'rain',
  1189: 'rain',
  1240: 'rain',
  1243: 'rain',
  1198: 'rain',
  // heavy rain, torrential showers, heavy freezing rain
  1192: 'heavyRain',
  1195: 'heavyRain',
  1246: 'heavyRain',
  1201: 'heavyRain',
  // sleet, ice pellets, and their showers
  1069: 'sleet',
  1204: 'sleet',
  1207: 'sleet',
  1237: 'sleet',
  1249: 'sleet',
  1252: 'sleet',
  1261: 'sleet',
  1264: 'sleet',
  // snow, blizzard, blowing snow, snow showers
  1066: 'snow',
  1114: 'snow',
  1117: 'snow',
  1210: 'snow',
  1213: 'snow',
  1216: 'snow',
  1219: 'snow',
  1222: 'snow',
  1225: 'snow',
  1255: 'snow',
  1258: 'snow',
  // thundery outbreaks, rain and snow with thunder
  1087: 'thunder',
  1273: 'thunder',
  1276: 'thunder',
  1279: 'thunder',
  1282: 'thunder',
};

/** The group of a code — `cloudy` for a code the table has never met. */
export function weatherIconKind(code: number): WeatherIconKind {
  return WEATHER_CONDITION_GROUPS[code] ?? UNKNOWN_CONDITION_KIND;
}

/**
 * Day and night glyphs per group — every one present in `@mui/icons-material`
 * 7.3.11. MUI has no cloud-and-moon, so a partly cloudy night draws the moon.
 */
export const WEATHER_DAY_ICONS: Readonly<Record<WeatherIconKind, SvgIconComponent>> = {
  clear: WbSunnyOutlinedIcon,
  partlyCloudy: WbCloudyOutlinedIcon,
  cloudy: CloudQueueIcon,
  fog: FoggyIcon,
  dust: BlurOnOutlinedIcon,
  drizzle: GrainOutlinedIcon,
  rain: UmbrellaOutlinedIcon,
  heavyRain: UmbrellaOutlinedIcon,
  sleet: GrainOutlinedIcon,
  snow: AcUnitOutlinedIcon,
  thunder: ThunderstormOutlinedIcon,
};

export const WEATHER_NIGHT_ICONS: Readonly<Partial<Record<WeatherIconKind, SvgIconComponent>>> = {
  clear: NightsStayOutlinedIcon,
  partlyCloudy: NightsStayOutlinedIcon,
};

/**
 * The glyph for a code. `isDay` is `false` for the night variant; `true` OR
 * `null` draw the day one — a `null` means the provider did not say (K3), and
 * « unknown » is not « night ».
 *
 * Components render through `WeatherGlyph`, which reads the two tables by key
 * (a component picked from a static table is static; one returned by a call
 * during render is not — `react-hooks/static-components`). This function is
 * the same rule as a value, for the tests and for whoever needs the type.
 */
export function weatherIcon(code: number, isDay: boolean | null): SvgIconComponent {
  const kind = weatherIconKind(code);
  return (isDay === false ? WEATHER_NIGHT_ICONS[kind] : undefined) ?? WEATHER_DAY_ICONS[kind];
}

/**
 * Which design token colours the glyph (`A5MeteoTailles.dc.html`: `--sun` on
 * the sunny icons, `--cloud` on the cloudy one, `--rain` on the rainy one).
 * `text` is the page's primary text colour — what a snowflake reads best in.
 */
export type WeatherTone = 'sun' | 'cloud' | 'rain' | 'text';

export function weatherTone(code: number, isDay: boolean | null): WeatherTone {
  const kind = weatherIconKind(code);
  switch (kind) {
    case 'clear':
      // A clear NIGHT is a moon, and the moon is not the sun's orange.
      return isDay === false ? 'cloud' : 'sun';
    case 'partlyCloudy':
    case 'cloudy':
    case 'fog':
    case 'dust':
      return 'cloud';
    case 'drizzle':
    case 'rain':
    case 'heavyRain':
    case 'sleet':
    case 'thunder':
      return 'rain';
    case 'snow':
      return 'text';
  }
}
