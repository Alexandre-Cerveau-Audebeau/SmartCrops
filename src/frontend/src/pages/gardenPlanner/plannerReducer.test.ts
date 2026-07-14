import { describe, expect, it } from 'vitest';
import {
  initialPlannerState,
  plannerReducer,
  type PlannerPlacement,
  type PlannerState,
} from './plannerReducer';

// 5.1-B locks. The "undo" semantics being locked are EXACTLY the pre-reducer
// behavior: there is no history stack — Cancel restores a deep copy of the
// last-saved snapshot (`lastSavedRef` before, `state.lastSaved` now), set by
// hydration and by a successful save; with no snapshot yet, Cancel discards
// the setup draft (grid null, placements cleared, dims zeroed).

const placement = (
  id: string,
  overrides: Partial<PlannerPlacement> = {}
): PlannerPlacement => ({
  id,
  plantId: `plant-${id}`,
  startRow: 0,
  startCol: 0,
  spanRows: 1,
  spanCols: 1,
  notes: null,
  ...overrides,
});

/** A hydrated 3x3 all-active state with one placement at (1,1). */
function hydrated(): PlannerState {
  return plannerReducer(initialPlannerState, {
    type: 'HYDRATE_FROM_LAYOUT',
    width: 3,
    height: 3,
    cellSize: '50cm',
    cellsJson: null,
    placements: [placement('srv-1', { startRow: 1, startCol: 1 })],
  });
}

