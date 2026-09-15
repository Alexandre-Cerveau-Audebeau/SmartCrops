import { describe, expect, it } from 'vitest';
import {
  EMPTY_WEATHER_DATA,
  isLocationSource,
  isWeatherStatus,
} from './DashboardWeather';

describe('EMPTY_WEATHER_DATA (the E20 rule, applied to the weather aggregate)', () => {
  it('is frozen, and so are the two containers a widget could write into', () => {
    expect(Object.isFrozen(EMPTY_WEATHER_DATA)).toBe(true);
    expect(Object.isFrozen(EMPTY_WEATHER_DATA.locations)).toBe(true);
    expect(Object.isFrozen(EMPTY_WEATHER_DATA.gardens)).toBe(true);
  });

  it('freezes every top-level container, whatever the shape holds', () => {
    for (const [key, value] of Object.entries(EMPTY_WEATHER_DATA)) {
      if (typeof value === 'object' && value !== null) {
        expect(Object.isFrozen(value), `${key} is frozen`).toBe(true);
      }
    }
  });

  it('refuses the writes that would poison the empty state for every reader', () => {
    expect(() => EMPTY_WEATHER_DATA.locations.push({} as never)).toThrow();
    expect(() => EMPTY_WEATHER_DATA.gardens.push({} as never)).toThrow();
    expect(() => {
      (EMPTY_WEATHER_DATA as { profileLocated: boolean }).profileLocated = true;
    }).toThrow();
  });

  it('still reads as an empty aggregate', () => {
    expect(EMPTY_WEATHER_DATA).toEqual({
      locations: [],
      gardens: [],
      profileLocated: false,
    });
  });
});

describe('the two wire vocabularies', () => {
  it('knows the three statuses and nothing else', () => {
    expect(isWeatherStatus('fresh')).toBe(true);
    expect(isWeatherStatus('stale')).toBe(true);
    expect(isWeatherStatus('unavailable')).toBe(true);
    expect(isWeatherStatus('Fresh')).toBe(false);
    expect(isWeatherStatus('')).toBe(false);
  });

  it('knows the two location sources and nothing else', () => {
    expect(isLocationSource('garden')).toBe(true);
    expect(isLocationSource('profile')).toBe(true);
    expect(isLocationSource('user')).toBe(false);
  });
});
