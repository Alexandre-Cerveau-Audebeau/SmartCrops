import { describe, expect, it } from 'vitest';
import { catalogFor } from '../test/fixtures/formulas';
import { planSizeBound } from './planSizeBound';

// SMA-448, lot F3, step L3 — the server's rule for a plan's size, on the
// client: the larger of the formula's limit and the stored size, in each
// dimension. The literals are Alexandre's (22/09 16:39, 18:02; 26/09).

describe('planSizeBound', () => {
  it('bounds a fresh Novice plan at 20 × 20, a Gardener one at 50 × 50, an Expert one at 100 × 100', () => {
    expect(planSizeBound(catalogFor('novice'), null)).toEqual({
      formula: 'novice',
      limit: { width: 20, height: 20 },
      cols: 20,
      rows: 20,
      kept: false,
    });
    expect(planSizeBound(catalogFor('gardener'), { width: 10, height: 8 })).toMatchObject({ cols: 50, rows: 50, kept: false });
    expect(planSizeBound(catalogFor('expert'), { width: 10, height: 8 })).toMatchObject({ cols: 100, rows: 100, kept: false });
  });

  it('keeps a plan already beyond its formula at its stored size — in the dimension that exceeds, the formula’s in the other', () => {
    expect(planSizeBound(catalogFor('gardener'), { width: 60, height: 40 })).toEqual({
      formula: 'gardener',
      limit: { width: 50, height: 50 },
      cols: 60,
      rows: 50,
      kept: true,
    });
  });

  it('bounds nothing while the catalogue is not read', () => {
    expect(planSizeBound(null, { width: 60, height: 60 })).toBeNull();
  });
});
