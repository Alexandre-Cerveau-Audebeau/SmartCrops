import { describe, expect, it } from 'vitest';
import AcUnitOutlinedIcon from '@mui/icons-material/AcUnitOutlined';
import CloudQueueIcon from '@mui/icons-material/CloudQueue';
import NightsStayOutlinedIcon from '@mui/icons-material/NightsStayOutlined';
import UmbrellaOutlinedIcon from '@mui/icons-material/UmbrellaOutlined';
import WbCloudyOutlinedIcon from '@mui/icons-material/WbCloudyOutlined';
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined';
import {
  UNKNOWN_CONDITION_KIND,
  WEATHER_CONDITION_GROUPS,
  WEATHER_ICON_KINDS,
  weatherIcon,
  weatherIconKind,
  weatherTone,
} from './weatherIcons';

/**
 * The SIXTY codes of `https://www.weatherapi.com/docs/conditions.json`, as
 * read on 2026-09-12 (pre-flight § F.2) — archived HERE so the table is pinned
 * against a list the provider cannot move under it. A code the provider adds
 * later falls back to `cloudy` without breaking this test; a code REMOVED from
 * the table below does break it.
 */
const CONDITIONS_JSON_2026_09_12 = [
  1000, 1003, 1006, 1009, 1012, 1015, 1018, 1021, 1024, 1027, 1030, 1033, 1036,
  1039, 1042, 1045, 1048, 1063, 1066, 1069, 1072, 1087, 1114, 1117, 1135, 1147,
  1150, 1153, 1168, 1171, 1180, 1183, 1186, 1189, 1192, 1195, 1198, 1201, 1204,
  1207, 1210, 1213, 1216, 1219, 1222, 1225, 1237, 1240, 1243, 1246, 1249, 1252,
  1255, 1258, 1261, 1264, 1273, 1276, 1279, 1282,
];

describe('the condition table (SMA-336 PR 3b/5, § F.2)', () => {
  it('archives exactly sixty codes', () => {
    expect(CONDITIONS_JSON_2026_09_12).toHaveLength(60);
    expect(new Set(CONDITIONS_JSON_2026_09_12).size).toBe(60);
  });

  it('has an entry for every one of the sixty codes, and for nothing else', () => {
    const tableCodes = Object.keys(WEATHER_CONDITION_GROUPS).map(Number).sort((a, b) => a - b);

    expect(tableCodes).toEqual([...CONDITIONS_JSON_2026_09_12].sort((a, b) => a - b));
  });

  it('only uses the eleven declared groups', () => {
    for (const kind of Object.values(WEATHER_CONDITION_GROUPS)) {
      expect(WEATHER_ICON_KINDS).toContain(kind);
    }
    // And every group is used at least once — a group nobody maps to is dead.
    const used = new Set(Object.values(WEATHER_CONDITION_GROUPS));
    for (const kind of WEATHER_ICON_KINDS) expect(used.has(kind), kind).toBe(true);
  });

  it('groups the codes the pre-flight names', () => {
    expect(weatherIconKind(1000)).toBe('clear');
    expect(weatherIconKind(1003)).toBe('partlyCloudy');
    expect(weatherIconKind(1006)).toBe('cloudy');
    expect(weatherIconKind(1009)).toBe('cloudy');
    expect(weatherIconKind(1030)).toBe('fog');
    expect(weatherIconKind(1048)).toBe('dust');
    expect(weatherIconKind(1063)).toBe('drizzle');
    expect(weatherIconKind(1189)).toBe('rain');
    expect(weatherIconKind(1195)).toBe('heavyRain');
    expect(weatherIconKind(1237)).toBe('sleet');
    expect(weatherIconKind(1225)).toBe('snow');
    expect(weatherIconKind(1087)).toBe('thunder');
  });

  it('degrades an unknown code to cloudy and never throws', () => {
    expect(UNKNOWN_CONDITION_KIND).toBe('cloudy');
    expect(weatherIconKind(9999)).toBe('cloudy');
    expect(weatherIconKind(-1)).toBe('cloudy');
    expect(weatherIconKind(0)).toBe('cloudy');
    expect(weatherIconKind(Number.NaN)).toBe('cloudy');
    expect(() => weatherIcon(9999, true)).not.toThrow();
    expect(weatherIcon(9999, false)).toBe(CloudQueueIcon);
  });
});

describe('weatherIcon — day and night', () => {
  it('draws the sun by day and the moon by night on a clear sky', () => {
    expect(weatherIcon(1000, true)).toBe(WbSunnyOutlinedIcon);
    expect(weatherIcon(1000, false)).toBe(NightsStayOutlinedIcon);
  });

  it('draws a cloud by day and the moon by night when partly cloudy — MUI has no cloud-and-moon', () => {
    expect(weatherIcon(1003, true)).toBe(WbCloudyOutlinedIcon);
    expect(weatherIcon(1003, false)).toBe(NightsStayOutlinedIcon);
  });

  it('draws the same glyph by night for the groups that have no night variant', () => {
    expect(weatherIcon(1189, false)).toBe(UmbrellaOutlinedIcon);
    expect(weatherIcon(1225, false)).toBe(AcUnitOutlinedIcon);
    expect(weatherIcon(1006, false)).toBe(CloudQueueIcon);
  });

  it('a null isDay is « unknown », drawn as day — never as night (K3)', () => {
    expect(weatherIcon(1000, null)).toBe(WbSunnyOutlinedIcon);
    expect(weatherIcon(1003, null)).toBe(WbCloudyOutlinedIcon);
  });
});

describe('weatherTone — which token colours the glyph', () => {
  it('sun on a clear day, cloud on a clear night', () => {
    expect(weatherTone(1000, true)).toBe('sun');
    expect(weatherTone(1000, null)).toBe('sun');
    expect(weatherTone(1000, false)).toBe('cloud');
  });

  it('cloud for the cloudy, misty and dusty groups', () => {
    expect(weatherTone(1003, true)).toBe('cloud');
    expect(weatherTone(1009, true)).toBe('cloud');
    expect(weatherTone(1135, true)).toBe('cloud');
    expect(weatherTone(1027, true)).toBe('cloud');
  });

  it('rain for every wet group, text for snow', () => {
    expect(weatherTone(1063, true)).toBe('rain');
    expect(weatherTone(1183, true)).toBe('rain');
    expect(weatherTone(1195, true)).toBe('rain');
    expect(weatherTone(1204, true)).toBe('rain');
    expect(weatherTone(1087, true)).toBe('rain');
    expect(weatherTone(1225, true)).toBe('text');
  });

  it('answers for an unknown code too', () => {
    expect(weatherTone(9999, true)).toBe('cloud');
  });
});
