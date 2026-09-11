import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatCount, formatDecimal, formatPercent } from './formatNumber';

// ROUND 6 (Extension #4-20) — one `Intl.NumberFormat` per (language, digits),
// built on first use. The Gardens table and the Statistics rows format a figure
// per cell per render, and each call used to construct a formatter.
describe('formatNumber — formatters are built once per locale and options', () => {
  afterEach(() => vi.restoreAllMocks());

  it('formats as before, in both languages', () => {
    expect(formatCount(1440, 'en')).toBe('1,440');
    // GROUPED, the French way, without naming the separator (round 7, S04 —
    // Extension #6-20 / #7-26): the repository pins neither Node nor ICU, and
    // the runtime at hand emits U+202F where another may emit U+00A0. What is
    // asserted is the grouping — one whitespace, no ordinary space, not the
    // English comma.
    const fr = formatCount(1440, 'fr');
    expect(fr).toMatch(/^1\s440$/u);
    expect(fr).not.toContain(' ');
    expect(fr).not.toBe(formatCount(1440, 'en'));
    expect(formatDecimal(1.75, 'en', 1)).toBe('1.8');
    expect(formatDecimal(1.75, 'fr', 1)).toBe('1,8');
  });

  it('reuses one instance for repeated calls with the same language and digits', () => {
    // A spy that still BUILDS: a bare `spyOn` on a constructor answers
    // `undefined` to `new`, so the real class is called through it.
    const Real = Intl.NumberFormat;
    const constructed = vi.spyOn(Intl, 'NumberFormat').mockImplementation(
      // A `function`, not an arrow: `new` needs a constructor, and a
      // constructor that returns an object hands that object back.
      function (...args: ConstructorParameters<typeof Intl.NumberFormat>) {
        return new Real(...args);
      } as unknown as typeof Intl.NumberFormat
    );
    const before = constructed.mock.calls.length;

    formatCount(1, 'de');
    formatCount(2, 'de');
    formatCount(3, 'de');
    formatDecimal(1.5, 'de', 1);
    formatDecimal(2.5, 'de', 1);

    // Two distinct keys — (de, 0) and (de, 1) — however many calls.
    expect(constructed.mock.calls.length - before).toBe(2);
  });
});

// ROUND 7 (S46 — Extension #8-8) — a percentage is written the way the
// language writes one, sign included.
describe('formatPercent', () => {
  it('writes « 17% » in English and « 17 % » in French, with a NON-breaking space', () => {
    expect(formatPercent(17, 'en')).toBe('17%');

    const fr = formatPercent(17, 'fr');
    expect(fr).toMatch(/^17\s%$/u);
    // Whichever no-break space the runtime's ICU chooses, never the ordinary
    // one a squeezed column is free to wrap at.
    expect(fr).not.toContain(' ');
  });

  it('takes the percentage as the widgets hold it, and rounds it whole', () => {
    expect(formatPercent(66.6, 'en')).toBe('67%');
    expect(formatPercent(0, 'en')).toBe('0%');
    expect(formatPercent(100, 'en')).toBe('100%');
  });
});
