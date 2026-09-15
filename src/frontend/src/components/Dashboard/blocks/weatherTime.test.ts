import { afterEach, describe, expect, it } from 'vitest';
import {
  barMasks,
  hourLabel,
  hourOf,
  localDateOf,
  localHourOf,
  parseLocalDate,
  parseLocalDateTime,
  upcomingHours,
  weekScale,
  weekdayLong,
  weekdayShort,
} from './weatherTime';
import {
  at,
  dayFixture,
  hourFixture,
  hoursOf,
  locationFixture,
  weekFixture,
} from '../../../test/fixtures/weather';

// SMA-336 PR 3b/5 — dates and hours of the PLACE. The one rule with teeth is
// pinned with the process clock moved west of Greenwich: Node honours a change
// of `process.env.TZ` at runtime, so the test below runs the exact hazard the
// pre-flight names rather than describing it.

// The app's tsconfig types the browser only (`types: ["vite/client"]`); the
// test runs under Node, whose `process` is what moves the clock. Declared here,
// minimally, rather than pulling Node's whole ambient types into `src/`.
declare const process: { env: Record<string, string | undefined> };

const originalTz = process.env.TZ;

/**
 * Locale-dependent whitespace, normalised (round 1, E14 / E15): ICU 72 put a
 * NARROW NO-BREAK SPACE (U+202F) before « AM » / « PM » and « h », later
 * engines added compatibility fixes, and the CI's Node 20 may answer either.
 * `hourLabel` returns `Intl`'s string as is — the DISPLAY is right in both —
 * so the assertions compare on ordinary spaces and pin the digits and the
 * words, not the runtime's choice of space.
 */
const spaces = (value: string | null): string | null =>
  value?.replace(/[\u202F\u00A0\u2009]/g, ' ') ?? null;

afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

describe('parseLocalDate — a local midnight from the components', () => {
  it('reads « yyyy-MM-dd » into the date’s own day', () => {
    const built = parseLocalDate('2026-09-12')!;

    expect(built.getFullYear()).toBe(2026);
    expect(built.getMonth()).toBe(8);
    expect(built.getDate()).toBe(12);
    expect(built.getHours()).toBe(0);
  });

  it('refuses what is not a date', () => {
    expect(parseLocalDate('2026-09-12 13:00')).toBeNull();
    expect(parseLocalDate('12/09/2026')).toBeNull();
    expect(parseLocalDate('')).toBeNull();
    expect(parseLocalDate('2026-13-01')).toBeNull();
    expect(parseLocalDate('2026-02-30')).toBeNull();
  });

  it('WEST of Greenwich, keeps the date the provider wrote — where a UTC parse would recede a day', () => {
    process.env.TZ = 'America/Los_Angeles';

    // Los Angeles is UTC−7 in September: a UTC midnight is 17:00 the evening
    // BEFORE there, which is what the banned string form would have read. The
    // components form is a local midnight wherever the browser is. The offset
    // asserted is the DATE UNDER TEST's, not the day the suite runs (round 1,
    // E13): Los Angeles is UTC−8 from November to March, and `new Date()` made
    // this line a calendar time bomb.
    expect(new Date(2026, 8, 12).getTimezoneOffset()).toBe(420);
    expect(parseLocalDate('2026-09-12')!.getDate()).toBe(12);
    expect(parseLocalDate('2026-09-12')!.getHours()).toBe(0);
    expect(weekdayShort('2026-09-12', 'en')).toBe('Sat');
    expect(weekdayShort('2026-09-17', 'en')).toBe('Thu');
    expect(weekdayLong('2026-09-17', 'fr')).toBe('jeudi');
    expect(spaces(hourLabel('2026-09-12 13:00', 'fr'))).toBe('13 h');
  });

  it('EAST of Greenwich too, of course', () => {
    process.env.TZ = 'Asia/Tokyo';

    expect(parseLocalDate('2026-09-12')!.getDate()).toBe(12);
    expect(weekdayShort('2026-09-12', 'en')).toBe('Sat');
  });

  it('labels a slot through the browser zone’s DST gap: « 02:00 » stays 2 AM where 2 AM does not exist (G9)', () => {
    // New York springs forward on 8 March 2026 at 02:00 → 03:00. A slot the
    // PLACE wrote as « 02:00 » is a real hour there; built as a browser-local
    // date, `setHours(2)` landed in the gap and read back as 3 AM.
    process.env.TZ = 'America/New_York';

    expect(spaces(hourLabel('2026-03-08 02:00', 'en'))).toBe('2 AM');
    expect(spaces(hourLabel('2026-03-08 02:00', 'fr'))).toBe('02 h');
    expect(spaces(hourLabel('2026-03-08 03:00', 'en'))).toBe('3 AM');
  });
});

