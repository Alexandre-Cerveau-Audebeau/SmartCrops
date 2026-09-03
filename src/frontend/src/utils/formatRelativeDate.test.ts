import { describe, expect, it } from 'vitest';
import {
  RELATIVE_WINDOW_DAYS,
  daysBetween,
  formatDateTimeMeta,
  formatLongDate,
  formatRelativeDate,
  formatShortDate,
  isWithinRelativeWindow,
} from './formatRelativeDate';

// Fixed clock: 31 August 2026, 12:00 UTC (noon keeps every offset on the
// same calendar day, so the date-only assertions hold in any test timezone).
const NOW = new Date('2026-08-31T12:00:00Z');
const daysAgo = (days: number, extraMs = 0) =>
  new Date(NOW.getTime() - days * 86_400_000 - extraMs);
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);

// ICU separates a number from an abbreviated unit with a (narrow) no-break
// space (U+00A0 / U+202F); the assertions compare on plain spaces.
const plain = (s: string) => s.replace(/\s/g, ' ');

describe('formatRelativeDate (SMA-414)', () => {
  it('speaks French: yesterday, days, weeks, then a short date past 30 days', () => {
    expect(formatRelativeDate(daysAgo(1), NOW, 'fr')).toBe('hier');
    expect(formatRelativeDate(daysAgo(4), NOW, 'fr')).toBe('il y a 4 jours');
    expect(formatRelativeDate(daysAgo(10), NOW, 'fr')).toBe('il y a 10 jours');
    expect(formatRelativeDate(daysAgo(14), NOW, 'fr')).toBe('il y a 2 semaines');
    expect(formatRelativeDate(daysAgo(21), NOW, 'fr')).toBe('il y a 3 semaines');
    expect(formatRelativeDate(daysAgo(30), NOW, 'fr')).toBe('il y a 4 semaines');
    // 31 days → no relative wording any more: the short date.
    expect(formatRelativeDate(daysAgo(31), NOW, 'fr')).toBe(
      formatShortDate(daysAgo(31), 'fr')
    );
    expect(formatRelativeDate(new Date('2026-06-12T12:00:00Z'), NOW, 'fr')).toBe(
      '12 juin'
    );
  });

  it('speaks English with the same thresholds', () => {
    expect(formatRelativeDate(daysAgo(1), NOW, 'en')).toBe('yesterday');
    expect(formatRelativeDate(daysAgo(4), NOW, 'en')).toBe('4 days ago');
    expect(formatRelativeDate(daysAgo(14), NOW, 'en')).toBe('2 weeks ago');
    expect(formatRelativeDate(new Date('2026-06-12T12:00:00Z'), NOW, 'en')).toBe(
      'Jun 12'
    );
  });

  it('uses hours and minutes inside the first day', () => {
    expect(formatRelativeDate(hoursAgo(2), NOW, 'fr')).toBe('il y a 2 heures');
    expect(formatRelativeDate(hoursAgo(2), NOW, 'en')).toBe('2 hours ago');
    expect(formatRelativeDate(new Date(NOW.getTime() - 5 * 60_000), NOW, 'fr')).toBe(
      'il y a 5 minutes'
    );
    expect(formatRelativeDate(new Date(NOW.getTime() - 10_000), NOW, 'fr')).toBe(
      'maintenant'
    );
  });

  it('abbreviates in the short style, as the mobile cards do', () => {
    expect(plain(formatRelativeDate(daysAgo(4), NOW, 'fr', 'short'))).toBe(
      'il y a 4 j'
    );
    expect(plain(formatRelativeDate(daysAgo(14), NOW, 'fr', 'short'))).toBe(
      'il y a 2 sem.'
    );
    expect(plain(formatRelativeDate(hoursAgo(2), NOW, 'fr', 'short'))).toBe(
      'il y a 2 h'
    );
    expect(formatRelativeDate(daysAgo(1), NOW, 'fr', 'short')).toBe('hier');
  });

  it('treats a date ahead of the clock as today (clock skew), never as the future', () => {
    expect(formatRelativeDate(new Date(NOW.getTime() + 60_000), NOW, 'fr')).toBe(
      'aujourd’hui'
    );
    expect(formatRelativeDate(new Date(NOW.getTime() + 60_000), NOW, 'en')).toBe(
      'today'
    );
  });

  it('exposes the 30-day window to callers', () => {
    expect(RELATIVE_WINDOW_DAYS).toBe(30);
    expect(daysBetween(daysAgo(10), NOW)).toBe(10);
    expect(isWithinRelativeWindow(daysAgo(30), NOW)).toBe(true);
    expect(isWithinRelativeWindow(daysAgo(31), NOW)).toBe(false);
  });

  it('formats the long date and the meta line per language', () => {
    const date = new Date('2026-08-30T12:00:00Z');
    expect(formatLongDate(date, 'fr')).toBe('30 août 2026');
    expect(formatLongDate(date, 'en')).toBe('August 30, 2026');
    expect(formatDateTimeMeta(date, 'fr')).toMatch(/^dimanche 30 août, \d{2}:\d{2}$/);
    expect(formatDateTimeMeta(date, 'en')).toMatch(/^Sunday, August 30, \d{1,2}:\d{2}/);
  });
});
