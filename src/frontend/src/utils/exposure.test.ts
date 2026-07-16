import { describe, expect, it } from 'vitest';
import {
  aggregateExposure,
  computeExposureGrid,
  shadowLength,
  sunDirection,
  type Blocker,
  type ExposureGridResult,
  type ExposureParams,
} from './exposure';
import type { LightSlot } from '../types/Garden';

// SMA-17 5.3-C — the exposure engine contract. Constants the engraved model
// left open are implemented as PROPOSED and pinned here for orchestrator
// ratification: the shadow-length table, the 4 non-mockup aggregation combos,
// and the indoor lightSchedule thresholds.

type LightSlotInput = LightSlot;

const allActive = (rows: number, cols: number): boolean[][] =>
  Array.from({ length: rows }, () => Array.from({ length: cols }, () => true));

const baseParams = (
  rows: number,
  cols: number,
  over: Partial<ExposureParams> = {}
): ExposureParams => ({
  rows,
  cols,
  activeCells: allActive(rows, cols),
  orientation: 'S',
  hemisphere: 'N',
  latitudeBand: 'mid',
  gardenType: null,
  lightSchedule: null,
  blockers: [],
  overrides: {},
  season: 'summer',
  ...over,
});

const midBlockerAt = (row: number, col: number): Blocker => ({
  row,
  col,
  spanRows: 1,
  spanCols: 1,
  heightCategory: 'mid',
  blocksLight: true,
});

function shadowedKeys(result: ExposureGridResult): string[] {
  if (result.mode !== 'moment') throw new Error('expected moment mode');
  const keys: string[] = [];
  result.cells.forEach((row, r) =>
    row.forEach((state, c) => {
      if (state === 'shadowed') keys.push(`${r},${c}`);
    })
  );
  return keys;
}

function categoryAt(result: ExposureGridResult, row: number, col: number) {
  if (result.mode !== 'aggregate') throw new Error('expected aggregate mode');
  return result.cells[row][col];
}

describe('sunDirection — 3 moments × 2 hemispheres (engraved)', () => {
  it.each([
    ['morning', 'N', 'E'],
    ['noon', 'N', 'S'],
    ['evening', 'N', 'W'],
    ['morning', 'S', 'E'],
    ['noon', 'S', 'N'],
    ['evening', 'S', 'W'],
  ] as const)('%s / hemisphere %s → sun in the %s', (moment, hemi, expected) => {
    expect(sunDirection(moment, hemi)).toBe(expected);
  });
});

describe('orientation → grid-side mapping (bottom edge faces the orientation)', () => {
  // 5×5 grid, single 1×1 mid blocker at the center (2,2), summer/mid → len 1.
  // Northern hemisphere. The single shadowed cell proves the mapping.
  const cases: Array<[string, string, string]> = [
    // orientation, moment, expected shadowed cell "row,col"
    ['S', 'noon', '1,2'], // sun S = bottom side → shadow up (mockup: wall casts UP)
    ['S', 'morning', '2,1'], // sun E = right side → shadow left (mockup: trellis casts LEFT)
    ['S', 'evening', '2,3'], // sun W = left side → shadow right
    ['N', 'noon', '3,2'], // bottom faces N → S sun is at the top → shadow down
    ['N', 'morning', '2,3'],
    ['N', 'evening', '2,1'],
    ['E', 'noon', '2,3'],
    ['E', 'morning', '1,2'],
    ['E', 'evening', '3,2'],
    ['W', 'noon', '2,1'],
    ['W', 'morning', '3,2'],
    ['W', 'evening', '1,2'],
  ];
  it.each(cases)(
    'oriented %s, %s → shadow lands on [%s]',
    (orientation, moment, expected) => {
      const result = computeExposureGrid(
        baseParams(5, 5, {
          orientation,
          blockers: [midBlockerAt(2, 2)],
          moment: moment as ExposureParams['moment'],
        })
      );
      expect(shadowedKeys(result)).toEqual([expected]);
    }
  );
});

