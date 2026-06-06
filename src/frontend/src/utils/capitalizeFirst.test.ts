import { describe, expect, it } from 'vitest';
import { capitalizeFirst } from './capitalizeFirst';

describe('capitalizeFirst (SMA-120 display sentence-case)', () => {
  it('capitalises a lowercase first letter, leaving the rest unchanged', () => {
    expect(capitalizeFirst('trident maple')).toBe('Trident maple');
    expect(capitalizeFirst('sweet basil')).toBe('Sweet basil');
  });

  it('handles a leading accented letter (é → É)', () => {
    expect(capitalizeFirst('érable trident')).toBe('Érable trident');
  });

  it('does NOT title-case — internal capitals and words are preserved', () => {
    expect(capitalizeFirst('Japanese maple')).toBe('Japanese maple');
    expect(capitalizeFirst('field maple')).toBe('Field maple');
  });

  it('returns null for null/empty/whitespace', () => {
    expect(capitalizeFirst(null)).toBeNull();
    expect(capitalizeFirst(undefined)).toBeNull();
    expect(capitalizeFirst('')).toBeNull();
  });
});
