import { describe, expect, it } from 'vitest';
import {
  arrayOf,
  isBoolean,
  isFiniteNumber,
  isNullableString,
  isRecord,
  isString,
  isWholeNumber,
  matches,
  nullable,
} from './wireChecks';

// SMA-336 PR 3b/5 — the primitives MOVED out of `dashboardApi.ts` keep the
// behaviour the eight rounds of PR 2/5 gave them (that file's own suite stays
// green untouched — the proof of a move rather than a rewrite), and the one
// primitive this lot adds is pinned on the values it exists for.

describe('isFiniteNumber — the check every temperature, wind and rainfall goes through', () => {
  it('accepts a negative temperature, a decimal rainfall and zero', () => {
    expect(isFiniteNumber(-2)).toBe(true);
    expect(isFiniteNumber(-45)).toBe(true);
    expect(isFiniteNumber(0.4)).toBe(true);
    expect(isFiniteNumber(0)).toBe(true);
    expect(isFiniteNumber(29.5)).toBe(true);
  });

  it('refuses what is not a finite number', () => {
    expect(isFiniteNumber(Number.NaN)).toBe(false);
    expect(isFiniteNumber(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isFiniteNumber(Number.NEGATIVE_INFINITY)).toBe(false);
    expect(isFiniteNumber('24')).toBe(false);
    expect(isFiniteNumber(null)).toBe(false);
    expect(isFiniteNumber(undefined)).toBe(false);
  });

  it('is NOT isWholeNumber: the two disagree on exactly the weather values', () => {
    // The reason the primitive exists (pre-flight § D.5): a count check would
    // refuse « −2 °C » and « 0.4 mm ».
    expect(isWholeNumber(-2)).toBe(false);
    expect(isWholeNumber(0.4)).toBe(false);
    expect(isFiniteNumber(-2)).toBe(true);
    expect(isFiniteNumber(0.4)).toBe(true);
  });
});

describe('the moved primitives', () => {
  it('isWholeNumber — whole and non-negative, nothing else', () => {
    expect(isWholeNumber(0)).toBe(true);
    expect(isWholeNumber(12)).toBe(true);
    expect(isWholeNumber(-1)).toBe(false);
    expect(isWholeNumber(1.5)).toBe(false);
    expect(isWholeNumber(Number.NaN)).toBe(false);
    expect(isWholeNumber('3')).toBe(false);
  });

  it('isString / isBoolean / isNullableString', () => {
    expect(isString('')).toBe(true);
    expect(isString(1)).toBe(false);
    expect(isBoolean(false)).toBe(true);
    expect(isBoolean('true')).toBe(false);
    expect(isNullableString(null)).toBe(true);
    expect(isNullableString('x')).toBe(true);
    expect(isNullableString(undefined)).toBe(false);
  });

  it('nullable — null or the item, never undefined', () => {
    const check = nullable(isFiniteNumber);
    expect(check(null)).toBe(true);
    expect(check(-3.5)).toBe(true);
    expect(check(undefined)).toBe(false);
    expect(check('x')).toBe(false);
  });

  it('arrayOf — every element, and a null element rejects the array', () => {
    const check = arrayOf(isString);
    expect(check([])).toBe(true);
    expect(check(['a', 'b'])).toBe(true);
    expect(check(['a', null])).toBe(false);
    expect(check('a')).toBe(false);
  });

  it('isRecord — a plain object, not null, not an array', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });

  it('matches — reads every listed field and refuses a non-record', () => {
    const check = matches<{ a: number; b: string | null }>({
      a: isFiniteNumber,
      b: isNullableString,
    });

    expect(check({ a: -1, b: null })).toBe(true);
    // An unknown property travels through: fields are read, never rebuilt.
    expect(check({ a: 1, b: 'x', extra: true })).toBe(true);
    expect(check({ a: 'one', b: null })).toBe(false);
    expect(check({ a: 1 })).toBe(false);
    expect(check(undefined)).toBe(false);
    expect(check(null)).toBe(false);
    expect(check([])).toBe(false);
  });
});