describe('shadowLength — full (height × season × latitudeBand) table (PROPOSED)', () => {
  it.each([
    // height, season, band, length
    ['low', 'summer', 'mid', 0],
    ['low', 'winter', 'mid', 1],
    ['mid', 'summer', 'mid', 1],
    ['mid', 'winter', 'mid', 2],
    ['tall', 'summer', 'mid', 2],
    ['tall', 'winter', 'mid', 3],
    ['low', 'summer', 'low', 0],
    ['low', 'winter', 'low', 0],
    ['mid', 'summer', 'low', 0],
    ['mid', 'winter', 'low', 1],
    ['tall', 'summer', 'low', 1],
    ['tall', 'winter', 'low', 2],
    ['low', 'summer', 'high', 1],
    ['low', 'winter', 'high', 2],
    ['mid', 'summer', 'high', 2],
    ['mid', 'winter', 'high', 3],
    ['tall', 'summer', 'high', 3],
    ['tall', 'winter', 'high', 4],
  ] as const)('%s / %s / band %s → %i cells', (height, season, band, expected) => {
    expect(shadowLength(height, season, band)).toBe(expected);
  });

  it('a shadow ray is clipped at the grid edge', () => {
    // Tall blocker one cell from the top edge, winter/high → length 4, but
    // only 1 cell fits before the edge.
    const result = computeExposureGrid(
      baseParams(5, 5, {
        latitudeBand: 'high',
        season: 'winter',
        blockers: [
          { row: 1, col: 2, spanRows: 1, spanCols: 1, heightCategory: 'tall', blocksLight: true },
        ],
        moment: 'noon', // oriented S → shadow up
      })
    );
    expect(shadowedKeys(result)).toEqual(['0,2']);
  });

  it('blocksLight: false casts nothing (§6 "Pas d\'ombre")', () => {
    const result = computeExposureGrid(
      baseParams(5, 5, {
        blockers: [
          { row: 2, col: 2, spanRows: 1, spanCols: 1, heightCategory: 'tall', blocksLight: false },
        ],
        moment: 'noon',
      })
    );
    expect(shadowedKeys(result)).toEqual([]);
  });
});

describe('aggregateExposure — all 8 moment combinations', () => {
  it.each([
    // morning, noon, evening → category (4 mockup-grounded + 4 PROPOSED)
    [true, true, true, 'full'], // mockup: lit all three
    [true, true, false, 'morning'], // mockup: morning+noon
    [false, true, true, 'afternoon'], // mockup: noon+evening
    [true, false, true, 'shade'], // mockup rule: noon blocked → shade
    [false, true, false, 'full'], // PROPOSED: noon-only → full (best remaining light)
    [true, false, false, 'shade'], // PROPOSED (noon-blocked rule)
    [false, false, true, 'shade'], // PROPOSED (noon-blocked rule)
    [false, false, false, 'shade'], // PROPOSED (noon-blocked rule)
  ] as const)('morning=%s noon=%s evening=%s → %s', (morning, noon, evening, expected) => {
    expect(aggregateExposure({ morning, noon, evening })).toBe(expected);
  });
});

describe('manual per-cell overrides', () => {
  it('override wins over a computed shade', () => {
    // Blocker at (2,1) noon-shadows (1,1) → shade; the override flips it.
    const params = baseParams(3, 3, {
      blockers: [midBlockerAt(2, 1)],
      overrides: { '1,1': 'full' },
    });
    const result = computeExposureGrid(params);
    expect(categoryAt(result, 1, 1)).toBe('full');
    // The un-overridden sibling still computes normally.
    const without = computeExposureGrid({ ...params, overrides: {} });
    expect(categoryAt(without, 1, 1)).toBe('shade');
  });

  it('override on an inactive cell is ignored (stays null)', () => {
    const active = allActive(3, 3);
    active[0][0] = false;
    const result = computeExposureGrid(
      baseParams(3, 3, { activeCells: active, overrides: { '0,0': 'full' } })
    );
    expect(categoryAt(result, 0, 0)).toBeNull();
  });

  it('overrides are ignored in moment mode (they override the aggregate category)', () => {
    const result = computeExposureGrid(
      baseParams(3, 3, { overrides: { '1,1': 'shade' }, moment: 'noon' })
    );
    expect(shadowedKeys(result)).toEqual([]);
    if (result.mode === 'moment') expect(result.cells[1][1]).toBe('lit');
  });
});

