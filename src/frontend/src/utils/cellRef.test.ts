import { describe, expect, it } from 'vitest';
import { cellRef, colToLetter } from './cellRef';

// Moved verbatim from placementGeometry.test.ts (review round 1 of SMA-18
// lot 1) together with the two formatters — same contract, new home.
describe('cell references (collision toast copy)', () => {
  it.each([
    [0, 'A'],
    [7, 'H'],
    [25, 'Z'],
    [26, 'AA'],
  ] as const)('colToLetter(%s) → %s', (col, letter) => {
    expect(colToLetter(col)).toBe(letter);
  });

  it('cellRef is column letter + 1-based row (mockup "H3")', () => {
    expect(cellRef(2, 7)).toBe('H3');
    expect(cellRef(0, 0)).toBe('A1');
  });
});
