import type { CellData } from '../../types/GardenLayout';
import { parseCellsJson } from '../../types/GardenLayout';
import type { ExposureCategory, Moment, Season } from '../../utils/exposure';
import type { InfrastructureType } from '../../utils/infrastructure';
import { footprintFits } from './placementGeometry';

/**
 * A placement with a CLIENT identity. The `id` is the server placement id
 * when hydrated from a saved layout, or a locally generated one for
 * placements created since the last save — selection is ID-based (5.1-B).
 * The id is stripped before the save payload (SavePlacementData carries no
 * id), so it never reaches the wire.
 */
export interface PlannerPlacement {
  id: string;
  plantId: string;
  startRow: number;
  startCol: number;
  spanRows: number;
  spanCols: number;
  notes: string | null;
}

export interface LayoutSnapshot {
  grid: CellData[][] | null;
  layoutWidth: number;
  layoutHeight: number;
  cellSize: string;
  placements: PlannerPlacement[];
}

/**
 * One undo step (SMA-17 5.3-D R2, save-state added in R6): the draft content
 * (cells + placements) PLUS the save context at capture time — the saved
 * revision reference and the dirty flag. UNDO restores all four, so undoing
 * can neither fabricate dirtiness (undoing the only post-save edit is clean)
 * nor strand a saved garden (lastSaved survives an undone SETUP_CONFIRMED).
 * The captured isDirty IS the existing dirty-tracking's value for that state
 * — no new content-equality comparison is invented (the only equality in
 * this reducer, MARK_SAVED's referential revision check, cannot compare
 * across deep copies). Dimensions are derived from the restored grid at pop
 * time; cellSize is deliberately NOT part of the snapshot (a documented
 * limitation: undoing a RESIZED restores the cells but keeps the new
 * cellSize).
 */
interface DraftSnapshot {
  grid: CellData[][] | null;
  placements: PlannerPlacement[];
  lastSaved: LayoutSnapshot | null;
  isDirty: boolean;
}

export interface PlannerState {
  grid: CellData[][] | null;
  layoutWidth: number;
  layoutHeight: number;
  cellSize: string;
  placements: PlannerPlacement[];
  isDirty: boolean;
  shapeEditMode: boolean;
  /** Visual zoom (purely view-state — does not affect saved data). */
  zoom: number;
  /** Drag-to-paint: whether a paint drag is in progress and its polarity. */
  isPainting: boolean;
  paintAction: boolean | null;
  /**
   * Infrastructure paint mode (SMA-15 5.4) — the third mutually exclusive
   * editing mode (selection / shape-edit / infrastructure-paint). Arming a
   * type from the sidebar ENTERS the mode (and leaves shape-edit); the mode
   * cannot be entered without an armed type. `infraPaintValue` is the drag
   * polarity — the type being applied, or null while a drag is CLEARING
   * (started on a cell already carrying the armed type, mirroring
   * shape-edit's toggle-polarity model).
   */
  infraMode: boolean;
  infraType: InfrastructureType | null;
  infraPaintValue: InfrastructureType | null;
  /**
   * Place mode (SMA-193 5.5) — the fourth mutually exclusive editing mode.
   * Arming a plant from the sidebar ENTERS the mode (and leaves shape-edit +
   * infrastructure); the mode cannot be entered without an armed plant.
   * Exact grammar mirror of infraMode/infraType: the armed plant stays
   * remembered on every mode exit so the toolbar button can re-enter.
   */
  placeMode: boolean;
  placePlantId: string | null;
  /**
   * Snapshot of the last saved layout. This is the planner's whole "undo":
   * Cancel restores it wholesale (there is no history stack — pre-5.1B the
   * snapshot lived in a ref and handleCancel deep-copied it back).
   */
  lastSaved: LayoutSnapshot | null;
  /**
   * Transient removal event: `removedSeq` bumps each time a structural
   * action drops placements; the page turns it into the info toast +
   * selection clear (the old notifyRemovedPlacements side effects).
   */
  removedCount: number;
  removedSeq: number;
  /**
   * Exposure layer (SMA-17 5.3-D) — pure VIEW state, session-only (never
   * persisted, deliberately opt-in per visit): the layer starts hidden, the
   * presets default to the mockup's "été · midi". The moment preset is wired
   * but visually inert until 5.4 ships cast shadows — only the legend title
   * reflects it (honesty: no fake variation).
   */
  exposureVisible: boolean;
  exposureMoment: Moment;
  exposureSeason: Season;
  /**
   * Undo history (SMA-17 5.3-D R2): past DRAFT snapshots, pushed by every
   * content-mutating action (paint/shape edits, placements, override,
   * RESIZED, SETUP_CONFIRMED), capped at UNDO_CAP. View/save/lifecycle
   * actions never push; HYDRATE (new garden context) clears.
   */
  past: DraftSnapshot[];
}