describe('indoor lightSchedule short-circuit (PROPOSED thresholds)', () => {
  const indoor = (
    lightSchedule: LightSlotInput[] | null,
    over: Partial<ExposureParams> = {}
  ) =>
    computeExposureGrid(
      baseParams(2, 2, { gardenType: 'indoor', lightSchedule, ...over })
    );

  it.each([
    // slots, total hours, expected — thresholds: ≥8 full; [4,8) morning; <4 shade
    [[{ start: '06:00', end: '14:00' }], 8, 'full'],
    [[{ start: '06:00', end: '10:00' }, { start: '12:00', end: '18:00' }], 10, 'full'],
    [[{ start: '06:00', end: '13:30' }], 7.5, 'morning'],
    [[{ start: '06:00', end: '10:00' }], 4, 'morning'],
    [[{ start: '06:00', end: '09:00' }], 3, 'shade'],
    [[], 0, 'shade'],
    [null, 0, 'shade'],
  ] as Array<[LightSlotInput[] | null, number, string]>)(
    'schedule %j (%s h) → uniform %s',
    (slots, _hours, expected) => {
      const result = indoor(slots);
      expect(categoryAt(result, 0, 0)).toBe(expected);
      expect(categoryAt(result, 1, 1)).toBe(expected); // uniform across the grid
    }
  );

  it('guards malformed/null schedule entries (they contribute 0 hours)', () => {
    const slots = [
      null,
      { start: '06:00' },
      { start: '06:00', end: '14:00' },
    ] as unknown as LightSlot[];
    expect(categoryAt(indoor(slots), 0, 0)).toBe('full'); // only the 8h slot counts
  });

  it('ignores outdoor parameters: blockers produce no per-cell variance indoors', () => {
    const result = indoor([{ start: '06:00', end: '14:00' }], {
      blockers: [midBlockerAt(1, 1)],
      season: 'winter',
      latitudeBand: 'high',
    });
    expect(categoryAt(result, 0, 0)).toBe('full');
    expect(categoryAt(result, 0, 1)).toBe('full');
    expect(categoryAt(result, 1, 0)).toBe('full');
    expect(categoryAt(result, 1, 1)).toBe('full');
  });

  it('manual overrides still win over the indoor uniform', () => {
    const result = indoor([{ start: '06:00', end: '14:00' }], {
      overrides: { '0,0': 'shade' },
    });
    expect(categoryAt(result, 0, 0)).toBe('shade');
    expect(categoryAt(result, 1, 1)).toBe('full');
  });

  it('moment mode indoors: uniformly lit unless the schedule aggregates to shade (PROPOSED)', () => {
    const lit = indoor([{ start: '06:00', end: '14:00' }], { moment: 'noon' });
    if (lit.mode === 'moment') {
      expect(lit.cells[0][0]).toBe('lit');
      expect(lit.cells[1][1]).toBe('lit');
    } else {
      throw new Error('expected moment mode');
    }
    const dark = indoor([], { moment: 'noon' });
    if (dark.mode === 'moment') expect(dark.cells[0][0]).toBe('shadowed');
  });
});

describe('defaults at READ time (null → N / mid / S / outdoor)', () => {
  it('null hemisphere behaves as N (deep-equal outputs)', () => {
    const blockers = [midBlockerAt(2, 2)];
    const withNull = computeExposureGrid(baseParams(5, 5, { hemisphere: null, blockers }));
    const withN = computeExposureGrid(baseParams(5, 5, { hemisphere: 'N', blockers }));
    expect(withNull).toEqual(withN);
  });

  it('null latitudeBand behaves as mid', () => {
    const blockers = [midBlockerAt(2, 2)];
    const withNull = computeExposureGrid(
      baseParams(5, 5, { latitudeBand: null, blockers, season: 'winter' })
    );
    const withMid = computeExposureGrid(
      baseParams(5, 5, { latitudeBand: 'mid', blockers, season: 'winter' })
    );
    expect(withNull).toEqual(withMid);
  });

  it('null orientation behaves as S (the dialog default)', () => {
    const blockers = [midBlockerAt(2, 2)];
    const withNull = computeExposureGrid(baseParams(5, 5, { orientation: null, blockers }));
    const withS = computeExposureGrid(baseParams(5, 5, { orientation: 'S', blockers }));
    expect(withNull).toEqual(withS);
  });

  it('null gardenType behaves as outdoor (blockers apply)', () => {
    const result = computeExposureGrid(
      baseParams(3, 3, { gardenType: null, blockers: [midBlockerAt(2, 1)] })
    );
    expect(categoryAt(result, 1, 1)).toBe('shade'); // noon shadow applied
  });
});

