import { describe, expect, it } from 'vitest';
import {
  parseCellsJson,
  serializeCellsJson,
} from '../../types/GardenLayout';
import { isSoilType, SOIL_ERASER } from '../../utils/soil';
import {
  initialPlannerState,
  NOTES_MAX_LENGTH,
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
      spanRows: 1,
      spanCols: 1,
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
      spanRows: 1,
      spanCols: 1,
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
      spanRows: 1,
      spanCols: 1,
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
      spanRows: 1,
      spanCols: 1,
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

  it('REPLACE_PLACEMENT swaps the plant, keeping id and anchor (same-size)', () => {
    const s = plannerReducer(hydrated(), {
      type: 'REPLACE_PLACEMENT',
      placementId: 'srv-1',
      plantId: 'tomato',
      spanRows: 1,
      spanCols: 1,
    });
    expect(s.placements[0].plantId).toBe('tomato');
    expect(s.placements[0].id).toBe('srv-1');
    expect(s.placements[0].startRow).toBe(1);
    expect(s.isDirty).toBe(true);
  });

  it('REPLACE_PLACEMENT expands the footprint when the new spans fit (R2)', () => {
    // srv-1 sits 1×1 at (1,1) in a 3×3 all-active grid: 2×2 at the same
    // anchor fits (rows 1-2 × cols 1-2) — the spans are REPLACED.
    const s = plannerReducer(hydrated(), {
      type: 'REPLACE_PLACEMENT',
      placementId: 'srv-1',
      plantId: 'courgette',
      spanRows: 2,
      spanCols: 2,
    });
    expect(s.placements[0]).toMatchObject({
      id: 'srv-1',
      plantId: 'courgette',
      startRow: 1,
      startCol: 1,
      spanRows: 2,
      spanCols: 2,
    });
    expect(s.isDirty).toBe(true);
  });

  it('REPLACE_PLACEMENT shrinks the footprint back (2×2 → 1×1)', () => {
    let s = plannerReducer(hydrated(), {
      type: 'REPLACE_PLACEMENT',
      placementId: 'srv-1',
      plantId: 'courgette',
      spanRows: 2,
      spanCols: 2,
    });
    s = plannerReducer(s, {
      type: 'REPLACE_PLACEMENT',
      placementId: 'srv-1',
      plantId: 'basil',
      spanRows: 1,
      spanCols: 1,
    });
    expect(s.placements[0]).toMatchObject({
      plantId: 'basil',
      spanRows: 1,
      spanCols: 1,
    });
  });

  it('REPLACE_PLACEMENT refuses spans that no longer fit (guarded no-op)', () => {
    // A second placement at (2,2) sits inside the would-be 2×2 expansion of
    // srv-1 (rows 1-2 × cols 1-2) → overlap. The refusal must leave state
    // UNCHANGED (same silent-no-op contract as ADD).
    const base = plannerReducer(hydrated(), {
      type: 'ADD_PLACEMENT',
      id: 'new-1',
      plantId: 'p9',
      row: 2,
      col: 2,
      spanRows: 1,
      spanCols: 1,
    });
    const blocked = plannerReducer(base, {
      type: 'REPLACE_PLACEMENT',
      placementId: 'srv-1',
      plantId: 'courgette',
      spanRows: 2,
      spanCols: 2,
    });
    expect(blocked).toBe(base);
    expect(blocked.placements[0].spanRows).toBe(1);
  });

  it('REPLACE_PLACEMENT ignores the target itself in the overlap scan', () => {
    // Same-size replace of a 2×2 must not collide with its own footprint.
    let s = plannerReducer(hydrated(), {
      type: 'REPLACE_PLACEMENT',
      placementId: 'srv-1',
      plantId: 'courgette',
      spanRows: 2,
      spanCols: 2,
    });
    s = plannerReducer(s, {
      type: 'REPLACE_PLACEMENT',
      placementId: 'srv-1',
      plantId: 'tomato',
      spanRows: 2,
      spanCols: 2,
    });
    expect(s.placements[0].plantId).toBe('tomato');
    expect(s.placements[0].spanRows).toBe(2);
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
      spanRows: 1,
      spanCols: 1,
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

    // Active-polarity drag over the same cell drops nothing. Arrangement
    // adapted for the 5.5 ADD_PLACEMENT guard (no placement can be CREATED on
    // an inactive grid anymore): deactivate an EMPTY cell first, then sweep an
    // active-polarity drag from it across the hydrated placement's cell.
    let a = plannerReducer(hydrated(), {
      type: 'SET_SHAPE_EDIT_MODE',
      enabled: true,
    });
    a = plannerReducer(a, { type: 'PAINT_START', row: 0, col: 0 }); // empty cell -> inactive
    a = plannerReducer(a, { type: 'PAINT_END' });
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
      spanRows: 1,
      spanCols: 1,
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

  it('a non-null override is rejected on an INACTIVE cell; clearing always works', () => {
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
    // Non-null on the INACTIVE cell → no-op (nothing to expose).
    expect(
      plannerReducer(s, {
        type: 'SET_CELL_EXPOSURE_OVERRIDE',
        row: 0,
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

  it('SMA-309: an override on an OCCUPIED cell now APPLIES (the panel path)', () => {
    // R5 mirrored the cell-click opening rule at the reducer boundary, which
    // made the detail panel's control — offered for the SELECTED placement's
    // anchor, occupied by definition — a silent no-op. SMA-309 lifts that half.
    const s = plannerReducer(initialPlannerState, {
      type: 'HYDRATE_FROM_LAYOUT',
      width: 2,
      height: 2,
      cellSize: '50cm',
      cellsJson: null,
      placements: [placement('srv-1', { startRow: 1, startCol: 1 })],
    });
    const after = plannerReducer(s, {
      type: 'SET_CELL_EXPOSURE_OVERRIDE',
      row: 1,
      col: 1,
      value: 'full',
    });
    expect(after.grid![1][1].exposureOverride).toBe('full');
    expect(after.isDirty).toBe(true);
    expect(after.past).toHaveLength(1);
    // The placement itself is untouched.
    expect(after.placements).toHaveLength(1);
  });
});

// ── SMA-309: notes stop being dead data ─────────────────────────────────────
describe('plannerReducer SET_PLACEMENT_NOTES (SMA-309)', () => {
  it('writes the note, pushes history and marks dirty', () => {
    const s = hydrated();
    const after = plannerReducer(s, {
      type: 'SET_PLACEMENT_NOTES',
      placementId: 'srv-1',
      notes: 'Staked in June',
    });
    expect(after.placements[0].notes).toBe('Staked in June');
    expect(after.isDirty).toBe(true);
    expect(after.past).toHaveLength(1);
  });

  it('setting the SAME value is an idempotent no-op returning the same object', () => {
    const once = plannerReducer(hydrated(), {
      type: 'SET_PLACEMENT_NOTES',
      placementId: 'srv-1',
      notes: 'Staked in June',
    });
    const twice = plannerReducer(once, {
      type: 'SET_PLACEMENT_NOTES',
      placementId: 'srv-1',
      notes: 'Staked in June',
    });
    expect(twice).toBe(once);
    expect(twice.past).toHaveLength(1);
  });

  it('empty text normalises to null — and is then idempotent against null', () => {
    const s = hydrated();
    expect(s.placements[0].notes).toBeNull();
    // "" on an already-null note changes nothing (one state for the absence).
    expect(
      plannerReducer(s, {
        type: 'SET_PLACEMENT_NOTES',
        placementId: 'srv-1',
        notes: '',
      })
    ).toBe(s);
    const written = plannerReducer(s, {
      type: 'SET_PLACEMENT_NOTES',
      placementId: 'srv-1',
      notes: 'temp',
    });
    const emptied = plannerReducer(written, {
      type: 'SET_PLACEMENT_NOTES',
      placementId: 'srv-1',
      notes: '',
    });
    expect(emptied.placements[0].notes).toBeNull();
  });

  it('an unknown placement id is a guarded no-op', () => {
    const s = hydrated();
    expect(
      plannerReducer(s, {
        type: 'SET_PLACEMENT_NOTES',
        placementId: 'nope',
        notes: 'x',
      })
    ).toBe(s);
  });

  it('the note survives an unrelated move of the same placement', () => {
    let s = plannerReducer(hydrated(), {
      type: 'SET_PLACEMENT_NOTES',
      placementId: 'srv-1',
      notes: 'Keep me',
    });
    s = plannerReducer(s, {
      type: 'MOVE_PLACEMENT',
      placementId: 'srv-1',
      startRow: 2,
      startCol: 2,
    });
    expect(s.placements[0].startRow).toBe(2);
    expect(s.placements[0].notes).toBe('Keep me');
  });

  it('UNDO restores the previous note', () => {
    const base = hydrated();
    const s = plannerReducer(base, {
      type: 'SET_PLACEMENT_NOTES',
      placementId: 'srv-1',
      notes: 'Typed then undone',
    });
    const undone = plannerReducer(s, { type: 'UNDO' });
    expect(undone.placements[0].notes).toBeNull();
  });

  // R3 (Extension c36be778 ⊃ GitHub e82c4da2): the reducer boundary owns the
  // wire/DB contract — trim, whitespace-only → null, clamp to the exported
  // NOTES_MAX_LENGTH the panel's input reads.
  it('whitespace-only text normalises to the same null the empty string maps to', () => {
    const s = hydrated();
    expect(
      plannerReducer(s, {
        type: 'SET_PLACEMENT_NOTES',
        placementId: 'srv-1',
        notes: '   \n\t ',
      })
    ).toBe(s);
    const written = plannerReducer(s, {
      type: 'SET_PLACEMENT_NOTES',
      placementId: 'srv-1',
      notes: 'temp',
    });
    const blanked = plannerReducer(written, {
      type: 'SET_PLACEMENT_NOTES',
      placementId: 'srv-1',
      notes: '   ',
    });
    expect(blanked.placements[0].notes).toBeNull();
  });

  it('an over-long note is clamped to NOTES_MAX_LENGTH at the boundary', () => {
    const after = plannerReducer(hydrated(), {
      type: 'SET_PLACEMENT_NOTES',
      placementId: 'srv-1',
      notes: 'x'.repeat(NOTES_MAX_LENGTH + 100),
    });
    expect(after.placements[0].notes).toHaveLength(NOTES_MAX_LENGTH);
  });

  it('a value equal AFTER normalisation is still the idempotent same object', () => {
    const once = plannerReducer(hydrated(), {
      type: 'SET_PLACEMENT_NOTES',
      placementId: 'srv-1',
      notes: 'Staked in June',
    });
    const padded = plannerReducer(once, {
      type: 'SET_PLACEMENT_NOTES',
      placementId: 'srv-1',
      notes: '  Staked in June  ',
    });
    expect(padded).toBe(once);
    expect(padded.past).toHaveLength(1);
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

// SMA-15 (5.4) — infrastructure paint: the third mutually exclusive mode,
// riding the same PAINT_* drag pattern (toggle polarity, reducer guards,
// undoable via the SAME DraftSnapshot — grid copies carry `infrastructure`).
describe('plannerReducer infrastructure paint (SMA-15 5.4)', () => {
  /** Hydrated state with the wall type armed (enters infra mode). */
  const armed = (type: 'wall' | 'path' = 'wall'): PlannerState =>
    plannerReducer(hydrated(), { type: 'SET_INFRA_TYPE', infraType: type });

  it('SET_INFRA_TYPE arms the type, enters the mode and leaves shape-edit', () => {
    let s = plannerReducer(hydrated(), {
      type: 'SET_SHAPE_EDIT_MODE',
      enabled: true,
    });
    s = plannerReducer(s, { type: 'SET_INFRA_TYPE', infraType: 'trellis' });
    expect(s.infraType).toBe('trellis');
    expect(s.infraMode).toBe(true);
    expect(s.shapeEditMode).toBe(false);
    // Disarming (null) falls back to selection mode.
    s = plannerReducer(s, { type: 'SET_INFRA_TYPE', infraType: null });
    expect(s.infraType).toBeNull();
    expect(s.infraMode).toBe(false);
  });

  it('SET_INFRA_MODE cannot enter without an armed type (guarded no-op)', () => {
    const s = hydrated();
    expect(plannerReducer(s, { type: 'SET_INFRA_MODE', enabled: true })).toBe(s);
  });

  it('SET_INFRA_MODE off keeps the type armed for re-entry', () => {
    let s = armed();
    s = plannerReducer(s, { type: 'SET_INFRA_MODE', enabled: false });
    expect(s.infraMode).toBe(false);
    expect(s.infraType).toBe('wall');
    s = plannerReducer(s, { type: 'SET_INFRA_MODE', enabled: true });
    expect(s.infraMode).toBe(true);
  });

  it('SET_SHAPE_EDIT_MODE on leaves infrastructure mode (mutual exclusion)', () => {
    let s = armed();
    s = plannerReducer(s, { type: 'SET_SHAPE_EDIT_MODE', enabled: true });
    expect(s.shapeEditMode).toBe(true);
    expect(s.infraMode).toBe(false);
    expect(s.infraType).toBe('wall'); // remembered, not painted with
  });

  it('HYDRATE_FROM_LAYOUT opens the next garden in SELECTION mode (R5, CR accept)', () => {
    // Paint in garden A with an armed type, then hydrate garden B: B must
    // not open as a paint surface with A's type still driving the cells.
    let s = plannerReducer(armed(), { type: 'PAINT_START', row: 0, col: 0 });
    s = plannerReducer(s, { type: 'PAINT_END' });
    expect(s.infraMode).toBe(true);
    s = plannerReducer(s, {
      type: 'HYDRATE_FROM_LAYOUT',
      width: 2,
      height: 2,
      cellSize: '1m',
      cellsJson: null,
      placements: [],
    });
    expect(s.infraMode).toBe(false);
    expect(s.infraType).toBe('wall'); // remembered for re-entry, mode off
  });

  it('HYDRATE_FROM_LAYOUT leaves shape-edit mode too (SMA-303)', () => {
    // Shape-edit in garden A, then hydrate garden B: the new garden must
    // arrive in SELECTION mode, not in A's shape-edit session.
    let s = plannerReducer(armed(), {
      type: 'SET_SHAPE_EDIT_MODE',
      enabled: true,
    });
    expect(s.shapeEditMode).toBe(true);
    s = plannerReducer(s, {
      type: 'HYDRATE_FROM_LAYOUT',
      width: 2,
      height: 2,
      cellSize: '1m',
      cellsJson: null,
      placements: [],
    });
    expect(s.shapeEditMode).toBe(false);
    expect(s.infraType).toBe('wall'); // remembered, like every mode exit
  });

  it('SETUP_CONFIRMED starts the fresh grid in SELECTION mode (infra mode reset too)', () => {
    // Arm on a draft, discard it, re-setup: the new grid must not open as a
    // paint surface with the stale type still armed (workflow finding).
    let s = plannerReducer(armed(), { type: 'DISCARD_DRAFT' });
    s = plannerReducer(s, {
      type: 'SETUP_CONFIRMED',
      cols: 3,
      rows: 3,
      cellSize: '50cm',
    });
    expect(s.infraMode).toBe(false);
    expect(s.shapeEditMode).toBe(false);
    expect(s.infraType).toBe('wall'); // remembered for re-entry, mode off
  });

  it('PAINT_START paints the armed type, pushes history and dirties', () => {
    const before = armed();
    const s = plannerReducer(before, { type: 'PAINT_START', row: 0, col: 0 });
    expect(s.grid![0][0].infrastructure).toBe('wall');
    expect(s.isPainting).toBe(true);
    expect(s.infraPaintValue).toBe('wall');
    expect(s.isDirty).toBe(true);
    expect(s.past).toHaveLength(before.past.length + 1);
    // The cell's active flag is untouched (this is NOT shape-edit).
    expect(s.grid![0][0].active).toBe(true);
  });

  it('PAINT_START on a same-type cell locks a CLEARING drag (toggle polarity)', () => {
    let s = plannerReducer(armed(), { type: 'PAINT_START', row: 0, col: 0 });
    s = plannerReducer(s, { type: 'PAINT_END' });
    s = plannerReducer(s, { type: 'PAINT_START', row: 0, col: 0 });
    expect(s.grid![0][0]).not.toHaveProperty('infrastructure'); // sparse clear
    expect(s.infraPaintValue).toBeNull();
    expect(s.isPainting).toBe(true);
  });

  it('PAINT_ENTER extends the drag; a matching cell is a guarded no-op (no push, no dirty)', () => {
    let s = plannerReducer(armed(), { type: 'PAINT_START', row: 0, col: 0 });
    const afterStart = s;
    s = plannerReducer(s, { type: 'PAINT_ENTER', row: 0, col: 1 });
    expect(s.grid![0][1].infrastructure).toBe('wall');
    // Re-entering an already-painted cell changes NOTHING.
    expect(plannerReducer(s, { type: 'PAINT_ENTER', row: 0, col: 1 })).toBe(s);
    expect(s.past).toHaveLength(afterStart.past.length + 1);
  });

  it('painting over a DIFFERENT type replaces it', () => {
    let s = plannerReducer(armed(), { type: 'PAINT_START', row: 0, col: 0 });
    s = plannerReducer(s, { type: 'PAINT_END' });
    s = plannerReducer(s, { type: 'SET_INFRA_TYPE', infraType: 'path' });
    s = plannerReducer(s, { type: 'PAINT_START', row: 0, col: 0 });
    expect(s.grid![0][0].infrastructure).toBe('path');
  });

  it('an INACTIVE cell is not paintable (guarded — nothing pushed)', () => {
    // Deactivate (0,2) via shape-edit first, then arm and try to paint it.
    let s = plannerReducer(hydrated(), {
      type: 'SET_SHAPE_EDIT_MODE',
      enabled: true,
    });
    s = plannerReducer(s, { type: 'PAINT_START', row: 0, col: 2 });
    s = plannerReducer(s, { type: 'PAINT_END' });
    s = plannerReducer(s, { type: 'SET_INFRA_TYPE', infraType: 'wall' });
    const before = s;
    expect(plannerReducer(s, { type: 'PAINT_START', row: 0, col: 2 })).toBe(
      before
    );
  });

  it('painting under a PLACEMENT is allowed (a plant over a trellis)', () => {
    // hydrated() has a placement at (1,1).
    const s = plannerReducer(armed(), { type: 'PAINT_START', row: 1, col: 1 });
    expect(s.grid![1][1].infrastructure).toBe('wall');
    expect(s.placements).toHaveLength(1); // never evicted by infra paint
  });

  it('PAINT_END disarms the drag and its polarity', () => {
    let s = plannerReducer(armed(), { type: 'PAINT_START', row: 0, col: 0 });
    s = plannerReducer(s, { type: 'PAINT_END' });
    expect(s.isPainting).toBe(false);
    expect(s.infraPaintValue).toBeNull();
  });

  it('UNDO restores the pre-paint infrastructure AND the save context', () => {
    let s = plannerReducer(armed(), { type: 'PAINT_START', row: 0, col: 0 });
    s = plannerReducer(s, { type: 'PAINT_END' });
    s = plannerReducer(s, { type: 'UNDO' });
    expect(s.grid![0][0]).not.toHaveProperty('infrastructure');
    // hydrated() was clean — undoing the only edit lands clean (R6 contract
    // carried over to infra paint with zero snapshot changes).
    expect(s.isDirty).toBe(false);
    expect(s.lastSaved).not.toBeNull();
  });

  it('mid-save infra edits keep the dirty flag (MARK_SAVED referential check)', () => {
    const base = armed();
    const submitted = {
      grid: base.grid,
      layoutWidth: base.layoutWidth,
      layoutHeight: base.layoutHeight,
      cellSize: base.cellSize,
      placements: base.placements,
    };
    // An infra paint lands while the save request is in flight…
    const edited = plannerReducer(base, { type: 'PAINT_START', row: 0, col: 0 });
    // …so the submitted revision is no longer current: still dirty.
    const saved = plannerReducer(edited, { type: 'MARK_SAVED', submitted });
    expect(saved.isDirty).toBe(true);
  });

  it('selection mode ignores PAINT_* (no mode armed — nothing happens)', () => {
    const s = hydrated();
    expect(plannerReducer(s, { type: 'PAINT_START', row: 0, col: 0 })).toBe(s);
  });
});

// SMA-193 (5.5 lot 1) — Place mode: exact infra-grammar mirror (armed plant
// remembered on every exit), plus the footprint guard on ADD_PLACEMENT.
describe('plannerReducer Place mode (SMA-193 5.5)', () => {
  /** Hydrated state with a plant armed (enters Place mode). */
  const placing = (): PlannerState =>
    plannerReducer(hydrated(), { type: 'SET_PLACE_PLANT', plantId: 'basil' });

  it('SET_PLACE_PLANT arms the plant, enters the mode and leaves the others', () => {
    // Arrange BOTH other modes as genuinely-true starting states (review
    // pin): infra armed first, then shape-edit on top of it — arming the
    // plant must flip each of them off in one dispatch.
    let s = plannerReducer(hydrated(), {
      type: 'SET_INFRA_TYPE',
      infraType: 'wall',
    });
    s = plannerReducer(s, { type: 'SET_SHAPE_EDIT_MODE', enabled: true });
    expect(s.shapeEditMode).toBe(true);
    s = plannerReducer(s, { type: 'SET_PLACE_PLANT', plantId: 'basil' });
    expect(s.placePlantId).toBe('basil');
    expect(s.placeMode).toBe(true);
    expect(s.infraMode).toBe(false);
    expect(s.shapeEditMode).toBe(false);
    expect(s.infraType).toBe('wall'); // remembered, like every mode exit
  });

  it('SET_PLACE_PLANT(null) exits to selection and clears the plant', () => {
    const s = plannerReducer(placing(), {
      type: 'SET_PLACE_PLANT',
      plantId: null,
    });
    expect(s.placeMode).toBe(false);
    expect(s.placePlantId).toBeNull();
  });

  it('disarming the plant from ANOTHER mode exits only place (mode preserved)', () => {
    // The null-disarm can fire while another mode is active (armed values
    // are remembered): it must not eject the user from that mode (5.5
    // review — the Escape/Cancel equivalence root cause).
    let s = plannerReducer(placing(), {
      type: 'SET_SHAPE_EDIT_MODE',
      enabled: true,
    });
    s = plannerReducer(s, { type: 'SET_PLACE_PLANT', plantId: null });
    expect(s.shapeEditMode).toBe(true); // preserved
    expect(s.placePlantId).toBeNull();
    expect(s.placeMode).toBe(false);
  });

  it('ENTER_SELECTION_MODE exits every mode, remembers armed values, disarms painting (R3)', () => {
    // From shape-edit with an in-flight paint drag…
    let s = plannerReducer(hydrated(), {
      type: 'SET_SHAPE_EDIT_MODE',
      enabled: true,
    });
    s = plannerReducer(s, { type: 'PAINT_START', row: 0, col: 0 });
    expect(s.isPainting).toBe(true);
    s = plannerReducer(s, { type: 'ENTER_SELECTION_MODE' });
    expect(s.shapeEditMode).toBe(false);
    expect(s.isPainting).toBe(false);
    expect(s.paintAction).toBeNull();

    // …from infrastructure mode with an in-flight INFRA paint drag (the F6
    // triple's third key, infraPaintValue, must disarm too — verify pin)…
    s = plannerReducer(s, { type: 'SET_INFRA_TYPE', infraType: 'wall' });
    s = plannerReducer(s, { type: 'PAINT_START', row: 2, col: 2 });
    expect(s.infraPaintValue).toBe('wall');
    s = plannerReducer(s, { type: 'ENTER_SELECTION_MODE' });
    expect(s.infraMode).toBe(false);
    expect(s.infraType).toBe('wall'); // remembered
    expect(s.infraPaintValue).toBeNull(); // disarmed with the drag

    // …and from place mode (plant remembered) — the Escape grammar.
    s = plannerReducer(s, { type: 'SET_PLACE_PLANT', plantId: 'basil' });
    s = plannerReducer(s, { type: 'ENTER_SELECTION_MODE' });
    expect(s.placeMode).toBe(false);
    expect(s.placePlantId).toBe('basil'); // remembered — NOT a disarm
    expect(s.infraType).toBe('wall'); // both armed values survive the gate
  });

  it('disarming the remembered infra type from place mode preserves place mode', () => {
    // Same own-mode-exit rule on the infra side (base behavior restored).
    let s = plannerReducer(placing(), {
      type: 'SET_INFRA_TYPE',
      infraType: 'wall',
    });
    s = plannerReducer(s, { type: 'SET_PLACE_MODE', enabled: false });
    s = plannerReducer(s, { type: 'SET_PLACE_MODE', enabled: true });
    expect(s.placeMode).toBe(true);
    s = plannerReducer(s, { type: 'SET_INFRA_TYPE', infraType: null });
    expect(s.placeMode).toBe(true); // preserved
    expect(s.infraType).toBeNull();
    expect(s.infraMode).toBe(false);
  });

  it('SET_PLACE_MODE enters WITHOUT an armed plant — move-only mode (product ruling 22 Jul)', () => {
    // Lot 3 R2: the lot-1 guard is gone — the armless entry is legitimate
    // (moving needs no armed plant). Other modes still exit through the gate.
    let s = plannerReducer(hydrated(), {
      type: 'SET_SHAPE_EDIT_MODE',
      enabled: true,
    });
    s = plannerReducer(s, { type: 'SET_PLACE_MODE', enabled: true });
    expect(s.placeMode).toBe(true);
    expect(s.placePlantId).toBeNull(); // armless — nothing got armed
    expect(s.shapeEditMode).toBe(false);
    expect(s.infraMode).toBe(false);
  });

  it('SET_PLACE_MODE off keeps the plant armed for a later re-entry', () => {
    let s = plannerReducer(placing(), { type: 'SET_PLACE_MODE', enabled: false });
    expect(s.placeMode).toBe(false);
    expect(s.placePlantId).toBe('basil');
    s = plannerReducer(s, { type: 'SET_PLACE_MODE', enabled: true });
    expect(s.placeMode).toBe(true);
  });

  it('arming an infra type leaves Place mode (mutual exclusion), plant remembered', () => {
    const s = plannerReducer(placing(), {
      type: 'SET_INFRA_TYPE',
      infraType: 'trellis',
    });
    expect(s.placeMode).toBe(false);
    expect(s.infraMode).toBe(true);
    expect(s.placePlantId).toBe('basil'); // remembered
  });

  it('SET_SHAPE_EDIT_MODE on leaves Place mode too', () => {
    const s = plannerReducer(placing(), {
      type: 'SET_SHAPE_EDIT_MODE',
      enabled: true,
    });
    expect(s.placeMode).toBe(false);
    expect(s.shapeEditMode).toBe(true);
    expect(s.placePlantId).toBe('basil');
  });

  it('HYDRATE_FROM_LAYOUT opens the next garden in SELECTION mode (Place variant)', () => {
    const s = plannerReducer(placing(), {
      type: 'HYDRATE_FROM_LAYOUT',
      width: 2,
      height: 2,
      cellSize: '1m',
      cellsJson: null,
      placements: [],
    });
    expect(s.placeMode).toBe(false);
    expect(s.placePlantId).toBe('basil'); // remembered, like every mode exit
  });

  it('ADD_PLACEMENT stores the provided footprint verbatim', () => {
    const s = plannerReducer(hydrated(), {
      type: 'ADD_PLACEMENT',
      id: 'new-1',
      plantId: 'basil',
      row: 2,
      col: 0,
      spanRows: 1,
      spanCols: 2,
    });
    expect(s.placements).toHaveLength(2);
    expect(s.placements[1]).toMatchObject({
      startRow: 2,
      startCol: 0,
      spanRows: 1,
      spanCols: 2,
    });
    expect(s.isDirty).toBe(true);
  });

  it('ADD_PLACEMENT with an out-of-bounds footprint is a guarded no-op', () => {
    const s = hydrated();
    expect(
      plannerReducer(s, {
        type: 'ADD_PLACEMENT',
        id: 'new-1',
        plantId: 'basil',
        row: 2,
        col: 2,
        spanRows: 2,
        spanCols: 2,
      })
    ).toBe(s);
  });

  it('ADD_PLACEMENT covering an inactive cell is a guarded no-op', () => {
    let s = plannerReducer(hydrated(), {
      type: 'SET_SHAPE_EDIT_MODE',
      enabled: true,
    });
    s = plannerReducer(s, { type: 'PAINT_START', row: 0, col: 0 }); // (0,0) inactive
    s = plannerReducer(s, { type: 'PAINT_END' });
    s = plannerReducer(s, { type: 'SET_SHAPE_EDIT_MODE', enabled: false });
    const blocked = plannerReducer(s, {
      type: 'ADD_PLACEMENT',
      id: 'new-1',
      plantId: 'basil',
      row: 0,
      col: 0,
      spanRows: 1,
      spanCols: 1,
    });
    expect(blocked).toBe(s);
  });

  it('ADD_PLACEMENT overlapping an existing placement is a guarded no-op', () => {
    const s = hydrated(); // srv-1 sits at (1,1)
    expect(
      plannerReducer(s, {
        type: 'ADD_PLACEMENT',
        id: 'new-1',
        plantId: 'basil',
        row: 0,
        col: 0,
        spanRows: 2,
        spanCols: 2,
      })
    ).toBe(s);
  });
});

// Lot 2 (DnD) — MOVE_PLACEMENT: anchor moves, footprint stays, the guard
// excludes the moved placement itself so its old cells are legal ground.
describe('plannerReducer MOVE_PLACEMENT (SMA-193 lot 2)', () => {
  it('moves the anchor and keeps the spans', () => {
    let s = plannerReducer(hydrated(), {
      type: 'REPLACE_PLACEMENT',
      placementId: 'srv-1',
      plantId: 'courgette',
      spanRows: 2,
      spanCols: 2,
    });
    s = plannerReducer(s, {
      type: 'MOVE_PLACEMENT',
      placementId: 'srv-1',
      startRow: 0,
      startCol: 0,
    });
    expect(s.placements[0]).toMatchObject({
      id: 'srv-1',
      startRow: 0,
      startCol: 0,
      spanRows: 2,
      spanCols: 2,
    });
    expect(s.isDirty).toBe(true);
  });

  it('a drop on its own anchor is idempotent — same state, no undo entry, isDirty untouched', () => {
    const s = hydrated(); // srv-1 anchored at (1,1), clean state
    const dropped = plannerReducer(s, {
      type: 'MOVE_PLACEMENT',
      placementId: 'srv-1',
      startRow: 1,
      startCol: 1,
    });
    expect(dropped).toBe(s);
    expect(dropped.past).toBe(s.past);
    expect(dropped.isDirty).toBe(false);
  });

  it('a move onto its own old cells succeeds (self-overlap via ignoreId)', () => {
    let s = plannerReducer(hydrated(), {
      type: 'REPLACE_PLACEMENT',
      placementId: 'srv-1',
      plantId: 'courgette',
      spanRows: 2,
      spanCols: 2,
    });
    // (1,1)→(0,0): the 2×2 candidate still covers (1,1) — its own cell.
    s = plannerReducer(s, {
      type: 'MOVE_PLACEMENT',
      placementId: 'srv-1',
      startRow: 0,
      startCol: 0,
    });
    expect(s.placements[0].startRow).toBe(0);
  });

  it('refusal on overlap returns the SAME state object', () => {
    const base = plannerReducer(hydrated(), {
      type: 'ADD_PLACEMENT',
      id: 'new-1',
      plantId: 'p9',
      row: 0,
      col: 0,
      spanRows: 1,
      spanCols: 1,
    });
    const blocked = plannerReducer(base, {
      type: 'MOVE_PLACEMENT',
      placementId: 'new-1',
      startRow: 1,
      startCol: 1, // srv-1 sits there
    });
    expect(blocked).toBe(base);
  });

  it('refusal out-of-bounds and onto an inactive cell return the SAME state object', () => {
    const s = hydrated();
    expect(
      plannerReducer(s, {
        type: 'MOVE_PLACEMENT',
        placementId: 'srv-1',
        startRow: 3,
        startCol: 0, // 3×3 grid — row 3 is out of bounds
      })
    ).toBe(s);

    let inactive = plannerReducer(s, {
      type: 'SET_SHAPE_EDIT_MODE',
      enabled: true,
    });
    inactive = plannerReducer(inactive, { type: 'PAINT_START', row: 0, col: 0 });
    inactive = plannerReducer(inactive, { type: 'PAINT_END' });
    inactive = plannerReducer(inactive, {
      type: 'SET_SHAPE_EDIT_MODE',
      enabled: false,
    });
    expect(
      plannerReducer(inactive, {
        type: 'MOVE_PLACEMENT',
        placementId: 'srv-1',
        startRow: 0,
        startCol: 0, // (0,0) painted inactive above
      })
    ).toBe(inactive);
  });

  it('unknown placement id is a guarded no-op', () => {
    const s = hydrated();
    expect(
      plannerReducer(s, {
        type: 'MOVE_PLACEMENT',
        placementId: 'ghost',
        startRow: 0,
        startCol: 0,
      })
    ).toBe(s);
  });
});

// Lot 3 (footprint panel) — SET_PLACEMENT_FOOTPRINT: the user owns the size;
// the guard revalidates at the placement's own anchor (itself excluded) and
// unchanged spans are idempotent (the MOVE invariant).
describe('plannerReducer SET_PLACEMENT_FOOTPRINT (SMA-193 lot 3)', () => {
  it('grows 1×1 → 2×2 and stores the spans', () => {
    const s = plannerReducer(hydrated(), {
      type: 'SET_PLACEMENT_FOOTPRINT',
      placementId: 'srv-1',
      spanRows: 2,
      spanCols: 2,
    });
    expect(s.placements[0]).toMatchObject({
      id: 'srv-1',
      startRow: 1,
      startCol: 1,
      spanRows: 2,
      spanCols: 2,
    });
    expect(s.isDirty).toBe(true);
    expect(s.past.length).toBe(1);
  });

  it('shrinks 2×2 → 1×1', () => {
    let s = plannerReducer(hydrated(), {
      type: 'SET_PLACEMENT_FOOTPRINT',
      placementId: 'srv-1',
      spanRows: 2,
      spanCols: 2,
    });
    s = plannerReducer(s, {
      type: 'SET_PLACEMENT_FOOTPRINT',
      placementId: 'srv-1',
      spanRows: 1,
      spanCols: 1,
    });
    expect(s.placements[0]).toMatchObject({ spanRows: 1, spanCols: 1 });
  });

  it('a misfit (overlap) returns the SAME state object', () => {
    // A second 1×1 at (0,0): growing srv-1 upward-left cannot happen (anchor
    // fixed), so overlap via a placement at (1,2) instead.
    const base = plannerReducer(hydrated(), {
      type: 'ADD_PLACEMENT',
      id: 'new-1',
      plantId: 'basil',
      row: 1,
      col: 2,
      spanRows: 1,
      spanCols: 1,
    });
    const blocked = plannerReducer(base, {
      type: 'SET_PLACEMENT_FOOTPRINT',
      placementId: 'srv-1',
      spanRows: 1,
      spanCols: 2, // (1,1)-(1,2) covers new-1
    });
    expect(blocked).toBe(base);
  });

  it('a misfit (out-of-bounds) returns the SAME state object', () => {
    const s = hydrated(); // 3×3 grid, srv-1 at (1,1)
    expect(
      plannerReducer(s, {
        type: 'SET_PLACEMENT_FOOTPRINT',
        placementId: 'srv-1',
        spanRows: 3, // rows 1-3 on a 3-row grid → OOB
        spanCols: 1,
      })
    ).toBe(s);
  });

  it('unchanged spans return the SAME state object (idempotent)', () => {
    const s = hydrated();
    const same = plannerReducer(s, {
      type: 'SET_PLACEMENT_FOOTPRINT',
      placementId: 'srv-1',
      spanRows: 1,
      spanCols: 1,
    });
    expect(same).toBe(s);
    expect(same.past).toBe(s.past);
    expect(same.isDirty).toBe(false);
  });

  it('rejects non-integer and non-positive spans at the boundary (CR R2 Major)', () => {
    // NaN skips every footprintFits comparison — without this guard a
    // corrupted footprint would persist into the layout.
    const s = hydrated();
    for (const [spanRows, spanCols] of [
      [Number.NaN, 2],
      [1.5, 2],
      [0, 2],
      [-1, 2],
      [2, Number.NaN],
      [2, 1.5],
      [2, 0],
      [2, -1],
    ] as const) {
      expect(
        plannerReducer(s, {
          type: 'SET_PLACEMENT_FOOTPRINT',
          placementId: 'srv-1',
          spanRows,
          spanCols,
        })
      ).toBe(s);
    }
  });

  it('unknown placement id is a guarded no-op', () => {
    const s = hydrated();
    expect(
      plannerReducer(s, {
        type: 'SET_PLACEMENT_FOOTPRINT',
        placementId: 'ghost',
        spanRows: 2,
        spanCols: 2,
      })
    ).toBe(s);
  });
});

describe('plannerReducer soil paint (SMA-14)', () => {
  /** Hydrated state with a soil type armed (enters soil mode). */
  const armed = (type: 'clay' | 'sand' = 'clay'): PlannerState =>
    plannerReducer(hydrated(), { type: 'SET_SOIL_TYPE', soilType: type });

  it('SET_SOIL_TYPE arms the type, enters the mode and leaves the others', () => {
    let s = plannerReducer(hydrated(), {
      type: 'SET_INFRA_TYPE',
      infraType: 'wall',
    });
    expect(s.infraMode).toBe(true);
    s = plannerReducer(s, { type: 'SET_SOIL_TYPE', soilType: 'clay' });
    expect(s.soilType).toBe('clay');
    expect(s.soilMode).toBe(true);
    expect(s.infraMode).toBe(false);
    expect(s.infraType).toBe('wall'); // remembered, like every mode exit
    expect(s.shapeEditMode).toBe(false);
    expect(s.placeMode).toBe(false);
    // Disarming (null) falls back to selection mode.
    s = plannerReducer(s, { type: 'SET_SOIL_TYPE', soilType: null });
    expect(s.soilType).toBeNull();
    expect(s.soilMode).toBe(false);
  });

  it('SET_SOIL_MODE cannot enter without an armed type (guarded no-op)', () => {
    const s = hydrated();
    expect(plannerReducer(s, { type: 'SET_SOIL_MODE', enabled: true })).toBe(s);
  });

  it('SET_SOIL_MODE off keeps the type armed for re-entry', () => {
    // The positive enter path is the toolbar's ONLY dispatch — an inert
    // reducer case would leave the enabled Sols button silently dead
    // (adversarial pass, mutation-proven): asserting soilMode true after
    // re-entry is what makes this describe bite.
    let s = armed();
    s = plannerReducer(s, { type: 'SET_SOIL_MODE', enabled: false });
    expect(s.soilMode).toBe(false);
    expect(s.soilType).toBe('clay');
    s = plannerReducer(s, { type: 'SET_SOIL_MODE', enabled: true });
    expect(s.soilMode).toBe(true);
  });

  it('a paint drag writes the armed type, then a re-start clears it (toggle polarity)', () => {
    let s = plannerReducer(armed(), { type: 'PAINT_START', row: 0, col: 0 });
    expect(s.grid![0][0].soil).toBe('clay');
    expect(s.soilPaintValue).toBe('clay');
    expect(s.isDirty).toBe(true);
    // The cell's other fields are untouched (this is NOT shape-edit).
    expect(s.grid![0][0].active).toBe(true);
    s = plannerReducer(s, { type: 'PAINT_ENTER', row: 0, col: 1 });
    expect(s.grid![0][1].soil).toBe('clay');
    s = plannerReducer(s, { type: 'PAINT_END' });
    // Starting again on a painted cell locks a CLEARING drag.
    s = plannerReducer(s, { type: 'PAINT_START', row: 0, col: 0 });
    expect(s.grid![0][0]).not.toHaveProperty('soil'); // sparse clear
    expect(s.soilPaintValue).toBeNull();
    s = plannerReducer(s, { type: 'PAINT_ENTER', row: 0, col: 1 });
    expect(s.grid![0][1]).not.toHaveProperty('soil');
  });

  it('PAINT_ENTER on a matching cell is a guarded no-op returning the SAME state object', () => {
    let s = plannerReducer(armed(), { type: 'PAINT_START', row: 0, col: 0 });
    const afterStart = s;
    // Re-entering the just-painted cell: same object, no copy, no push.
    s = plannerReducer(s, { type: 'PAINT_ENTER', row: 0, col: 0 });
    expect(s).toBe(afterStart);
  });

  it('a soil write survives a serialise/parse round trip', () => {
    let s = plannerReducer(armed('sand'), {
      type: 'PAINT_START',
      row: 2,
      col: 2,
    });
    s = plannerReducer(s, { type: 'PAINT_END' });
    const json = serializeCellsJson(s.grid!);
    const back = parseCellsJson(json, 3, 3);
    expect(back[2][2].soil).toBe('sand');
    expect(back[0][0]).not.toHaveProperty('soil');
  });

  // ── R3: the eraser ────────────────────────────────────────────────────────

  it('arming the ERASER enters soil mode; a drag clears cells of ANY type', () => {
    // Paint two DIFFERENT soils…
    let s = plannerReducer(armed('clay'), { type: 'PAINT_START', row: 0, col: 0 });
    s = plannerReducer(s, { type: 'PAINT_END' });
    s = plannerReducer(s, { type: 'SET_SOIL_TYPE', soilType: 'sand' });
    s = plannerReducer(s, { type: 'PAINT_START', row: 0, col: 1 });
    s = plannerReducer(s, { type: 'PAINT_END' });
    expect(s.grid![0][0].soil).toBe('clay');
    expect(s.grid![0][1].soil).toBe('sand');
    // …then one eraser drag clears BOTH — no need to re-arm each type.
    s = plannerReducer(s, { type: 'SET_SOIL_TYPE', soilType: SOIL_ERASER });
    expect(s.soilMode).toBe(true);
    expect(s.soilType).toBe(SOIL_ERASER);
    s = plannerReducer(s, { type: 'PAINT_START', row: 0, col: 0 });
    expect(s.soilPaintValue).toBeNull(); // always-clear polarity
    s = plannerReducer(s, { type: 'PAINT_ENTER', row: 0, col: 1 });
    expect(s.grid![0][0]).not.toHaveProperty('soil');
    expect(s.grid![0][1]).not.toHaveProperty('soil');
  });

  it('the eraser sentinel never reaches the layout', () => {
    // Not a SoilType — the JSON boundary keeps rejecting it…
    expect(isSoilType(SOIL_ERASER)).toBe(false);
    const back = parseCellsJson(
      JSON.stringify([{ row: 0, col: 0, soil: 'erase' }]),
      2,
      1
    );
    expect(back[0][0]).not.toHaveProperty('soil');
    // …and an erasing drag only ever DELETES the key: the serialized
    // layout after erasing carries no soil field at all.
    let s = plannerReducer(armed('clay'), { type: 'PAINT_START', row: 0, col: 0 });
    s = plannerReducer(s, { type: 'PAINT_END' });
    s = plannerReducer(s, { type: 'SET_SOIL_TYPE', soilType: SOIL_ERASER });
    s = plannerReducer(s, { type: 'PAINT_START', row: 0, col: 0 });
    expect(serializeCellsJson(s.grid!) ?? '').not.toContain('soil');
  });

  it('an erasing START on a cell with nothing to clear locks the drag without dirtying', () => {
    let s = plannerReducer(hydrated(), {
      type: 'SET_SOIL_TYPE',
      soilType: SOIL_ERASER,
    });
    const before = s;
    s = plannerReducer(s, { type: 'PAINT_START', row: 0, col: 0 });
    // The drag is LOCKED (entered cells will erase)…
    expect(s.isPainting).toBe(true);
    expect(s.soilPaintValue).toBeNull();
    // …but nothing changed: no dirty, no undo entry, no grid copy.
    expect(s.isDirty).toBe(false);
    expect(s.past).toHaveLength(before.past.length);
    expect(s.grid).toBe(before.grid);
  });

  // ── R3: fill the whole garden ─────────────────────────────────────────────

  it('SET_ALL_SOIL fills every ACTIVE cell in ONE history entry, skipping inactive ones', () => {
    // Deactivate one cell first (shape-edit), then arm and fill.
    let s = plannerReducer(hydrated(), {
      type: 'SET_SHAPE_EDIT_MODE',
      enabled: true,
    });
    s = plannerReducer(s, { type: 'PAINT_START', row: 2, col: 2 });
    s = plannerReducer(s, { type: 'PAINT_END' });
    s = plannerReducer(s, { type: 'SET_SOIL_TYPE', soilType: 'clay' });
    const before = s;
    s = plannerReducer(s, { type: 'SET_ALL_SOIL' });
    expect(s.past).toHaveLength(before.past.length + 1); // ONE entry, not 8
    expect(s.isDirty).toBe(true);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        if (r === 2 && c === 2) {
          expect(s.grid![r][c]).not.toHaveProperty('soil'); // inactive: skipped
        } else {
          expect(s.grid![r][c].soil).toBe('clay');
        }
      }
    }
  });

  it('SET_ALL_SOIL is an idempotent guarded no-op returning the SAME state object', () => {
    const filled = plannerReducer(armed('clay'), { type: 'SET_ALL_SOIL' });
    expect(filled.grid![0][0].soil).toBe('clay');
    expect(plannerReducer(filled, { type: 'SET_ALL_SOIL' })).toBe(filled);
  });

  it('SET_ALL_SOIL works with a type armed even after leaving the mode (the button state)', () => {
    // The panel's button enables on the ARMED value, which every mode exit
    // remembers — the action must not silently no-op from selection mode.
    let s = plannerReducer(armed('clay'), { type: 'ENTER_SELECTION_MODE' });
    expect(s.soilMode).toBe(false);
    expect(s.soilType).toBe('clay');
    s = plannerReducer(s, { type: 'SET_ALL_SOIL' });
    expect(s.grid![0][0].soil).toBe('clay');
  });

  it('SET_ALL_SOIL with the ERASER armed clears the whole garden', () => {
    let s = plannerReducer(armed('clay'), { type: 'SET_ALL_SOIL' });
    s = plannerReducer(s, { type: 'SET_SOIL_TYPE', soilType: SOIL_ERASER });
    s = plannerReducer(s, { type: 'SET_ALL_SOIL' });
    for (const row of s.grid!) {
      for (const cell of row) {
        expect(cell).not.toHaveProperty('soil');
      }
    }
    // Clearing an already-clear garden is the same-object no-op.
    expect(plannerReducer(s, { type: 'SET_ALL_SOIL' })).toBe(s);
  });
});

// SMA-14 R3 — the GitHub Major, requalified by the harvest: the two draft
// lifecycle actions spread only disarmedPainting since their birth, so ALL
// FOUR modes (shape-edit, infra, place, soil) survived a Cancel/Discard and
// the next pointer action mutated the freshly restored layout. They now
// adopt the SMA-303 "always lands in SELECTION mode" contract that HYDRATE
// and SETUP_CONFIRMED already honour.
describe('plannerReducer lifecycle mode reset (SMA-14 R3)', () => {
  it('RESTORE_LAST_SAVED lands back in SELECTION mode — all four flags off', () => {
    let s = plannerReducer(hydrated(), {
      type: 'SET_SOIL_TYPE',
      soilType: 'clay',
    });
    expect(s.soilMode).toBe(true);
    s = plannerReducer(s, { type: 'RESTORE_LAST_SAVED' });
    expect(s.shapeEditMode).toBe(false);
    expect(s.infraMode).toBe(false);
    expect(s.placeMode).toBe(false);
    expect(s.soilMode).toBe(false);
    expect(s.soilType).toBe('clay'); // armed value remembered, like every exit
  });

  it('DISCARD_DRAFT lands back in SELECTION mode — all four flags off', () => {
    let s = plannerReducer(initialPlannerState, {
      type: 'SETUP_CONFIRMED',
      cols: 3,
      rows: 3,
      cellSize: '50cm',
    });
    s = plannerReducer(s, { type: 'SET_SHAPE_EDIT_MODE', enabled: true });
    expect(s.shapeEditMode).toBe(true);
    s = plannerReducer(s, { type: 'DISCARD_DRAFT' });
    expect(s.shapeEditMode).toBe(false);
    expect(s.infraMode).toBe(false);
    expect(s.placeMode).toBe(false);
    expect(s.soilMode).toBe(false);
  });
});
