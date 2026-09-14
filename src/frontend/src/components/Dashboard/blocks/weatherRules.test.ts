import { describe, expect, it } from 'vitest';
import {
  WEATHER_RULES,
  alertTheme,
  derivedChips,
  eveningAhead,
  gardenerSentence,
  officialAlerts,
  weatherChips,
} from './weatherRules';
import {
  alertFixture,
  at,
  dayFixture,
  hourFixture,
  locationFixture,
  weekFixture,
} from '../../../test/fixtures/weather';

// SMA-336 PR 3b/5 — the gardening rules (§ E.2 / § E.3). Every threshold is
// read from WEATHER_RULES rather than retyped, so a product change of a
// threshold moves the tests with it; the boundary cases pin the comparison
// operators (≤ vs <), which is where a rule silently drifts.

describe('the thresholds are named, and consigned as arbitrary except the freezing point', () => {
  it('carries the values the pre-flight proposes', () => {
    expect(WEATHER_RULES.frostMaxC).toBe(0);
    expect(WEATHER_RULES.frostRiskMaxC).toBe(2);
    expect(WEATHER_RULES.heatMinC).toBe(30);
    expect(WEATHER_RULES.strongWindMinKph).toBe(50);
    expect(WEATHER_RULES.heavyRainMinMm).toBe(20);
    expect(WEATHER_RULES.sentence).toMatchObject({
      frostNightMaxC: 2,
      rainChanceMin: 60,
      rainMinMm: 2,
      warmMinC: 28,
    });
    expect(WEATHER_RULES.maxChips).toBe(3);
    expect(WEATHER_RULES.maxDerivedChips).toBe(2);
  });
});

describe('derivedChips', () => {
  it('finds the artboard’s strong wind on Thursday, and nothing else on that week', () => {
    const chips = derivedChips(weekFixture());

    expect(chips).toEqual([{ kind: 'wind', date: '2026-09-15', dayIndex: 3, value: 55 }]);
  });

  it('frost at 0 and below, frost risk from 0 exclusive to 2 inclusive', () => {
    expect(derivedChips([dayFixture({ minTempC: 0 })]).map((c) => c.kind)).toEqual(['frost']);
    expect(derivedChips([dayFixture({ minTempC: -2 })]).map((c) => c.kind)).toEqual(['frost']);
    expect(derivedChips([dayFixture({ minTempC: 0.5 })]).map((c) => c.kind)).toEqual(['frostRisk']);
    expect(derivedChips([dayFixture({ minTempC: 2 })]).map((c) => c.kind)).toEqual(['frostRisk']);
    expect(derivedChips([dayFixture({ minTempC: 2.1 })])).toEqual([]);
  });

  it('heat at 30 inclusive, wind at 50 inclusive, rain at 20 inclusive', () => {
    expect(derivedChips([dayFixture({ maxTempC: 30 })]).map((c) => c.kind)).toEqual(['heat']);
    expect(derivedChips([dayFixture({ maxTempC: 29.9 })])).toEqual([]);
    expect(derivedChips([dayFixture({ maxWindKph: 50 })]).map((c) => c.kind)).toEqual(['wind']);
    expect(derivedChips([dayFixture({ maxWindKph: 49 })])).toEqual([]);
    expect(derivedChips([dayFixture({ totalPrecipMm: 20 })]).map((c) => c.kind)).toEqual(['rain']);
    expect(derivedChips([dayFixture({ totalPrecipMm: 19.9 })])).toEqual([]);
  });

  it('a null wind or rainfall is UNKNOWN and earns no chip', () => {
    expect(derivedChips([dayFixture({ maxWindKph: null, totalPrecipMm: null })])).toEqual([]);
  });

  it('keeps ONE chip per kind, on the earliest day, and orders closest day first then by severity', () => {
    const chips = derivedChips([
      dayFixture({ date: '2026-09-12', maxWindKph: 60, totalPrecipMm: 25 }),
      dayFixture({ date: '2026-09-13', minTempC: -1, maxWindKph: 70 }),
      dayFixture({ date: '2026-09-14', minTempC: -3 }),
    ]);

    expect(chips).toEqual([
      { kind: 'wind', date: '2026-09-12', dayIndex: 0, value: 60 },
      { kind: 'rain', date: '2026-09-12', dayIndex: 0, value: 25 },
      { kind: 'frost', date: '2026-09-13', dayIndex: 1, value: -1 },
    ]);
  });

  it('on one day, frost outranks heat outranks wind outranks rain', () => {
    const chips = derivedChips([
      dayFixture({ minTempC: -1, maxTempC: 31, maxWindKph: 55, totalPrecipMm: 22 }),
    ]);

    expect(chips.map((c) => c.kind)).toEqual(['frost', 'heat', 'wind', 'rain']);
  });
});