describe('determinism / purity', () => {
  it('the same input twice yields deep-equal output and never mutates its params', () => {
    const params = baseParams(6, 6, {
      blockers: [
        midBlockerAt(3, 3),
        { row: 0, col: 0, spanRows: 2, spanCols: 1, heightCategory: 'tall', blocksLight: true },
      ],
      overrides: { '4,4': 'afternoon' },
      season: 'winter',
    });
    const snapshot = structuredClone(params);
    const first = computeExposureGrid(params);
    const second = computeExposureGrid(params);
    expect(first).toEqual(second);
    expect(params).toEqual(snapshot); // inputs untouched
  });
});

describe('mockup scene — 10×8, oriented S, wall bottom + trellis right (SMA-17 demo)', () => {
  // rows=8, cols=10; summer, mid band, northern hemisphere → lengths 1.
  const wall: Blocker = {
    row: 7, col: 0, spanRows: 1, spanCols: 6, heightCategory: 'mid', blocksLight: true,
  };
  const trellis: Blocker = {
    row: 0, col: 9, spanRows: 4, spanCols: 1, heightCategory: 'mid', blocksLight: true,
  };
  const scene = () =>
    computeExposureGrid(baseParams(8, 10, { blockers: [wall, trellis] }));

  it('wall casts its noon shadow UP: the row above the wall is SHADE', () => {
    const result = scene();
    for (let c = 0; c <= 5; c++) {
      expect(categoryAt(result, 6, c)).toBe('shade');
    }
  });

  it('trellis casts its morning shadow LEFT: the column beside it is AFTERNOON_SUN', () => {
    const result = scene();
    for (let r = 0; r <= 3; r++) {
      expect(categoryAt(result, r, 8)).toBe('afternoon');
    }
  });

  it("the cell right of the wall loses only the evening → MORNING_SUN", () => {
    expect(categoryAt(scene(), 7, 6)).toBe('morning');
  });

  it('blockers do not shadow their own footprint', () => {
    const result = scene();
    for (let c = 0; c <= 5; c++) expect(categoryAt(result, 7, c)).toBe('full');
    for (let r = 0; r <= 3; r++) expect(categoryAt(result, r, 9)).toBe('full');
  });

  it('every other cell is FULL_SUN (exhaustive sweep)', () => {
    const result = scene();
    if (result.mode !== 'aggregate') throw new Error('expected aggregate');
    const special = new Set<string>();
    for (let c = 0; c <= 5; c++) special.add(`6,${c}`); // shade row
    for (let r = 0; r <= 3; r++) special.add(`${r},8`); // afternoon col
    special.add('7,6'); // morning cell
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 10; c++) {
        if (special.has(`${r},${c}`)) continue;
        expect(result.cells[r][c]).toBe('full');
      }
    }
  });

  it('winter doubles the mockup shadows (mid → 2 cells)', () => {
    const result = computeExposureGrid(
      baseParams(8, 10, { blockers: [wall, trellis], season: 'winter' })
    );
    // Wall noon shadow now covers rows 6 AND 5.
    for (let c = 0; c <= 5; c++) {
      expect(categoryAt(result, 6, c)).toBe('shade');
      expect(categoryAt(result, 5, c)).toBe('shade');
    }
    // Trellis morning shadow now covers cols 8 AND 7.
    for (let r = 0; r <= 3; r++) {
      expect(categoryAt(result, r, 8)).toBe('afternoon');
      expect(categoryAt(result, r, 7)).toBe('afternoon');
    }
  });
});
