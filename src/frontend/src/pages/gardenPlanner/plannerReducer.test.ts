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

  it('SETUP_CONFIRMED establishes a FRESH layout: placements/snapshot RESET and painting/shape-edit disarmed (F5/F8, SMA-17)', () => {
    // F5/F8 flip (SMA-17): a first setup is a fresh layout — placements: [] and
    // lastSaved: null, so the reducer contract no longer depends on setup being
    // reachable only from an empty layout. Editing an existing garden goes
    // through RESIZED (cells preserved, out-of-bounds filtered), never here.
    // Start from a state mid-shape-edit with a paint drag armed so the reset of
    // the transient editing fields (CR 496d6f2a) is observable.
    let base = plannerReducer(hydrated(), {
      type: 'SET_SHAPE_EDIT_MODE',
      enabled: true,
    });
    base = plannerReducer(base, { type: 'PAINT_START', row: 0, col: 0 });
    expect(base.shapeEditMode).toBe(true);
    expect(base.isPainting).toBe(true);

    const s = plannerReducer(base, {
      type: 'SETUP_CONFIRMED',
      cols: 2,
      rows: 2,
      cellSize: '25cm',
    });
    expect(s.grid).toHaveLength(2);
    expect(s.grid![0]).toHaveLength(2);
    // The hydrated placement and the pre-setup snapshot are both cleared.
    expect(s.placements).toHaveLength(0);
    expect(s.lastSaved).toBeNull();
    expect(s.isDirty).toBe(true);
    // Transient editing fields reset with the fresh layout.
    expect(s.shapeEditMode).toBe(false);
    expect(s.isPainting).toBe(false);
    expect(s.paintAction).toBeNull();
    // Reset is not a "removal event" (no eviction toast) — that is RESIZED's job.
    expect(s.removedSeq).toBe(0);
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

  it('MARK_SAVED with no edits in flight clears dirty and snapshots the submitted revision (deep copy)', () => {
    const s0 = plannerReducer(hydrated(), { type: 'ADD_ROW_BOTTOM' });
    expect(s0.isDirty).toBe(true);
    // No edits between submission and completion: submitted === current refs.
    const submitted = {
      grid: s0.grid,
      layoutWidth: s0.layoutWidth,
      layoutHeight: s0.layoutHeight,
      cellSize: s0.cellSize,
      placements: s0.placements,
    };
    const s = plannerReducer(s0, { type: 'MARK_SAVED', submitted });
    expect(s.isDirty).toBe(false);
    expect(s.lastSaved!.layoutHeight).toBe(4);
    expect(s.lastSaved!.grid).not.toBe(s.grid);
    expect(s.lastSaved!.placements[0]).not.toBe(s.placements[0]);
  });

  it('MARK_SAVED with an edit landed mid-save keeps dirty and snapshots the SUBMITTED revision', () => {
    const before = hydrated();
    // handleSave captures the submitted revision, then the request departs…
    const submitted = {
      grid: before.grid,
      layoutWidth: before.layoutWidth,
      layoutHeight: before.layoutHeight,
      cellSize: before.cellSize,
      placements: before.placements,
    };
    // …and the user keeps editing while saveLayout is in flight.
    const edited = plannerReducer(before, {
      type: 'ADD_PLACEMENT',
      id: 'new-1',
      plantId: 'p9',
      row: 2,
      col: 2,
    });
    const s = plannerReducer(edited, { type: 'MARK_SAVED', submitted });
    // The newer revision is NOT persisted — dirty stays on.
    expect(s.isDirty).toBe(true);
    // lastSaved reflects what the server actually received (1 placement)…
    expect(s.lastSaved!.placements).toHaveLength(1);
    expect(s.lastSaved!.placements[0].id).toBe('srv-1');
    // …while the current, newer state is untouched (2 placements).
    expect(s.placements).toHaveLength(2);
    expect(s.grid).toBe(edited.grid);
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

  // ── develop-store review absorption (ef076f0): F7 — placements cannot sit
  // on inactive cells; F6 — painting disarms on every context change. ──────

  it('painting a cell inactive evicts the placement occupying it and reports the removal (F7)', () => {
    let s = plannerReducer(hydrated(), {
      type: 'SET_SHAPE_EDIT_MODE',
      enabled: true,
    });
    const before = s.removedSeq;
    s = plannerReducer(s, { type: 'PAINT_START', row: 1, col: 1 });
    expect(s.grid![1][1].active).toBe(false);
    expect(s.placements).toHaveLength(0);
    expect(s.removedCount).toBe(1);
    expect(s.removedSeq).toBe(before + 1);
  });

  it('PAINT_ENTER with inactive polarity evicts swept placements; active polarity never drops (F7)', () => {
    let s = plannerReducer(hydrated(), {
      type: 'SET_SHAPE_EDIT_MODE',
      enabled: true,
    });
    s = plannerReducer(s, { type: 'PAINT_START', row: 0, col: 0 }); // polarity: inactive
    s = plannerReducer(s, { type: 'PAINT_ENTER', row: 1, col: 1 });
    expect(s.grid![1][1].active).toBe(false);
    expect(s.placements).toHaveLength(0);
    expect(s.removedCount).toBe(1);

    // Active-polarity drag over the same cell drops nothing.
    let a = plannerReducer(hydrated(), {
      type: 'SET_SHAPE_EDIT_MODE',
      enabled: true,
    });
    a = plannerReducer(a, { type: 'SET_ALL_CELLS', active: false }); // (also clears placements)
    a = plannerReducer(a, {
      type: 'ADD_PLACEMENT',
      id: 'new-1',
      plantId: 'p9',
      row: 1,
      col: 1,
    });
    const seqBefore = a.removedSeq;
    a = plannerReducer(a, { type: 'PAINT_START', row: 0, col: 0 }); // inactive -> active polarity
    a = plannerReducer(a, { type: 'PAINT_ENTER', row: 1, col: 1 });
    expect(a.grid![1][1].active).toBe(true);
    expect(a.placements).toHaveLength(1);
    expect(a.removedSeq).toBe(seqBefore);
  });

  it('SET_ALL_CELLS(false) clears every placement and reports; SET_ALL_CELLS(true) drops nothing (F7)', () => {
    const off = plannerReducer(hydrated(), {
      type: 'SET_ALL_CELLS',
      active: false,
    });
    expect(off.placements).toHaveLength(0);
    expect(off.removedCount).toBe(1);
    expect(off.removedSeq).toBe(1);

    const on = plannerReducer(hydrated(), {
      type: 'SET_ALL_CELLS',
      active: true,
    });
    expect(on.placements).toHaveLength(1);
    expect(on.removedSeq).toBe(0);
  });

  it('hydration, restore, discard and shape-edit-off all disarm an in-flight paint drag (F6)', () => {
    let painting = plannerReducer(hydrated(), {
      type: 'SET_SHAPE_EDIT_MODE',
      enabled: true,
    });
    painting = plannerReducer(painting, {
      type: 'PAINT_START',
      row: 0,
      col: 0,
    });
    expect(painting.isPainting).toBe(true);

    const hydratedAgain = plannerReducer(painting, {
      type: 'HYDRATE_FROM_LAYOUT',
      width: 3,
      height: 3,
      cellSize: '50cm',
      cellsJson: null,
      placements: [],
    });
    expect(hydratedAgain.isPainting).toBe(false);
    expect(hydratedAgain.paintAction).toBeNull();

    const restored = plannerReducer(painting, { type: 'RESTORE_LAST_SAVED' });
    expect(restored.isPainting).toBe(false);
    expect(restored.paintAction).toBeNull();

    const discarded = plannerReducer(painting, { type: 'DISCARD_DRAFT' });
    expect(discarded.isPainting).toBe(false);
    expect(discarded.paintAction).toBeNull();

    const modeOff = plannerReducer(painting, {
      type: 'SET_SHAPE_EDIT_MODE',
      enabled: false,
    });
    expect(modeOff.isPainting).toBe(false);
    expect(modeOff.paintAction).toBeNull();
  });

  it('PAINT_ENTER is inert once shape-edit mode is disabled mid-drag (F6)', () => {
    let s = plannerReducer(hydrated(), {
      type: 'SET_SHAPE_EDIT_MODE',
      enabled: true,
    });
    s = plannerReducer(s, { type: 'PAINT_START', row: 0, col: 0 });
    s = plannerReducer(s, { type: 'SET_SHAPE_EDIT_MODE', enabled: false });
    const after = plannerReducer(s, { type: 'PAINT_ENTER', row: 0, col: 1 });
    expect(after).toBe(s); // guarded no-op — grid untouched
    expect(after.grid![0][1].active).toBe(true);
  });
});

// SMA-17 5.3-D — exposure layer state: the three view-state actions never
// touch the draft; the per-cell override is a LAYOUT edit (sparse, dirty).
describe('plannerReducer exposure layer (SMA-17 5.3-D)', () => {
  it('defaults: layer hidden, noon, summer', () => {
    expect(initialPlannerState.exposureVisible).toBe(false);
    expect(initialPlannerState.exposureMoment).toBe('noon');
    expect(initialPlannerState.exposureSeason).toBe('summer');
  });

  it('TOGGLE_EXPOSURE flips visibility without dirtying the draft', () => {
    const s = hydrated();
    const on = plannerReducer(s, { type: 'TOGGLE_EXPOSURE' });
    expect(on.exposureVisible).toBe(true);
    expect(on.isDirty).toBe(false);
    expect(on.grid).toBe(s.grid); // view state only — the draft is untouched
    const off = plannerReducer(on, { type: 'TOGGLE_EXPOSURE' });
    expect(off.exposureVisible).toBe(false);
  });

  it('SET_EXPOSURE_MOMENT / SET_EXPOSURE_SEASON update the presets, clean', () => {
    let s = plannerReducer(hydrated(), {
      type: 'SET_EXPOSURE_MOMENT',
      moment: 'evening',
    });
    expect(s.exposureMoment).toBe('evening');
    s = plannerReducer(s, { type: 'SET_EXPOSURE_SEASON', season: 'winter' });
    expect(s.exposureSeason).toBe('winter');
    expect(s.isDirty).toBe(false);
  });

  it('SET_CELL_EXPOSURE_OVERRIDE writes the sparse override and marks dirty', () => {
    const s = hydrated();
    const after = plannerReducer(s, {
      type: 'SET_CELL_EXPOSURE_OVERRIDE',
      row: 0,
      col: 2,
      value: 'shade',
    });
    expect(after.grid![0][2].exposureOverride).toBe('shade');
    expect(after.isDirty).toBe(true);
    // Fresh grid reference (same mechanics as painting) so MARK_SAVED's
    // referential revision check can tell the edit apart.
    expect(after.grid).not.toBe(s.grid);
    // Sparse: no other cell gained the key.
    expect(after.grid![0][0]).not.toHaveProperty('exposureOverride');
  });

  it('SET_CELL_EXPOSURE_OVERRIDE with null clears the key (sparse) and marks dirty', () => {
    let s = plannerReducer(hydrated(), {
      type: 'SET_CELL_EXPOSURE_OVERRIDE',
      row: 0,
      col: 2,
      value: 'full',
    });
    s = plannerReducer(s, {
      type: 'SET_CELL_EXPOSURE_OVERRIDE',
      row: 0,
      col: 2,
      value: null,
    });
    // The property is REMOVED, not set to undefined — an undefined-valued key
    // would still make serializeCellsJson emit the cell.
    expect(s.grid![0][2]).not.toHaveProperty('exposureOverride');
    expect(s.isDirty).toBe(true);
  });

  it('SET_CELL_EXPOSURE_OVERRIDE is a guarded no-op out of bounds or without a grid', () => {
    const s = hydrated();
    expect(
      plannerReducer(s, {
        type: 'SET_CELL_EXPOSURE_OVERRIDE',
        row: 9,
        col: 0,
        value: 'shade',
      })
    ).toBe(s);
    expect(
      plannerReducer(initialPlannerState, {
        type: 'SET_CELL_EXPOSURE_OVERRIDE',
        row: 0,
        col: 0,
        value: 'shade',
      })
    ).toBe(initialPlannerState);
  });
});

// SMA-17 5.3-D R2 — undo: draft-content history (cells + placements), pushed
// by content-mutating actions only, capped, popped by UNDO.
describe('plannerReducer undo history (SMA-17 5.3-D R2)', () => {
  it('starts empty and is cleared by HYDRATE (new garden context)', () => {
    expect(initialPlannerState.past).toHaveLength(0);
    let s = plannerReducer(hydrated(), {
      type: 'ADD_PLACEMENT',
      id: 'new-1',
      plantId: 'p9',
      row: 0,
      col: 0,
    });
    expect(s.past).toHaveLength(1);
    s = plannerReducer(s, {
      type: 'HYDRATE_FROM_LAYOUT',
      width: 2,
      height: 2,
      cellSize: '50cm',
      cellsJson: null,
      placements: [],
    });
    expect(s.past).toHaveLength(0);
  });

  it('content-mutating actions push; view/save actions do not', () => {
    let s = plannerReducer(hydrated(), { type: 'SET_SHAPE_EDIT_MODE', enabled: true });
    expect(s.past).toHaveLength(0); // mode flip = view state
    s = plannerReducer(s, { type: 'PAINT_START', row: 0, col: 0 });
    expect(s.past).toHaveLength(1);
    s = plannerReducer(s, { type: 'PAINT_ENTER', row: 0, col: 1 });
    expect(s.past).toHaveLength(2);
    s = plannerReducer(s, { type: 'PAINT_END' });
    expect(s.past).toHaveLength(2); // drag end mutates nothing
    s = plannerReducer(s, { type: 'ZOOM_IN' });
    s = plannerReducer(s, { type: 'TOGGLE_EXPOSURE' });
    s = plannerReducer(s, { type: 'SET_EXPOSURE_MOMENT', moment: 'evening' });
    expect(s.past).toHaveLength(2); // view state never pushes
    // (2,2): active and unoccupied — R5's eligibility guard makes overrides
    // on painted-inactive cells or the placement cell legitimate no-ops.
    s = plannerReducer(s, {
      type: 'SET_CELL_EXPOSURE_OVERRIDE',
      row: 2,
      col: 2,
      value: 'shade',
    });
    expect(s.past).toHaveLength(3);
    s = plannerReducer(s, {
      type: 'RESIZED',
      width: 4,
      height: 3,
      cellSize: '50cm',
    });
    expect(s.past).toHaveLength(4);
    s = plannerReducer(s, {
      type: 'MARK_SAVED',
      submitted: {
        grid: s.grid,
        layoutWidth: s.layoutWidth,
        layoutHeight: s.layoutHeight,
        cellSize: s.cellSize,
        placements: s.placements,
      },
    });
    expect(s.past).toHaveLength(4); // save never pushes
  });

  it('UNDO pops: restores cells, placements, derived dimensions AND save-state', () => {
    const base = hydrated(); // 3x3, one placement at (1,1)
    let s = plannerReducer(base, {
      type: 'SET_CELL_EXPOSURE_OVERRIDE',
      row: 0,
      col: 0,
      value: 'full',
    });
    s = plannerReducer(s, {
      type: 'RESIZED',
      width: 5,
      height: 4,
      cellSize: '50cm',
    });
    expect(s.layoutWidth).toBe(5);
    // Undo the resize → back to 3x3 WITH the override still present; that
    // state was dirty (unsaved override), so it restores dirty.
    s = plannerReducer(s, { type: 'UNDO' });
    expect(s.layoutWidth).toBe(3);
    expect(s.layoutHeight).toBe(3);
    expect(s.grid![0][0].exposureOverride).toBe('full');
    expect(s.isDirty).toBe(true);
    // Undo the override → pristine hydrated content, placement intact — and
    // CLEAN again (R6: save-state restored with the content, never forced).
    s = plannerReducer(s, { type: 'UNDO' });
    expect(s.grid![0][0]).not.toHaveProperty('exposureOverride');
    expect(s.placements).toHaveLength(1);
    expect(s.isDirty).toBe(false);
    expect(s.past).toHaveLength(0);
    // Empty stack → guarded no-op (the button's disabled source).
    expect(plannerReducer(s, { type: 'UNDO' })).toBe(s);
  });

  it('UNDO restores placements dropped by a destructive edit', () => {
    const base = hydrated();
    let s = plannerReducer(base, { type: 'SET_ALL_CELLS', active: false });
    expect(s.placements).toHaveLength(0);
    s = plannerReducer(s, { type: 'UNDO' });
    expect(s.placements).toHaveLength(1);
    expect(s.grid![1][1].active).toBe(true);
  });

  it('caps the history at 50 snapshots (oldest falls off)', () => {
    let s = hydrated();
    for (let i = 0; i < 55; i++) {
      s = plannerReducer(s, {
        type: 'SET_CELL_EXPOSURE_OVERRIDE',
        row: 0,
        col: 0,
        value: i % 2 === 0 ? 'shade' : 'full',
      });
    }
    expect(s.past).toHaveLength(50);
  });

  it('SETUP_CONFIRMED pushes (undoable content change)', () => {
    let s = plannerReducer(hydrated(), {
      type: 'SETUP_CONFIRMED',
      cols: 4,
      rows: 4,
      cellSize: '25cm',
    });
    expect(s.past).toHaveLength(1);
    s = plannerReducer(s, { type: 'UNDO' });
    expect(s.layoutWidth).toBe(3); // back to the pre-setup content
  });

  it('RESTORE_LAST_SAVED clears the history (draft-lifecycle reset)', () => {
    // From a hydrated state (lastSaved exists), a content edit pushes, then
    // Cancel's wholesale restore must reset the history — the abandoned
    // draft's steps may not resurface through UNDO.
    let s = plannerReducer(hydrated(), {
      type: 'SET_CELL_EXPOSURE_OVERRIDE',
      row: 0,
      col: 0,
      value: 'shade',
    });
    expect(s.past).toHaveLength(1);
    s = plannerReducer(s, { type: 'RESTORE_LAST_SAVED' });
    expect(s.past).toHaveLength(0);
  });
});

// R3 (CR accepts): the first-setup undo dead-end and the PAINT_ENTER no-op.
describe('plannerReducer undo hardening (SMA-17 5.3-D R3)', () => {
  it('the very FIRST setup pushes nothing — undo cannot strand a null grid', () => {
    const s = plannerReducer(initialPlannerState, {
      type: 'SETUP_CONFIRMED',
      cols: 3,
      rows: 3,
      cellSize: '50cm',
    });
    expect(s.past).toHaveLength(0); // no pre-setup null-grid snapshot
    const after = plannerReducer(s, { type: 'UNDO' });
    expect(after).toBe(s); // empty stack → guarded no-op
    expect(after.grid).not.toBeNull();
  });

  it('PAINT_ENTER over an already-matching cell is a full no-op (no history entry)', () => {
    let s = plannerReducer(hydrated(), {
      type: 'SET_SHAPE_EDIT_MODE',
      enabled: true,
    });
    s = plannerReducer(s, { type: 'PAINT_START', row: 0, col: 0 });
    const before = s; // (0,0) is now inactive, paintAction=false, past=1
    const after = plannerReducer(before, {
      type: 'PAINT_ENTER',
      row: 0,
      col: 0,
    });
    expect(after).toBe(before); // same reference: no copy, no push, no dirty churn
    expect(after.past).toHaveLength(1);
  });
});

// R5 (CR accepts): override guards — idempotence + cell eligibility.
describe('plannerReducer override guards (SMA-17 5.3-D R5)', () => {
  it('re-applying the SAME override (or Auto on an already-auto cell) is a no-op', () => {
    const base = hydrated();
    // Auto on a cell that has no override: nothing to clear.
    expect(
      plannerReducer(base, {
        type: 'SET_CELL_EXPOSURE_OVERRIDE',
        row: 0,
        col: 0,
        value: null,
      })
    ).toBe(base);
    // Same category twice: the second dispatch changes nothing.
    const once = plannerReducer(base, {
      type: 'SET_CELL_EXPOSURE_OVERRIDE',
      row: 0,
      col: 0,
      value: 'shade',
    });
    const twice = plannerReducer(once, {
      type: 'SET_CELL_EXPOSURE_OVERRIDE',
      row: 0,
      col: 0,
      value: 'shade',
    });
    expect(twice).toBe(once); // no history entry, no dirty churn
    expect(twice.past).toHaveLength(1);
  });

  it('a non-null override is rejected on inactive or occupied cells; clearing always works', () => {
    // Inactive cell carrying a stale override (hydrated from persisted JSON).
    const s = plannerReducer(initialPlannerState, {
      type: 'HYDRATE_FROM_LAYOUT',
      width: 2,
      height: 2,
      cellSize: '50cm',
      cellsJson: JSON.stringify([
        { row: 0, col: 1, active: false, exposureOverride: 'shade' },
      ]),
      placements: [placement('srv-1', { startRow: 1, startCol: 1 })],
    });
    // Non-null on the INACTIVE cell → no-op.
    expect(
      plannerReducer(s, {
        type: 'SET_CELL_EXPOSURE_OVERRIDE',
        row: 0,
        col: 1,
        value: 'full',
      })
    ).toBe(s);
    // Non-null on the OCCUPIED cell (placement at 1,1) → no-op.
    expect(
      plannerReducer(s, {
        type: 'SET_CELL_EXPOSURE_OVERRIDE',
        row: 1,
        col: 1,
        value: 'full',
      })
    ).toBe(s);
    // Clearing (null) still works — even on the inactive cell.
    const cleared = plannerReducer(s, {
      type: 'SET_CELL_EXPOSURE_OVERRIDE',
      row: 0,
      col: 1,
      value: null,
    });
    expect(cleared.grid![0][1]).not.toHaveProperty('exposureOverride');
    expect(cleared.isDirty).toBe(true);
  });
});

// R6 (CR accept, ROOT fix): undo snapshots carry the save context — undoing
// restores lastSaved + isDirty with the content, so undo can neither
// fabricate dirtiness nor strand a saved garden.
describe('plannerReducer undo save-state (SMA-17 5.3-D R6)', () => {
  /** MARK_SAVED on the CURRENT revision (what a successful save does). */
  const save = (s: PlannerState): PlannerState =>
    plannerReducer(s, {
      type: 'MARK_SAVED',
      submitted: {
        grid: s.grid,
        layoutWidth: s.layoutWidth,
        layoutHeight: s.layoutHeight,
        cellSize: s.cellSize,
        placements: s.placements,
      },
    });

  it('save → one edit → UNDO restores a CLEAN state (no fabricated dirtiness)', () => {
    let s = plannerReducer(hydrated(), {
      type: 'SET_CELL_EXPOSURE_OVERRIDE',
      row: 0,
      col: 0,
      value: 'shade',
    });
    s = save(s);
    expect(s.isDirty).toBe(false);
    const savedRevision = s.lastSaved;
    s = plannerReducer(s, {
      type: 'SET_CELL_EXPOSURE_OVERRIDE',
      row: 0,
      col: 2,
      value: 'full',
    });
    expect(s.isDirty).toBe(true);
    s = plannerReducer(s, { type: 'UNDO' });
    expect(s.isDirty).toBe(false); // the pre-edit state WAS the saved one
    expect(s.grid![0][2]).not.toHaveProperty('exposureOverride');
    expect(s.grid![0][0].exposureOverride).toBe('shade');
    expect(s.lastSaved).toBe(savedRevision); // saved revision untouched
  });

  it('save → edit A → edit B → UNDO returns to post-A, still dirty', () => {
    let s = plannerReducer(hydrated(), {
      type: 'SET_CELL_EXPOSURE_OVERRIDE',
      row: 0,
      col: 0,
      value: 'shade',
    }); // edit A (hydrated = the save baseline)
    s = plannerReducer(s, {
      type: 'SET_CELL_EXPOSURE_OVERRIDE',
      row: 0,
      col: 2,
      value: 'full',
    }); // edit B
    s = plannerReducer(s, { type: 'UNDO' });
    expect(s.grid![0][0].exposureOverride).toBe('shade'); // back to post-A
    expect(s.grid![0][2]).not.toHaveProperty('exposureOverride');
    expect(s.isDirty).toBe(true); // A is still unsaved
    expect(s.lastSaved).not.toBeNull();
  });

  it('undoing across SETUP_CONFIRMED restores the prior lastSaved — Cancel keeps the saved garden', () => {
    // Reducer-level pin for the hydrated re-setup path: in the UI, setup only
    // opens on a garden with NO saved layout (hydration no-layout branch or
    // Cancel's no-snapshot discard), so a saved garden cannot reach
    // SETUP_CONFIRMED today — the generic snapshot mechanism still covers it
    // with no dead handling (Extension 033e3378).
    let s = plannerReducer(hydrated(), {
      type: 'SETUP_CONFIRMED',
      cols: 4,
      rows: 4,
      cellSize: '25cm',
    });
    expect(s.lastSaved).toBeNull(); // fresh-layout invariant kept (F5/F8)
    s = plannerReducer(s, { type: 'UNDO' });
    expect(s.lastSaved).not.toBeNull(); // restored WITH the content
    expect(s.isDirty).toBe(false); // the hydrated state was clean
    const cancelled = plannerReducer(s, { type: 'RESTORE_LAST_SAVED' });
    expect(cancelled.placements).toHaveLength(1); // the saved garden survives
    expect(cancelled.isDirty).toBe(false);
  });
});