describe('officialAlerts — severity floor and the two-language dedup (Q7)', () => {
  it('keeps Moderate and above, drops Minor, Unknown and null', () => {
    const kept = officialAlerts([
      alertFixture({ severity: 'Minor', event: 'a' }),
      alertFixture({ severity: 'moderate', event: 'b' }),
      alertFixture({ severity: 'Severe', event: 'c' }),
      alertFixture({ severity: 'EXTREME', event: 'd' }),
      alertFixture({ severity: 'Unknown', event: 'e' }),
      alertFixture({ severity: null, event: 'f' }),
    ]);

    expect(kept.map((a) => a.event)).toEqual(['b', 'c', 'd']);
  });

  it('collapses the same alert issued in two languages — same window, same theme', () => {
    const kept = officialAlerts([
      alertFixture({ headline: 'Vigilance orange vent violent', event: 'Vent violent' }),
      alertFixture({ headline: 'Orange warning: strong wind', event: 'vent violent ' }),
    ]);

    expect(kept).toHaveLength(1);
    expect(kept[0]!.headline).toBe('Vigilance orange vent violent');
  });

  it('…even when the two bulletins TRANSLATE the event: « Vent violent » and « Strong wind » are one chip (G7)', () => {
    // GitHub 4008082537: keyed on the localized `event`, the French and the
    // English copy of one vigilance made two keys and two chips.
    const kept = officialAlerts([
      alertFixture({ headline: 'Vigilance orange vent violent', event: 'Vent violent' }),
      alertFixture({ headline: 'Orange warning: strong wind', event: 'Strong wind' }),
    ]);

    expect(kept).toHaveLength(1);
    expect(weatherChips([], kept).official).toHaveLength(1);
  });

  it('never merges two DISTINCT uncategorised alerts over one window: the text stays their identity', () => {
    expect(
      officialAlerts([
        alertFixture({ event: 'Avalanche', severity: 'Severe' }),
        alertFixture({ event: 'Crue', severity: 'Severe' }),
      ])
    ).toHaveLength(2);
  });

  it('reads the severity by rank in the key: « Severe » and « severe » are one', () => {
    expect(
      officialAlerts([
        alertFixture({ event: 'Vent violent', severity: 'Severe' }),
        alertFixture({ event: 'Strong wind', severity: 'severe' }),
      ])
    ).toHaveLength(1);
  });

  it('keeps two alerts of one event over two windows, and two events over one window', () => {
    expect(
      officialAlerts([
        alertFixture({ expires: '2026-09-17T22:00:00+02:00' }),
        alertFixture({ expires: '2026-09-18T22:00:00+02:00' }),
      ])
    ).toHaveLength(2);
    expect(
      officialAlerts([alertFixture({ event: 'Vent violent' }), alertFixture({ event: 'Orages' })])
    ).toHaveLength(2);
  });

  it('falls back to the headline as the identity when the event is null and no theme is recognised', () => {
    expect(
      officialAlerts([
        alertFixture({ event: null, headline: 'Same' }),
        alertFixture({ event: null, headline: 'same' }),
      ])
    ).toHaveLength(1);
  });
});

