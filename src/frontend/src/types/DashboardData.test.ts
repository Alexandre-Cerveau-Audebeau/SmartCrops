import { describe, expect, it } from 'vitest';
import { EMPTY_DASHBOARD_DATA } from './DashboardData';

describe('EMPTY_DASHBOARD_DATA (round 1, E20)', () => {
  it('is frozen, and so are the three containers a widget could write into', () => {
    // Shallow freezing would leave every hazard the freeze exists for: what a
    // widget would push into or sort is the arrays, not the wrapper.
    expect(Object.isFrozen(EMPTY_DASHBOARD_DATA)).toBe(true);
    expect(Object.isFrozen(EMPTY_DASHBOARD_DATA.gardens)).toBe(true);
    expect(Object.isFrozen(EMPTY_DASHBOARD_DATA.varieties)).toBe(true);
    expect(Object.isFrozen(EMPTY_DASHBOARD_DATA.totals)).toBe(true);
  });

  it('refuses the writes that would poison the empty state for every widget', () => {
    // Every widget mounted during a load holds these same three references, so
    // one in-place write anywhere downstream used to survive until a reload.
    // Vitest runs under ES modules, which are strict mode: a write to a frozen
    // object throws rather than failing silently.
    expect(() => EMPTY_DASHBOARD_DATA.gardens.push({} as never)).toThrow();
    expect(() => EMPTY_DASHBOARD_DATA.varieties.push({} as never)).toThrow();
    expect(() => {
      EMPTY_DASHBOARD_DATA.totals.gardenCount = 7;
    }).toThrow();
  });

  it('still reads as an empty aggregate', () => {
    expect(EMPTY_DASHBOARD_DATA.gardens).toEqual([]);
    expect(EMPTY_DASHBOARD_DATA.varieties).toEqual([]);
    expect(EMPTY_DASHBOARD_DATA.totals).toEqual({
      gardenCount: 0,
      placementCount: 0,
      varietyCount: 0,
      catalogPlantCount: 0,
    });
  });
});