describe('parseLocalDateTime', () => {
  it('reads « yyyy-MM-dd HH:mm »', () => {
    expect(parseLocalDateTime('2026-09-12 14:30')).toEqual({
      date: '2026-09-12',
      hour: 14,
      minute: 30,
    });
    expect(parseLocalDateTime('2026-09-12 00:00')).toEqual({
      date: '2026-09-12',
      hour: 0,
      minute: 0,
    });
  });

  it('refuses a bare date, a bad hour, an ISO instant', () => {
    expect(parseLocalDateTime('2026-09-12')).toBeNull();
    expect(parseLocalDateTime('2026-09-12 24:00')).toBeNull();
    expect(parseLocalDateTime('2026-09-12T14:30:00Z')).toBeNull();
  });

  it('localDateOf / localHourOf read the place’s localTime, null without one', () => {
    expect(localDateOf(locationFixture())).toBe('2026-09-12');
    expect(localHourOf(locationFixture())).toBe(14);
    expect(localDateOf(locationFixture({ localTime: null }))).toBeNull();
    expect(localHourOf(locationFixture({ localTime: 'garbage' }))).toBeNull();
  });

  it('hourOf reads a slot’s own hour', () => {
    expect(hourOf(hourFixture({ time: '2026-09-12 21:00' }))).toBe(21);
    expect(hourOf(hourFixture({ time: 'x' }))).toBeNull();
  });
});

describe('the labels — Intl on the local components, capitalised like the artboard', () => {
  it('weekdayShort: « Sam. » / « Sat »', () => {
    expect(weekdayShort('2026-09-12', 'fr')).toBe('Sam.');
    expect(weekdayShort('2026-09-15', 'fr')).toBe('Mar.');
    expect(weekdayShort('2026-09-17', 'fr')).toBe('Jeu.');
    expect(weekdayShort('2026-09-12', 'en')).toBe('Sat');
    expect(weekdayShort('nope', 'en')).toBeNull();
  });

  it('weekdayLong: « jeudi » / « Thursday »', () => {
    expect(weekdayLong('2026-09-17', 'fr')).toBe('jeudi');
    expect(weekdayLong('2026-09-17', 'en')).toBe('Thursday');
    expect(weekdayLong('', 'en')).toBeNull();
  });

  it('hourLabel: « 13 h » / « 1 PM », from the slot’s own text', () => {
    expect(spaces(hourLabel('2026-09-12 13:00', 'fr'))).toBe('13 h');
    expect(spaces(hourLabel('2026-09-12 13:00', 'en'))).toBe('1 PM');
    expect(spaces(hourLabel('2026-09-13 00:00', 'en'))).toBe('12 AM');
    expect(hourLabel('2026-09-12', 'en')).toBeNull();
  });
});