describe('alertTheme — keyword detection, FR and EN, wind first', () => {
  it.each([
    ['Vent violent', 'wind'],
    ['Strong wind warning', 'wind'],
    ['Tempête', 'wind'],
    ['Thunderstorm', 'wind'],
    ['Gel', 'frost'],
    ['Frost advisory', 'frost'],
    ['Neige-verglas', 'frost'],
    ['Canicule', 'heat'],
    ['Excessive heat', 'heat'],
    ['Pluie-inondation', 'rain'],
    ['Flood warning', 'rain'],
    ['Orages', 'rain'],
  ])('%s → %s', (event, theme) => {
    expect(alertTheme(alertFixture({ event, headline: 'x' }))).toBe(theme);
  });

  it('reads the headline when the event says nothing, and answers null when no keyword matches', () => {
    expect(alertTheme(alertFixture({ event: null, headline: 'Avalanche danger' }))).toBeNull();
    expect(alertTheme(alertFixture({ event: 'Alerte', headline: 'Vigilance vent' }))).toBe('wind');
  });
});

describe('weatherChips — the line of the Large card', () => {
  it('shows the derived chips alone when there is no official alert', () => {
    const line = weatherChips(weekFixture(), []);

    expect(line.official).toEqual([]);
    expect(line.derived.map((c) => c.kind)).toEqual(['wind']);
  });

  it('drops a derived chip whose theme an official alert already states', () => {
    const line = weatherChips(weekFixture(), [alertFixture({ event: 'Vent violent' })]);

    expect(line.official).toHaveLength(1);
    expect(line.derived).toEqual([]);
  });

  it('keeps a derived chip of another theme beside the official', () => {
    const days = [dayFixture({ minTempC: -2, maxWindKph: 60 })];
    const line = weatherChips(days, [alertFixture({ event: 'Vent violent' })]);

    expect(line.official).toHaveLength(1);
    expect(line.derived.map((c) => c.kind)).toEqual(['frost']);
  });

  it('caps the derived chips at two, and the whole line at three', () => {
    const days = [dayFixture({ minTempC: -1, maxTempC: 31, maxWindKph: 55, totalPrecipMm: 22 })];

    const alone = weatherChips(days, []);
    expect(alone.derived.map((c) => c.kind)).toEqual(['frost', 'heat']);

    const withTwoOfficials = weatherChips(days, [
      alertFixture({ event: 'Avalanche', severity: 'Severe' }),
      alertFixture({ event: 'Crue', severity: 'Severe', effective: 'other' }),
    ]);
    expect(withTwoOfficials.official).toHaveLength(2);
    expect(withTwoOfficials.derived.map((c) => c.kind)).toEqual(['frost']);

    const withThreeOfficials = weatherChips(days, [
      alertFixture({ event: 'A', severity: 'Severe' }),
      alertFixture({ event: 'B', severity: 'Severe' }),
      alertFixture({ event: 'C', severity: 'Severe' }),
      alertFixture({ event: 'D', severity: 'Severe' }),
    ]);
    expect(withThreeOfficials.official.map((a) => a.event)).toEqual(['A', 'B', 'C']);
    expect(withThreeOfficials.derived).toEqual([]);
  });

  it('ignores a Minor official — it neither shows nor deduplicates', () => {
    const line = weatherChips(weekFixture(), [
      alertFixture({ event: 'Vent violent', severity: 'Minor' }),
    ]);

    expect(line.official).toEqual([]);
    expect(line.derived.map((c) => c.kind)).toEqual(['wind']);
  });
});

