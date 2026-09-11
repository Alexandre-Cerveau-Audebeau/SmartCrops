import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatCount, formatDecimal } from './formatNumber';

// ROUND 6 (Extension #4-20) — one `Intl.NumberFormat` per (language, digits),
// built on first use. The Gardens table and the Statistics rows format a figure
// per cell per render, and each call used to construct a formatter.
describe('formatNumber — formatters are built once per locale and options', () => {
  afterEach(() => vi.restoreAllMocks());

  it('formats as before, in both languages', () => {
    expect(formatCount(1440, 'en')).toBe('1,440');
    expect(formatCount(1440, 'fr')).toBe('1\u202f440');
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