/** Zoom clamp bounds — single source of truth, shared with the toolbar's
 * disabled checks (GridControls). */
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2;

/** Undo history cap — the oldest snapshot falls off beyond this. */
export const UNDO_CAP = 50;

export const initialPlannerState: PlannerState = {
  grid: null,
  layoutWidth: 0,
  layoutHeight: 0,
  cellSize: '50cm',
  placements: [],
  isDirty: false,
  shapeEditMode: false,
  zoom: 1,
  isPainting: false,
  paintAction: null,
  infraMode: false,
  infraType: null,
  infraPaintValue: null,
  placeMode: false,
  placePlantId: null,
  lastSaved: null,
  removedCount: 0,
  removedSeq: 0,
  exposureVisible: false,
  exposureMoment: 'noon',
  exposureSeason: 'summer',
  past: [],
};

export type PlannerAction =
  | {
      type: 'HYDRATE_FROM_LAYOUT';
      width: number;
      height: number;
      cellSize: string;
      cellsJson: string | null;
      placements: PlannerPlacement[];
    }
  | { type: 'SETUP_CONFIRMED'; cols: number; rows: number; cellSize: string }
  | { type: 'RESIZED'; width: number; height: number; cellSize: string }
  | { type: 'PAINT_START'; row: number; col: number }
  | { type: 'PAINT_ENTER'; row: number; col: number }
  | { type: 'PAINT_END' }
  | { type: 'SET_ALL_CELLS'; active: boolean }
  | { type: 'ADD_ROW_TOP' }
  | { type: 'ADD_ROW_BOTTOM' }
  | { type: 'ADD_COL_LEFT' }
  | { type: 'ADD_COL_RIGHT' }
  | { type: 'REMOVE_ROW_TOP' }
  | { type: 'REMOVE_ROW_BOTTOM' }
  | { type: 'REMOVE_COL_LEFT' }
  | { type: 'REMOVE_COL_RIGHT' }
  | {
      type: 'ADD_PLACEMENT';
      id: string;
      plantId: string;
      row: number;
      col: number;
      spanRows: number;
      spanCols: number;
    }
  | {
      type: 'REPLACE_PLACEMENT';
      placementId: string;
      plantId: string;
      spanRows: number;
      spanCols: number;
    }
  | {
      type: 'MOVE_PLACEMENT';
      placementId: string;
      startRow: number;
      startCol: number;
    }
  | {
      type: 'SET_PLACEMENT_FOOTPRINT';
      placementId: string;
      spanRows: number;
      spanCols: number;
    }
  | { type: 'REMOVE_PLACEMENT'; placementId: string }
  | { type: 'SET_SHAPE_EDIT_MODE'; enabled: boolean }
  | { type: 'SET_INFRA_TYPE'; infraType: InfrastructureType | null }
  | { type: 'SET_INFRA_MODE'; enabled: boolean }
  | { type: 'SET_PLACE_PLANT'; plantId: string | null }
  | { type: 'SET_PLACE_MODE'; enabled: boolean }
  | { type: 'ENTER_SELECTION_MODE' }
  | { type: 'ZOOM_IN' }
  | { type: 'ZOOM_OUT' }
  | { type: 'MARK_SAVED'; submitted: LayoutSnapshot }
  | { type: 'RESTORE_LAST_SAVED' }
  | { type: 'DISCARD_DRAFT' }
  | { type: 'TOGGLE_EXPOSURE' }
  | { type: 'SET_EXPOSURE_MOMENT'; moment: Moment }
  | { type: 'SET_EXPOSURE_SEASON'; season: Season }
  | {
      type: 'SET_CELL_EXPOSURE_OVERRIDE';
      row: number;
      col: number;
      value: ExposureCategory | null;
    }
  | { type: 'UNDO' };

const copyGrid = (grid: CellData[][] | null): CellData[][] | null =>
  grid ? grid.map((row) => row.map((cell) => ({ ...cell }))) : null;

/** Paint actions receive pointer-derived coordinates — validate them against
 * the grid BEFORE any indexing (an out-of-bounds read would crash render). */
const isInsideGrid = (
  grid: CellData[][],
  row: number,
  col: number
): boolean =>
  row >= 0 && row < grid.length && col >= 0 && col < (grid[row]?.length ?? 0);