describe('gardenerSentence — by priority', () => {
  it('reads the artboard’s week as « arrosez en soirée » (29° today, no rain)', () => {
    expect(gardenerSentence(locationFixture())).toBe('waterEvening');
  });

  it('frost tonight from the day’s minimum, at 2° inclusive — the FALLBACK, when no hour travelled', () => {
    expect(gardenerSentence(locationFixture({ days: [dayFixture({ minTempC: 2 })] }))).toBe(
      'frostTonight'
    );
    expect(gardenerSentence(locationFixture({ days: [dayFixture({ minTempC: 2.5 })] }))).not.toBe(
      'frostTonight'
    );
  });

  it('reads TONIGHT from the night slots when they exist: 1° at dawn and a 12° night is no frost tonight (G8)', () => {
    // GitHub 4008082543 / Extension 9ddae1b5, 1058691c: the day's minimum is
    // the whole day's — a cold dawn said « Gel possible cette nuit » over a
    // mild evening. With hours on both days, the night window alone decides.
    const dawn = hourFixture({ time: at('2026-09-12', 6), tempC: 1 });
    const mild = (date: string, hour: number) => hourFixture({ time: at(date, hour), tempC: 12 });
    const location = locationFixture({
      localTime: '2026-09-12 19:00',
      days: [
        dayFixture({
          date: '2026-09-12',
          minTempC: 1,
          hours: [dawn, ...[18, 19, 20, 21, 22, 23].map((h) => mild('2026-09-12', h))],
        }),
        dayFixture({ date: '2026-09-13', hours: [0, 1, 2, 3, 4, 5, 6].map((h) => mild('2026-09-13', h)) }),
      ],
    });

    expect(gardenerSentence(location)).not.toBe('frostTonight');

    // …and a single cold slot in that window still says frost, minimum or not.
    const coldNight = locationFixture({
      days: [dayFixture({ minTempC: 8, hours: [mild('2026-09-12', 18), hourFixture({ time: at('2026-09-12', 23), tempC: 2 })] })],
    });
    expect(gardenerSentence(coldNight)).toBe('frostTonight');
  });

  it('frost tonight from a NIGHT slot — 18 h onwards today, before 7 h tomorrow — and not from a day slot', () => {
    const cold = (time: string) => hourFixture({ time, tempC: 1 });

    expect(
      gardenerSentence(
        locationFixture({
          days: [dayFixture({ minTempC: 5, hours: [cold(at('2026-09-12', 18))] })],
        })
      )
    ).toBe('frostTonight');
    expect(
      gardenerSentence(
        locationFixture({
          days: [dayFixture({ minTempC: 5 }), dayFixture({ hours: [cold(at('2026-09-13', 6))] })],
        })
      )
    ).toBe('frostTonight');
    expect(
      gardenerSentence(
        locationFixture({
          days: [
            dayFixture({ minTempC: 5, hours: [cold(at('2026-09-12', 12))] }),
            dayFixture({ hours: [cold(at('2026-09-13', 7))] }),
          ],
        })
      )
    ).not.toBe('frostTonight');
  });

  it('rain today from the chance at 60 or from 2 mm, and frost outranks rain', () => {
    expect(
      gardenerSentence(locationFixture({ days: [dayFixture({ chanceOfRain: 60 })] }))
    ).toBe('rainToday');
    expect(
      gardenerSentence(locationFixture({ days: [dayFixture({ chanceOfRain: 10, totalPrecipMm: 2 })] }))
    ).toBe('rainToday');
    expect(
      gardenerSentence(locationFixture({ days: [dayFixture({ chanceOfRain: 59, totalPrecipMm: 1.9 })] }))
    ).not.toBe('rainToday');
    expect(
      gardenerSentence(locationFixture({ days: [dayFixture({ minTempC: 0, chanceOfRain: 90 })] }))
    ).toBe('frostTonight');
  });

  it('a null chance of rain asserts no rain (K3): the rainfall alone decides', () => {
    expect(
      gardenerSentence(locationFixture({ days: [dayFixture({ chanceOfRain: null, totalPrecipMm: 0 })] }))
    ).toBe('waterEvening');
    expect(
      gardenerSentence(locationFixture({ days: [dayFixture({ chanceOfRain: null, totalPrecipMm: 3 })] }))
    ).toBe('rainToday');
  });

  it('water in the evening from 28° inclusive, as needed below', () => {
    expect(gardenerSentence(locationFixture({ days: [dayFixture({ maxTempC: 28 })] }))).toBe(
      'waterEvening'
    );
    expect(gardenerSentence(locationFixture({ days: [dayFixture({ maxTempC: 27 })] }))).toBe(
      'waterAsNeeded'
    );
  });

  it('has nothing to say without a day', () => {
    expect(gardenerSentence(locationFixture({ days: [] }))).toBeNull();
  });
});

describe('eveningAhead', () => {
  it('is true before 23 h at the place, false from 23 h, true when the hour is unknown', () => {
    expect(eveningAhead(locationFixture({ localTime: '2026-09-12 22:59' }))).toBe(true);
    expect(eveningAhead(locationFixture({ localTime: '2026-09-12 23:00' }))).toBe(false);
    expect(eveningAhead(locationFixture({ localTime: null }))).toBe(true);
  });
});
