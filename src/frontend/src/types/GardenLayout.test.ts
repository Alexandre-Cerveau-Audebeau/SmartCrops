import { describe, expect, it } from 'vitest';
import { parseCellsJson, serializeCellsJson, type CellData } from './GardenLayout';

// SMA-17 5.3-C: CellData gains the optional exposureOverride (type-only — the
// override UI ships in 5.3-D). The serialization must stay SPARSE: a cell with
// only an override serializes it; cells without it omit the field entirely.

describe('CellData.exposureOverride serialization (sparse)', () => {
  it('a cell with ONLY an exposureOverride is serialized with it', () => {
    const grid: CellData[][] = [
      [{ active: true }, { active: true, exposureOverride: 'shade' }],
      [{ active: true }, { active: true }],
    ];
    const json = serializeCellsJson(grid);
    expect(json).not.toBeNull();
    expect(JSON.parse(json!)).toEqual([
      { row: 0, col: 1, exposureOverride: 'shade' },
    ]);
  });

  it('cells without an override never carry the field', () => {
    const grid: CellData[][] = [
      [{ active: false }, { active: true, soil: 'clay' }],
    ];
    const parsed = JSON.parse(serializeCellsJson(grid)!) as Array<
      Record<string, unknown>
    >;
    for (const cell of parsed) {
      expect(cell).not.toHaveProperty('exposureOverride');
    }
  });

  it('an all-default grid still serializes to null', () => {
    const grid: CellData[][] = [
      [{ active: true }, { active: true }],
      [{ active: true }, { active: true }],
    ];
    expect(serializeCellsJson(grid)).toBeNull();
  });

  it('drops a malformed exposureOverride at the parsing boundary (CR 01158dd3)', () => {
    // Persisted JSON is untrusted: "sunny" is not an ExposureCategory and must
    // be dropped (tolerate-and-drop, the parser's established malformed-input
    // behavior) — never enter CellData as a fake category.
    const json = JSON.stringify([
      { row: 0, col: 0, exposureOverride: 'sunny' },
      { row: 0, col: 1, exposureOverride: 'shade' },
    ]);
    const grid = parseCellsJson(json, 2, 1);
    expect(grid[0][0]).not.toHaveProperty('exposureOverride');
    expect(grid[0][0].active).toBe(true); // the rest of the cell still parses
    expect(grid[0][1].exposureOverride).toBe('shade'); // valid value kept
  });

  it('round-trips through parse: override, soil, infrastructure and inactive survive', () => {
    const grid: CellData[][] = [
      [
        { active: true, exposureOverride: 'full' },
        { active: false },
        { active: true, soil: 'clay', exposureOverride: 'morning' },
      ],
      [
        { active: true },
        { active: true, infrastructure: 'wall' },
        { active: true },
      ],
    ];
    const restored = parseCellsJson(serializeCellsJson(grid), 3, 2);
    expect(restored[0][0].exposureOverride).toBe('full');
    expect(restored[0][1].active).toBe(false);
    expect(restored[0][2]).toMatchObject({
      active: true,
      soil: 'clay',
      exposureOverride: 'morning',
    });
    expect(restored[1][1].infrastructure).toBe('wall');
    expect(restored[1][2].exposureOverride).toBeUndefined();
  });
});