const copyPlacements = (placements: PlannerPlacement[]): PlannerPlacement[] =>
  placements.map((p) => ({ ...p }));

/** Does the placement's span cover the given cell? (F7 — painting a cell
 * inactive must evict whatever occupies it, like RESIZED already does.) */
const occupiesCell = (
  p: PlannerPlacement,
  row: number,
  col: number
): boolean =>
  row >= p.startRow &&
  row < p.startRow + p.spanRows &&
  col >= p.startCol &&
  col < p.startCol + p.spanCols;

/** Painting state must not survive an editing-context change (F6): hydration,
 * restore, draft discard and every mode switch all reset through this. The
 * infra polarity disarms with the shared drag flag (5.4). */
const disarmedPainting = {
  isPainting: false,
  paintAction: null,
  infraPaintValue: null,
} as const;

/** Entering an editing context (fresh setup, another garden's hydration)
 * always lands in SELECTION mode (SMA-303): shape-edit must not leak across
 * garden switches, and a still-armed infra type or plant must not turn the
 * new grid into a paint/place surface — the armed type AND the armed plant
 * stay remembered, like every mode exit. Single shared source for these
 * resets so the entry points can never diverge. Every SET_*_MODE case spreads
 * this FIRST and then flips its own flag on (5.5): mutual exclusion between
 * the four modes is structural, not per-case bookkeeping. The dedicated
 * ENTER_SELECTION_MODE action (R3) is this constant made visible: the
 * toolbar's Sélection button and Escape-in-Place both dispatch it, so
 * "return to selection" is one action, not a per-mode dispatch fan. */
const enterSelectionMode = {
  ...disarmedPainting,
  shapeEditMode: false,
  infraMode: false,
  placeMode: false,
} as const;

/**
 * Push the CURRENT draft content onto the undo stack (deep-copied — the live
 * grid/placements keep mutating immutably after this), dropping the oldest
 * snapshot beyond UNDO_CAP. Called by every content-mutating case AFTER its
 * guards, so a guarded no-op never pushes.
 */
const pushHistory = (state: PlannerState): DraftSnapshot[] => {
  const past = [
    ...state.past,
    {
      grid: copyGrid(state.grid),
      placements: copyPlacements(state.placements),
      // Save context (R6): lastSaved is immutable once created (MARK_SAVED /
      // HYDRATE build fresh objects), so the reference is safe to share.
      lastSaved: state.lastSaved,
      isDirty: state.isDirty,
    },
  ];
  return past.length > UNDO_CAP ? past.slice(past.length - UNDO_CAP) : past;
};


/** Bump the transient removal event only when placements were dropped. */
const withRemoval = (
  state: PlannerState,
  removedCount: number
): Pick<PlannerState, 'removedCount' | 'removedSeq'> =>
  removedCount > 0
    ? { removedCount, removedSeq: state.removedSeq + 1 }
    : { removedCount: state.removedCount, removedSeq: state.removedSeq };