describe('upcomingHours — six consecutive slots from the place’s hour', () => {
  it('starts at the current hour of localTime, on the artboard’s own 13 h → 18 h', () => {
    const location = locationFixture({ localTime: '2026-09-12 13:20' });

    const slots = upcomingHours(location);

    expect(slots.map((hour) => hour.time)).toEqual([
      at('2026-09-12', 13),
      at('2026-09-12', 14),
      at('2026-09-12', 15),
      at('2026-09-12', 16),
      at('2026-09-12', 17),
      at('2026-09-12', 18),
    ]);
  });

  it('straddles midnight through days[1].hours — the reason the server sends 48 hours', () => {
    const location = locationFixture({ localTime: '2026-09-12 21:05' });

    const slots = upcomingHours(location);

    expect(slots.map((hour) => hour.time)).toEqual([
      at('2026-09-12', 21),
      at('2026-09-12', 22),
      at('2026-09-12', 23),
      at('2026-09-13', 0),
      at('2026-09-13', 1),
      at('2026-09-13', 2),
    ]);
  });

  it('never reads the browser clock: the same place at another localTime shows other slots', () => {
    const morning = upcomingHours(locationFixture({ localTime: '2026-09-12 06:00' }));
    const evening = upcomingHours(locationFixture({ localTime: '2026-09-12 18:00' }));

    expect(morning[0]!.time).toBe(at('2026-09-12', 6));
    expect(evening[0]!.time).toBe(at('2026-09-12', 18));
  });

  it('answers what is left when the pool runs out, and the first slots without a localTime', () => {
    const late = locationFixture({
      localTime: '2026-09-12 22:00',
      days: [dayFixture({ hours: hoursOf('2026-09-12', 16, 29) })],
    });
    expect(upcomingHours(late).map((h) => h.time)).toEqual([
      at('2026-09-12', 22),
      at('2026-09-12', 23),
    ]);

    const unknown = locationFixture({ localTime: null });
    expect(upcomingHours(unknown).map((h) => h.time)).toEqual(
      Array.from({ length: 6 }, (_, i) => at('2026-09-12', i))
    );
  });

  it('honours the count, and copes with unsorted slots', () => {
    const location = locationFixture({
      localTime: '2026-09-12 10:00',
      days: [
        dayFixture({
          hours: [
            hourFixture({ time: at('2026-09-12', 12) }),
            hourFixture({ time: at('2026-09-12', 10) }),
            hourFixture({ time: at('2026-09-12', 11) }),
          ],
        }),
      ],
    });

    expect(upcomingHours(location, 2).map((h) => h.time)).toEqual([
      at('2026-09-12', 10),
      at('2026-09-12', 11),
    ]);
  });
});

describe('weekScale and barMasks — the bars are drawn on the WEEK’s scale', () => {
  it('finds the lowest minimum and the highest maximum of the week: 9° → 29°', () => {
    expect(weekScale(weekFixture())).toEqual({ min: 9, max: 29 });
    expect(weekScale([])).toBeNull();
  });

  it('masks the track before and after each day’s span, in per cent of the week', () => {
    const scale = { min: 9, max: 29 };

    // Today 16–29 on 9–29: 35 % of track before, none after — the artboard's
    // own `<i style="left: 0; width: 35%">` and `<i style="left: 100%">`.
    expect(barMasks(dayFixture({ minTempC: 16, maxTempC: 29 }), scale)).toEqual({
      left: 35,
      right: 0,
    });
    // Thursday 9–17: none before, 60 % after (the artboard draws 40 % filled).
    expect(barMasks(dayFixture({ minTempC: 9, maxTempC: 17 }), scale)).toEqual({
      left: 0,
      right: 60,
    });
  });

  it('draws a full bar on a flat week rather than dividing by zero', () => {
    expect(barMasks(dayFixture({ minTempC: 20, maxTempC: 20 }), { min: 20, max: 20 })).toEqual({
      left: 0,
      right: 0,
    });
  });

  it('clamps a day that falls outside the scale it is given', () => {
    expect(barMasks(dayFixture({ minTempC: -5, maxTempC: 40 }), { min: 0, max: 30 })).toEqual({
      left: 0,
      right: 0,
    });
  });
});