describe('plannerReducer', () => {
  it('HYDRATE_FROM_LAYOUT builds the grid, applies placements, snapshots, and is clean', () => {
    const s = hydrated();
    expect(s.grid).toHaveLength(3);
    expect(s.grid![0]).toHaveLength(3);
    expect(s.grid![0][0]).toEqual({ active: true });
    expect(s.layoutWidth).toBe(3);
    expect(s.layoutHeight).toBe(3);
    expect(s.cellSize).toBe('50cm');
    expect(s.placements).toHaveLength(1);
    expect(s.isDirty).toBe(false);
    // Snapshot is a DEEP copy — mutating current state must not leak into it.
    expect(s.lastSaved!.grid).not.toBe(s.grid);
    expect(s.lastSaved!.grid![0][0]).not.toBe(s.grid![0][0]);
    expect(s.lastSaved!.placements[0]).not.toBe(s.placements[0]);
  });

  it('HYDRATE_FROM_LAYOUT parses inactive cells from cellsJson', () => {
    const s = plannerReducer(initialPlannerState, {
      type: 'HYDRATE_FROM_LAYOUT',
      width: 2,
      height: 2,
      cellSize: '1m',
      cellsJson: JSON.stringify([{ row: 0, col: 1, active: false }]),
      placements: [],
    });
    expect(s.grid![0][1].active).toBe(false);
    expect(s.grid![0][0].active).toBe(true);
  });

  it('SETUP_CONFIRMED creates an all-active draft grid and marks dirty', () => {
    const s = plannerReducer(initialPlannerState, {
      type: 'SETUP_CONFIRMED',
      cols: 4,
      rows: 2,
      cellSize: '25cm',
    });
    expect(s.grid).toHaveLength(2);
    expect(s.grid![0]).toHaveLength(4);
    expect(s.grid!.flat().every((c) => c.active)).toBe(true);
    expect(s.isDirty).toBe(true);
    expect(s.lastSaved).toBeNull();
  });

  it('SETUP_CONFIRMED with pre-existing placements pins the current behavior: placements and snapshot carry over untouched', () => {
    // Current reducer behavior (spread): a new draft grid replaces the layout
    // but state.placements and state.lastSaved are NOT reset — placements
    // survive even if they no longer fit the new grid. Unreachable through
    // today's UI (setup only opens on empty layouts / after DISCARD_DRAFT,
    // which clears placements) — pinned as-is, not endorsed.
    const s = plannerReducer(hydrated(), {
      type: 'SETUP_CONFIRMED',
      cols: 2,
      rows: 2,
      cellSize: '25cm',
    });
    expect(s.grid).toHaveLength(2);
    expect(s.grid![0]).toHaveLength(2);
    // The (1,1) placement from the hydrated state is still there, untouched…
    expect(s.placements).toHaveLength(1);
    expect(s.placements[0].id).toBe('srv-1');
    expect(s.placements[0].startRow).toBe(1);
    // …and so is the pre-setup snapshot; only the layout fields moved.
    expect(s.lastSaved).not.toBeNull();
    expect(s.lastSaved!.layoutWidth).toBe(3);
    expect(s.isDirty).toBe(true);
    expect(s.removedSeq).toBe(0); // no removal event — nothing was dropped
  });

  it('RESIZED keeps surviving cells, pads with active ones, drops out-of-bounds placements and reports them', () => {
    let s = hydrated();
    s = plannerReducer(s, { type: 'PAINT_END' }); // no-op guard warm-up
    const before = s.removedSeq;
    s = plannerReducer(s, {
      type: 'RESIZED',
      width: 1,
      height: 1,
      cellSize: '50cm',
    });
    expect(s.grid).toHaveLength(1);
    expect(s.grid![0]).toHaveLength(1);
    // The (1,1) placement no longer fits a 1x1 grid.
    expect(s.placements).toHaveLength(0);
    expect(s.removedCount).toBe(1);
    expect(s.removedSeq).toBe(before + 1);
    expect(s.isDirty).toBe(true);
  });

  it('PAINT_START toggles the pressed cell, arms the polarity, and requires shape-edit mode', () => {
    const inert = plannerReducer(hydrated(), {
      type: 'PAINT_START',
      row: 0,
      col: 0,
    });
    expect(inert.isPainting).toBe(false); // guard: not in shape-edit mode

    let s = plannerReducer(hydrated(), {
      type: 'SET_SHAPE_EDIT_MODE',
      enabled: true,
    });
    s = plannerReducer(s, { type: 'PAINT_START', row: 0, col: 0 });
    expect(s.grid![0][0].active).toBe(false);
    expect(s.isPainting).toBe(true);
    expect(s.paintAction).toBe(false); // polarity = !previous
    expect(s.isDirty).toBe(true);
  });

  it('PAINT_START is a guarded no-op for out-of-bounds coordinates', () => {
    const armed = plannerReducer(hydrated(), {
      type: 'SET_SHAPE_EDIT_MODE',
      enabled: true,
    });
    for (const [row, col] of [
      [-1, 0],
      [0, -1],
      [3, 0],
      [0, 3],
    ] as const) {
      const s = plannerReducer(armed, { type: 'PAINT_START', row, col });
      expect(s).toBe(armed); // unchanged state, no throw
      expect(s.isPainting).toBe(false);
      expect(s.paintAction).toBeNull();
    }
  });

  it('PAINT_ENTER is a guarded no-op for out-of-bounds coordinates mid-drag', () => {
    let painting = plannerReducer(hydrated(), {
      type: 'SET_SHAPE_EDIT_MODE',
      enabled: true,
    });
    painting = plannerReducer(painting, { type: 'PAINT_START', row: 0, col: 0 });
    for (const [row, col] of [
      [-1, 0],
      [0, -1],
      [3, 0],
      [0, 3],
    ] as const) {
      const s = plannerReducer(painting, { type: 'PAINT_ENTER', row, col });
      expect(s).toBe(painting); // unchanged state, no throw
      expect(s.isPainting).toBe(true); // the drag itself stays armed
      expect(s.paintAction).toBe(false);
    }
  });

  it('PAINT_ENTER applies the armed polarity only while painting', () => {
    const untouched = plannerReducer(hydrated(), {
      type: 'PAINT_ENTER',
      row: 0,
      col: 1,
    });
    expect(untouched.grid![0][1].active).toBe(true); // guard: not painting

    let s = plannerReducer(hydrated(), {
      type: 'SET_SHAPE_EDIT_MODE',
      enabled: true,
    });
    s = plannerReducer(s, { type: 'PAINT_START', row: 0, col: 0 });
    s = plannerReducer(s, { type: 'PAINT_ENTER', row: 0, col: 1 });
    expect(s.grid![0][1].active).toBe(false);
  });

  it('PAINT_END disarms painting', () => {
    let s = plannerReducer(hydrated(), {
      type: 'SET_SHAPE_EDIT_MODE',
      enabled: true,
    });
    s = plannerReducer(s, { type: 'PAINT_START', row: 0, col: 0 });
    s = plannerReducer(s, { type: 'PAINT_END' });
    expect(s.isPainting).toBe(false);
    expect(s.paintAction).toBeNull();
  });

  it('SET_ALL_CELLS flips every cell and marks dirty', () => {
    const s = plannerReducer(hydrated(), {
      type: 'SET_ALL_CELLS',
      active: false,
    });
    expect(s.grid!.flat().every((c) => !c.active)).toBe(true);
    expect(s.isDirty).toBe(true);
  });

  it('ADD_ROW_TOP prepends a row and shifts placements down', () => {
    const s = plannerReducer(hydrated(), { type: 'ADD_ROW_TOP' });
    expect(s.grid).toHaveLength(4);
    expect(s.layoutHeight).toBe(4);
    expect(s.placements[0].startRow).toBe(2);
    expect(s.isDirty).toBe(true);
  });

  it('ADD_ROW_BOTTOM appends a row without shifting placements', () => {
    const s = plannerReducer(hydrated(), { type: 'ADD_ROW_BOTTOM' });
    expect(s.grid).toHaveLength(4);
    expect(s.placements[0].startRow).toBe(1);
  });

  it('ADD_COL_LEFT prepends a column and shifts placements right', () => {
    const s = plannerReducer(hydrated(), { type: 'ADD_COL_LEFT' });
    expect(s.grid![0]).toHaveLength(4);
    expect(s.layoutWidth).toBe(4);
    expect(s.placements[0].startCol).toBe(2);
  });

  it('ADD_COL_RIGHT appends a column without shifting placements', () => {
    const s = plannerReducer(hydrated(), { type: 'ADD_COL_RIGHT' });
    expect(s.grid![0]).toHaveLength(4);
    expect(s.placements[0].startCol).toBe(1);
  });

  it('REMOVE_ROW_TOP drops row-0 placements, shifts the rest up, and reports removals', () => {
    let s = plannerReducer(hydrated(), {
      type: 'ADD_PLACEMENT',
      id: 'new-1',
      plantId: 'p9',
      row: 0,
      col: 2,
    });
    s = plannerReducer(s, { type: 'REMOVE_ROW_TOP' });
    expect(s.grid).toHaveLength(2);
    expect(s.placements).toHaveLength(1);
    expect(s.placements[0].id).toBe('srv-1');
    expect(s.placements[0].startRow).toBe(0); // shifted 1 -> 0
    expect(s.removedCount).toBe(1);
  });

  it('REMOVE_ROW_BOTTOM refuses to shrink below 2 rows', () => {
    let s = hydrated();
    s = plannerReducer(s, { type: 'REMOVE_ROW_BOTTOM' }); // 3 -> 2
    const blocked = plannerReducer(s, { type: 'REMOVE_ROW_BOTTOM' }); // guard
    expect(blocked).toBe(s);
    expect(blocked.grid).toHaveLength(2);
  });

  it('REMOVE_COL_LEFT drops col-0 placements and shifts the rest left', () => {
    let s = plannerReducer(hydrated(), {
      type: 'ADD_PLACEMENT',
      id: 'new-1',
      plantId: 'p9',
      row: 2,
      col: 0,
    });
    s = plannerReducer(s, { type: 'REMOVE_COL_LEFT' });
    expect(s.placements).toHaveLength(1);
    expect(s.placements[0].startCol).toBe(0); // shifted 1 -> 0
    expect(s.removedCount).toBe(1);
  });

  it('REMOVE_COL_RIGHT drops placements that no longer fit', () => {
    let s = plannerReducer(hydrated(), {
      type: 'ADD_PLACEMENT',
      id: 'new-1',
      plantId: 'p9',
      row: 0,
      col: 2,
    });
    s = plannerReducer(s, { type: 'REMOVE_COL_RIGHT' });
    expect(s.grid![0]).toHaveLength(2);
    expect(s.placements.map((p) => p.id)).toEqual(['srv-1']);
    expect(s.removedCount).toBe(1);
  });

  it('ADD_PLACEMENT appends a 1x1 placement with the provided id', () => {
    const s = plannerReducer(hydrated(), {
      type: 'ADD_PLACEMENT',
      id: 'new-7',
      plantId: 'basil',
      row: 2,
      col: 0,
    });
    expect(s.placements).toHaveLength(2);
    expect(s.placements[1]).toEqual({
      id: 'new-7',
      plantId: 'basil',
      startRow: 2,
      startCol: 0,
      spanRows: 1,
      spanCols: 1,
      notes: null,
    });
    expect(s.isDirty).toBe(true);
  });

  it('REPLACE_PLACEMENT swaps the plant, keeping id and geometry', () => {
    const s = plannerReducer(hydrated(), {
      type: 'REPLACE_PLACEMENT',
      placementId: 'srv-1',
      plantId: 'tomato',
    });
    expect(s.placements[0].plantId).toBe('tomato');
    expect(s.placements[0].id).toBe('srv-1');
    expect(s.placements[0].startRow).toBe(1);
    expect(s.isDirty).toBe(true);
  });

  it('REMOVE_PLACEMENT filters by id', () => {
    const s = plannerReducer(hydrated(), {
      type: 'REMOVE_PLACEMENT',
      placementId: 'srv-1',
    });
    expect(s.placements).toHaveLength(0);
    expect(s.isDirty).toBe(true);
  });

  it('SET_SHAPE_EDIT_MODE toggles the mode without dirtying', () => {
    const s = plannerReducer(hydrated(), {
      type: 'SET_SHAPE_EDIT_MODE',
      enabled: true,
    });
    expect(s.shapeEditMode).toBe(true);
    expect(s.isDirty).toBe(false);
  });

  it('ZOOM_IN steps by 0.2 and clamps at 2', () => {
    let s = hydrated();
    for (let i = 0; i < 10; i++) s = plannerReducer(s, { type: 'ZOOM_IN' });
    expect(s.zoom).toBe(2);
  });

  it('ZOOM_OUT steps by 0.2 and clamps at 0.5', () => {
    let s = hydrated();
    for (let i = 0; i < 10; i++) s = plannerReducer(s, { type: 'ZOOM_OUT' });
    expect(s.zoom).toBe(0.5);
  });

  it('MARK_SAVED clears dirty and re-snapshots the CURRENT layout (deep copy)', () => {
    let s = plannerReducer(hydrated(), { type: 'ADD_ROW_BOTTOM' });
    expect(s.isDirty).toBe(true);
    s = plannerReducer(s, { type: 'MARK_SAVED' });
    expect(s.isDirty).toBe(false);
    expect(s.lastSaved!.layoutHeight).toBe(4);
    expect(s.lastSaved!.grid).not.toBe(s.grid);
    expect(s.lastSaved!.placements[0]).not.toBe(s.placements[0]);
  });

  it('RESTORE_LAST_SAVED (the Cancel "undo") restores the snapshot wholesale and clears dirty', () => {
    let s = hydrated();
    s = plannerReducer(s, { type: 'ADD_ROW_TOP' });
    s = plannerReducer(s, {
      type: 'REMOVE_PLACEMENT',
      placementId: 'srv-1',
    });
    expect(s.placements).toHaveLength(0);
    s = plannerReducer(s, { type: 'RESTORE_LAST_SAVED' });
    expect(s.grid).toHaveLength(3);
    expect(s.layoutHeight).toBe(3);
    expect(s.placements).toHaveLength(1);
    expect(s.placements[0].startRow).toBe(1); // pre-shift geometry restored
    expect(s.isDirty).toBe(false);
    // Restore hands out copies — editing after Cancel must not corrupt the snapshot.
    expect(s.grid).not.toBe(s.lastSaved!.grid);
    expect(s.placements[0]).not.toBe(s.lastSaved!.placements[0]);
  });

  it('RESTORE_LAST_SAVED without a snapshot is a no-op (page routes to DISCARD_DRAFT)', () => {
    const draft = plannerReducer(initialPlannerState, {
      type: 'SETUP_CONFIRMED',
      cols: 3,
      rows: 3,
      cellSize: '50cm',
    });
    expect(plannerReducer(draft, { type: 'RESTORE_LAST_SAVED' })).toBe(draft);
  });

  it('DISCARD_DRAFT clears the layout back to the pre-setup state', () => {
    let s = plannerReducer(initialPlannerState, {
      type: 'SETUP_CONFIRMED',
      cols: 3,
      rows: 3,
      cellSize: '50cm',
    });
    s = plannerReducer(s, { type: 'DISCARD_DRAFT' });
    expect(s.grid).toBeNull();
    expect(s.placements).toHaveLength(0);
    expect(s.layoutWidth).toBe(0);
    expect(s.layoutHeight).toBe(0);
    expect(s.isDirty).toBe(false);
  });
});