export function plannerReducer(
  state: PlannerState,
  action: PlannerAction
): PlannerState {
  switch (action.type) {
    case 'HYDRATE_FROM_LAYOUT': {
      const grid = parseCellsJson(action.cellsJson, action.width, action.height);
      return {
        ...state,
        ...enterSelectionMode,
        past: [], // new garden context — history cleared (5.3-D R2)
        grid,
        layoutWidth: action.width,
        layoutHeight: action.height,
        cellSize: action.cellSize,
        placements: action.placements,
        isDirty: false,
        lastSaved: {
          grid: copyGrid(grid),
          layoutWidth: action.width,
          layoutHeight: action.height,
          cellSize: action.cellSize,
          placements: copyPlacements(action.placements),
        },
      };
    }

    case 'SETUP_CONFIRMED':
      // F5/F8 (SMA-17): a first setup establishes a FRESH layout — placements
      // and the saved snapshot RESET, so the reducer contract no longer leans on
      // UI reachability (setup only opens on a garden with no layout). Editing an
      // existing garden's dimensions goes through RESIZED, which preserves cells
      // and filters out-of-bounds placements — never a wipe. The transient
      // editing fields reset too (CR 496d6f2a): any in-flight paint is disarmed
      // and shape-edit mode is left, so the fresh grid starts in a clean state.
      return {
        ...state,
        ...enterSelectionMode,
        // Undoable content change (5.3-D R2) — but NEVER push the pre-setup
        // null-grid snapshot (R3, CR accept): undoing the very FIRST setup
        // would restore grid:null with lastSaved:null and strand the user on
        // a blank planner (the whole layout is gated on `grid &&`).
        past: state.grid ? pushHistory(state) : state.past,
        grid: parseCellsJson(null, action.cols, action.rows),
        layoutWidth: action.cols,
        layoutHeight: action.rows,
        cellSize: action.cellSize,
        placements: [],
        lastSaved: null,
        isDirty: true,
      };

    case 'RESIZED': {
      const newGrid: CellData[][] = [];
      for (let r = 0; r < action.height; r++) {
        newGrid[r] = [];
        for (let c = 0; c < action.width; c++) {
          if (state.grid && r < state.grid.length && c < state.grid[r].length) {
            newGrid[r][c] = state.grid[r][c];
          } else {
            newGrid[r][c] = { active: true };
          }
        }
      }
      const filtered = state.placements.filter(
        (p) =>
          p.startRow + p.spanRows <= action.height &&
          p.startCol + p.spanCols <= action.width
      );
      return {
        ...state,
        past: pushHistory(state),
        grid: newGrid,
        layoutWidth: action.width,
        layoutHeight: action.height,
        cellSize: action.cellSize,
        placements: filtered,
        isDirty: true,
        ...withRemoval(state, state.placements.length - filtered.length),
      };
    }

    case 'PAINT_START': {
      if (!state.grid) return state;
      if (!isInsideGrid(state.grid, action.row, action.col)) return state;
      if (state.shapeEditMode) {
        const currentActive = state.grid[action.row][action.col].active;
        const copy = copyGrid(state.grid)!;
        copy[action.row][action.col] = {
          ...copy[action.row][action.col],
          active: !currentActive,
        };
        // Painting a cell INACTIVE evicts whatever occupied it (F7) — same
        // semantics (filter + removal toast) as the RESIZED out-of-bounds drop.
        const filtered = currentActive
          ? state.placements.filter(
              (p) => !occupiesCell(p, action.row, action.col)
            )
          : state.placements;
        return {
          ...state,
          past: pushHistory(state),
          grid: copy,
          placements: filtered,
          isPainting: true,
          paintAction: !currentActive,
          isDirty: true,
          ...withRemoval(state, state.placements.length - filtered.length),
        };
      }
      // Infrastructure paint (SMA-15 5.4) — same drag pattern, targeting
      // cell.infrastructure. ACTIVE cells only (an inactive cell renders
      // cellOff, so a painted value would be invisible — the shape-edit
      // eligibility precedent); placements do NOT block painting (a plant
      // over a trellis is the documented layering). Starting on a cell that
      // already carries the armed type locks a CLEARING drag — the same
      // toggle-polarity model as shape-edit.
      if (state.infraMode && state.infraType) {
        const cell = state.grid[action.row][action.col];
        if (!cell.active) return state;
        const apply =
          cell.infrastructure === state.infraType ? null : state.infraType;
        const copy = copyGrid(state.grid)!;
        if (apply === null) {
          // Sparse contract (like the override): clearing REMOVES the key.
          delete copy[action.row][action.col].infrastructure;
        } else {
          copy[action.row][action.col].infrastructure = apply;
        }
        return {
          ...state,
          past: pushHistory(state),
          grid: copy,
          isPainting: true,
          infraPaintValue: apply,
          isDirty: true,
        };
      }
      return state;
    }

    case 'PAINT_ENTER': {
      if (!state.isPainting || !state.grid) return state;
      if (!isInsideGrid(state.grid, action.row, action.col)) return state;
      // shapeEditMode is re-checked (F6): leaving shape-edit mid-drag must not
      // let a queued pointer-enter keep mutating the grid.
      if (state.shapeEditMode && state.paintAction !== null) {
        // No-op guard (R3, CR accept): entering a cell that ALREADY matches the
        // paint polarity — with no placement to evict — must not copy the grid,
        // dirty the draft, or push an undo snapshot.
        const alreadyApplied =
          state.grid[action.row][action.col].active === state.paintAction;
        const placementWouldBeEvicted =
          state.paintAction === false &&
          state.placements.some((p) => occupiesCell(p, action.row, action.col));
        if (alreadyApplied && !placementWouldBeEvicted) return state;
        const copy = copyGrid(state.grid)!;
        copy[action.row][action.col] = {
          ...copy[action.row][action.col],
          active: state.paintAction,
        };
        const filtered =
          state.paintAction === false
            ? state.placements.filter(
                (p) => !occupiesCell(p, action.row, action.col)
              )
            : state.placements;
        return {
          ...state,
          past: pushHistory(state),
          grid: copy,
          placements: filtered,
          isDirty: true,
          ...withRemoval(state, state.placements.length - filtered.length),
        };
      }
      // Infrastructure drag (5.4): the mode + armed type are re-checked (same
      // F6 contract), the polarity comes from PAINT_START's lock. The no-op
      // guard mirrors R3's: a cell already matching the polarity must not
      // copy the grid, dirty the draft, or spend an undo entry.
      if (state.infraMode && state.infraType) {
        const cell = state.grid[action.row][action.col];
        if (!cell.active) return state;
        if ((cell.infrastructure ?? null) === state.infraPaintValue) {
          return state;
        }
        const copy = copyGrid(state.grid)!;
        if (state.infraPaintValue === null) {
          delete copy[action.row][action.col].infrastructure;
        } else {
          copy[action.row][action.col].infrastructure = state.infraPaintValue;
        }
        return {
          ...state,
          past: pushHistory(state),
          grid: copy,
          isDirty: true,
        };
      }
      return state;
    }

    case 'PAINT_END':
      return { ...state, ...disarmedPainting };

    case 'SET_ALL_CELLS': {
      if (!state.grid) return state;
      // Deactivating EVERY cell leaves no garden space — placements cannot
      // survive it (F7); activating all never drops anything.
      const filtered = action.active ? state.placements : [];
      return {
        ...state,
        past: pushHistory(state),
        grid: state.grid.map((row) =>
          row.map((cell) => ({ ...cell, active: action.active }))
        ),
        placements: filtered,
        isDirty: true,
        ...withRemoval(state, state.placements.length - filtered.length),
      };
    }

    case 'ADD_ROW_TOP': {
      if (!state.grid) return state;
      const newRow: CellData[] = Array.from(
        { length: state.layoutWidth },
        () => ({ active: true })
      );
      return {
        ...state,
        past: pushHistory(state),
        grid: [newRow, ...state.grid],
        layoutHeight: state.layoutHeight + 1,
        placements: state.placements.map((p) => ({
          ...p,
          startRow: p.startRow + 1,
        })),
        isDirty: true,
      };
    }

    case 'ADD_ROW_BOTTOM': {
      if (!state.grid) return state;
      const newRow: CellData[] = Array.from(
        { length: state.layoutWidth },
        () => ({ active: true })
      );
      return {
        ...state,
        past: pushHistory(state),
        grid: [...state.grid, newRow],
        layoutHeight: state.layoutHeight + 1,
        isDirty: true,
      };
    }

    case 'ADD_COL_LEFT': {
      if (!state.grid) return state;
      return {
        ...state,
        past: pushHistory(state),
        grid: state.grid.map((row) => [{ active: true }, ...row]),
        layoutWidth: state.layoutWidth + 1,
        placements: state.placements.map((p) => ({
          ...p,
          startCol: p.startCol + 1,
        })),
        isDirty: true,
      };
    }

    case 'ADD_COL_RIGHT': {
      if (!state.grid) return state;
      return {
        ...state,
        past: pushHistory(state),
        grid: state.grid.map((row) => [...row, { active: true }]),
        layoutWidth: state.layoutWidth + 1,
        isDirty: true,
      };
    }

    case 'REMOVE_ROW_TOP': {
      if (!state.grid || state.grid.length <= 2) return state;
      const filtered = state.placements
        .filter((p) => p.startRow >= 1)
        .map((p) => ({ ...p, startRow: p.startRow - 1 }));
      return {
        ...state,
        past: pushHistory(state),
        grid: state.grid.slice(1),
        layoutHeight: state.layoutHeight - 1,
        placements: filtered,
        isDirty: true,
        ...withRemoval(state, state.placements.length - filtered.length),
      };
    }

    case 'REMOVE_ROW_BOTTOM': {
      if (!state.grid || state.grid.length <= 2) return state;
      const newHeight = state.grid.length - 1;
      const filtered = state.placements.filter(
        (p) => p.startRow + p.spanRows <= newHeight
      );
      return {
        ...state,
        past: pushHistory(state),
        grid: state.grid.slice(0, -1),
        layoutHeight: state.layoutHeight - 1,
        placements: filtered,
        isDirty: true,
        ...withRemoval(state, state.placements.length - filtered.length),
      };
    }

    case 'REMOVE_COL_LEFT': {
      if (!state.grid || !state.grid[0] || state.grid[0].length <= 2) {
        return state;
      }
      const filtered = state.placements
        .filter((p) => p.startCol >= 1)
        .map((p) => ({ ...p, startCol: p.startCol - 1 }));
      return {
        ...state,
        past: pushHistory(state),
        grid: state.grid.map((row) => row.slice(1)),
        layoutWidth: state.layoutWidth - 1,
        placements: filtered,
        isDirty: true,
        ...withRemoval(state, state.placements.length - filtered.length),
      };
    }

    case 'REMOVE_COL_RIGHT': {
      if (!state.grid || !state.grid[0] || state.grid[0].length <= 2) {
        return state;
      }
      const newWidth = state.grid[0].length - 1;
      const filtered = state.placements.filter(
        (p) => p.startCol + p.spanCols <= newWidth
      );
      return {
        ...state,
        past: pushHistory(state),
        grid: state.grid.map((row) => row.slice(0, -1)),
        layoutWidth: state.layoutWidth - 1,
        placements: filtered,
        isDirty: true,
        ...withRemoval(state, state.placements.length - filtered.length),
      };
    }

    case 'ADD_PLACEMENT': {
      // SMA-193 (5.5): the footprint arrives with the action (spacing→cells
      // rule computed by the UI) and is GUARDED here — out-of-bounds, an
      // inactive covered cell, or an overlap with another placement is a
      // silent reducer no-op; the collision toast is the UI's job.
      if (!state.grid) return state;
      const candidate = {
        startRow: action.row,
        startCol: action.col,
        spanRows: action.spanRows,
        spanCols: action.spanCols,
      };
      if (!footprintFits(state.grid, state.placements, candidate).ok) {
        return state;
      }
      return {
        ...state,
        past: pushHistory(state),
        placements: [
          ...state.placements,
          {
            id: action.id,
            plantId: action.plantId,
            ...candidate,
            notes: null,
          },
        ],
        isDirty: true,
      };
    }

    case 'REPLACE_PLACEMENT': {
      // R2 (GitHub Major, converging Extension finding): swapping the plant
      // re-derives the footprint — the candidate keeps the target's anchor
      // with the NEW spacing-derived spans and revalidates via footprintFits
      // with the target itself excluded, so a replacement can neither keep a
      // stale shape nor bypass the collision/inactive/bounds guards. Failure
      // is a silent no-op, mirroring ADD_PLACEMENT (the toast is UI's job).
      const target = state.placements.find((p) => p.id === action.placementId);
      if (!target || !state.grid) return state;
      const candidate = {
        startRow: target.startRow,
        startCol: target.startCol,
        spanRows: action.spanRows,
        spanCols: action.spanCols,
      };
      if (
        !footprintFits(state.grid, state.placements, candidate, target.id).ok
      ) {
        return state;
      }
      return {
        ...state,
        past: pushHistory(state),
        placements: state.placements.map((p) =>
          p.id === action.placementId
            ? { ...p, plantId: action.plantId, ...candidate }
            : p
        ),
        isDirty: true,
      };
    }

    case 'MOVE_PLACEMENT': {
      // Lot 2 (DnD): moving keeps the placement's existing footprint — the
      // action carries only the new anchor; the candidate revalidates via
      // footprintFits with the target itself excluded (its old cells are
      // legal landing ground). Failure is a silent no-op, mirroring
      // ADD/REPLACE (the toast is the UI's job).
      const target = state.placements.find((p) => p.id === action.placementId);
      if (!target || !state.grid) return state;
      // CR (lot 2 R1): a drop on the placement's own anchor is a pure no-op —
      // the SAME state object comes back, so no undo entry and no dirty flag.
      if (
        action.startRow === target.startRow &&
        action.startCol === target.startCol
      ) {
        return state;
      }
      const candidate = {
        startRow: action.startRow,
        startCol: action.startCol,
        spanRows: target.spanRows,
        spanCols: target.spanCols,
      };
      if (
        !footprintFits(state.grid, state.placements, candidate, target.id).ok
      ) {
        return state;
      }
      return {
        ...state,
        past: pushHistory(state),
        placements: state.placements.map((p) =>
          p.id === action.placementId ? { ...p, ...candidate } : p
        ),
        isDirty: true,
      };
    }

    case 'SET_PLACEMENT_FOOTPRINT': {
      // Lot 3: the suggested footprint is a SUGGESTION — the user owns the
      // size (product ruling 2026-07-21; a 4×4 m tree can live in a pot on
      // one cell). Same grammar as MOVE: revalidate at the placement's own
      // anchor with itself excluded; failure is a silent no-op (the panel
      // warn is the UI's job). footprintFits enforces the ≥1 span invariant
      // itself (lot 1 R4).
      const target = state.placements.find((p) => p.id === action.placementId);
      if (!target || !state.grid) return state;
      // Idempotence (the MOVE/PAINT_ENTER invariant): unchanged spans return
      // the SAME state object — no undo entry, no dirty flag.
      if (
        action.spanRows === target.spanRows &&
        action.spanCols === target.spanCols
      ) {
        return state;
      }
      const candidate = {
        startRow: target.startRow,
        startCol: target.startCol,
        spanRows: action.spanRows,
        spanCols: action.spanCols,
      };
      if (
        !footprintFits(state.grid, state.placements, candidate, target.id).ok
      ) {
        return state;
      }
      return {
        ...state,
        past: pushHistory(state),
        placements: state.placements.map((p) =>
          p.id === action.placementId ? { ...p, ...candidate } : p
        ),
        isDirty: true,
      };
    }

    case 'REMOVE_PLACEMENT':
      return {
        ...state,
        past: pushHistory(state),
        placements: state.placements.filter((p) => p.id !== action.placementId),
        isDirty: true,
      };

    case 'SET_SHAPE_EDIT_MODE':
      // Disabling shape-edit disarms any in-flight paint drag (F6). Enabling
      // it LEAVES the other modes (mutual exclusion via enterSelectionMode) —
      // armed type/plant stay remembered so their buttons can re-enter.
      return action.enabled
        ? { ...state, ...enterSelectionMode, shapeEditMode: true }
        : { ...state, ...enterSelectionMode };

    // ── Infrastructure mode (SMA-15 5.4) ─────────────────────────────────────
    case 'SET_INFRA_TYPE':
      // Arming a type ENTERS infrastructure mode (and leaves the others,
      // enterSelectionMode). Disarming (null) exits ONLY infra mode: unlike
      // mode entries, a null-disarm can fire while ANOTHER mode is active
      // (armed values are remembered across mode exits), so it must not
      // eject the user from shape-edit/place (5.5 review). Both disarm any
      // in-flight drag (F6 contract).
      return action.infraType === null
        ? { ...state, ...disarmedPainting, infraType: null, infraMode: false }
        : {
            ...state,
            ...enterSelectionMode,
            infraType: action.infraType,
            infraMode: true,
          };

    case 'SET_INFRA_MODE':
      // Entering REQUIRES an armed type (the sidebar arms it) — a guarded
      // no-op otherwise, mirroring how every reducer guard works. Leaving
      // keeps the type armed for a later re-entry.
      if (action.enabled) {
        if (!state.infraType) return state;
        return { ...state, ...enterSelectionMode, infraMode: true };
      }
      return { ...state, ...enterSelectionMode };

    // ── Place mode (SMA-193 5.5) — exact infra-grammar mirror ────────────────
    case 'SET_PLACE_PLANT':
      // Arming a plant ENTERS place mode (and leaves the others); disarming
      // (null) clears the plant and exits ONLY place mode — same own-mode
      // exit rule as SET_INFRA_TYPE's null branch (it can fire while another
      // mode is active).
      return action.plantId === null
        ? { ...state, ...disarmedPainting, placePlantId: null, placeMode: false }
        : {
            ...state,
            ...enterSelectionMode,
            placePlantId: action.plantId,
            placeMode: true,
          };

    case 'SET_PLACE_MODE':
      // Lot 3 R2 (product ruling 2026-07-22): entering NO LONGER requires an
      // armed plant — a DELIBERATE divergence from the infra mirror. Place
      // has TWO functions: placing (needs an armed plant) and moving
      // existing placements (needs none — move-drags check only placeMode
      // since lot 2). An unarmed entry is the move-only mode. Leaving keeps
      // the plant armed for a later re-entry.
      if (action.enabled) {
        return { ...state, ...enterSelectionMode, placeMode: true };
      }
      return { ...state, ...enterSelectionMode };

    case 'ENTER_SELECTION_MODE':
      // R3 (both surfaces converging): the single visible return-to-selection
      // gate — every mode exits, painting disarms, and BOTH armed values
      // (infraType, placePlantId) stay remembered so their toolbar buttons
      // can re-enter. Escape-in-Place and the toolbar's Sélection button
      // route through here; explicit DISARMS stay on the SET_*(null) actions.
      return { ...state, ...enterSelectionMode };

    case 'ZOOM_IN':
      return { ...state, zoom: Math.min(ZOOM_MAX, state.zoom + 0.2) };

    case 'ZOOM_OUT':
      return { ...state, zoom: Math.max(ZOOM_MIN, state.zoom - 0.2) };

    case 'MARK_SAVED': {
      // The snapshot is built from the SUBMITTED revision — what the server
      // actually received — never from post-request state. Edits made while
      // saveLayout was in flight produced fresh grid/placements references
      // (immutable reducer), so a referential check tells the two apart:
      // only a still-current revision clears the dirty flag.
      const { submitted } = action;
      const isCurrentRevision =
        state.grid === submitted.grid &&
        state.placements === submitted.placements;
      return {
        ...state,
        isDirty: !isCurrentRevision,
        lastSaved: {
          grid: copyGrid(submitted.grid),
          layoutWidth: submitted.layoutWidth,
          layoutHeight: submitted.layoutHeight,
          cellSize: submitted.cellSize,
          placements: copyPlacements(submitted.placements),
        },
      };
    }

    case 'RESTORE_LAST_SAVED': {
      if (!state.lastSaved) return state;
      const snap = state.lastSaved;
      return {
        ...state,
        ...disarmedPainting,
        // Draft-lifecycle reset (like HYDRATE): the abandoned draft's history
        // must not resurface through UNDO after a wholesale restore.
        past: [],
        grid: copyGrid(snap.grid),
        layoutWidth: snap.layoutWidth,
        layoutHeight: snap.layoutHeight,
        cellSize: snap.cellSize,
        placements: copyPlacements(snap.placements),
        isDirty: false,
      };
    }

    case 'DISCARD_DRAFT':
      return {
        ...state,
        ...disarmedPainting,
        past: [], // draft-lifecycle reset, same rationale as RESTORE_LAST_SAVED
        grid: null,
        placements: [],
        layoutWidth: 0,
        layoutHeight: 0,
        isDirty: false,
      };

    // ── Exposure layer (SMA-17 5.3-D) ────────────────────────────────────────
    // The three view-state actions never touch the draft (no isDirty change);
    // only the per-cell override edits the layout itself.
    case 'TOGGLE_EXPOSURE':
      return { ...state, exposureVisible: !state.exposureVisible };

    case 'SET_EXPOSURE_MOMENT':
      return { ...state, exposureMoment: action.moment };

    case 'SET_EXPOSURE_SEASON':
      return { ...state, exposureSeason: action.season };

    case 'SET_CELL_EXPOSURE_OVERRIDE': {
      if (!state.grid) return state;
      if (!isInsideGrid(state.grid, action.row, action.col)) return state;
      // Idempotence (R5, CR accept): re-selecting the current category — or
      // Auto on an already-auto cell — must not dirty the draft or spend an
      // undo entry (nothing would change in the serialized layout).
      const target = state.grid[action.row][action.col];
      if ((target.exposureOverride ?? null) === action.value) return state;
      // Eligibility (R5, CR accept): a NON-NULL override only applies to an
      // active cell without a placement (the popover's own opening rule,
      // now enforced at the reducer boundary). Clearing (null) always works.
      if (action.value !== null) {
        const occupied = state.placements.some((p) =>
          occupiesCell(p, action.row, action.col)
        );
        if (!target.active || occupied) return state;
      }
      const copy = copyGrid(state.grid)!;
      if (action.value === null) {
        // Sparse contract: clearing back to Auto REMOVES the key (an
        // `undefined`-valued property would still serialize the cell).
        delete copy[action.row][action.col].exposureOverride;
      } else {
        copy[action.row][action.col].exposureOverride = action.value;
      }
      // Same dirty mechanics as painting: a fresh grid reference, so
      // MARK_SAVED's referential revision check keeps working unchanged.
      return { ...state, past: pushHistory(state), grid: copy, isDirty: true };
    }

    case 'UNDO': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        ...state,
        ...disarmedPainting,
        past: state.past.slice(0, -1),
        grid: copyGrid(previous.grid),
        placements: copyPlacements(previous.placements),
        // Dimensions FOLLOW the restored cells (undoing RESIZED/add-row must
        // restore them); a null grid means back to the pre-setup draft.
        layoutWidth: previous.grid?.[0]?.length ?? 0,
        layoutHeight: previous.grid?.length ?? 0,
        // Save-state restored WITH the content (R6, CR accept): the snapshot
        // knows whether that state was saved — undoing the only post-save
        // edit lands clean, and a lastSaved cleared later (SETUP_CONFIRMED)
        // comes back so Cancel can still reach the saved garden.
        lastSaved: previous.lastSaved,
        isDirty: previous.isDirty,
      };
    }

    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
