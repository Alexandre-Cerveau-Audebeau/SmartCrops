import type { CellData } from '../../types/GardenLayout';
import { parseCellsJson } from '../../types/GardenLayout';

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

interface LayoutSnapshot {
  grid: CellData[][] | null;
  layoutWidth: number;
  layoutHeight: number;
  cellSize: string;
  placements: PlannerPlacement[];
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
}

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
  lastSaved: null,
  removedCount: 0,
  removedSeq: 0,
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
  | { type: 'ADD_PLACEMENT'; id: string; plantId: string; row: number; col: number }
  | { type: 'REPLACE_PLACEMENT'; placementId: string; plantId: string }
  | { type: 'REMOVE_PLACEMENT'; placementId: string }
  | { type: 'SET_SHAPE_EDIT_MODE'; enabled: boolean }
  | { type: 'ZOOM_IN' }
  | { type: 'ZOOM_OUT' }
  | { type: 'MARK_SAVED' }
  | { type: 'RESTORE_LAST_SAVED' }
  | { type: 'DISCARD_DRAFT' };

const copyGrid = (grid: CellData[][] | null): CellData[][] | null =>
  grid ? grid.map((row) => row.map((cell) => ({ ...cell }))) : null;

const copyPlacements = (placements: PlannerPlacement[]): PlannerPlacement[] =>
  placements.map((p) => ({ ...p }));

const snapshotOf = (state: PlannerState): LayoutSnapshot => ({
  grid: copyGrid(state.grid),
  layoutWidth: state.layoutWidth,
  layoutHeight: state.layoutHeight,
  cellSize: state.cellSize,
  placements: copyPlacements(state.placements),
});

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
      return {
        ...state,
        grid: parseCellsJson(null, action.cols, action.rows),
        layoutWidth: action.cols,
        layoutHeight: action.rows,
        cellSize: action.cellSize,
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
      if (!state.shapeEditMode || !state.grid) return state;
      const currentActive = state.grid[action.row][action.col].active;
      const copy = copyGrid(state.grid)!;
      copy[action.row][action.col] = {
        ...copy[action.row][action.col],
        active: !currentActive,
      };
      return {
        ...state,
        grid: copy,
        isPainting: true,
        paintAction: !currentActive,
        isDirty: true,
      };
    }

    case 'PAINT_ENTER': {
      if (!state.isPainting || state.paintAction === null || !state.grid) {
        return state;
      }
      const copy = copyGrid(state.grid)!;
      copy[action.row][action.col] = {
        ...copy[action.row][action.col],
        active: state.paintAction,
      };
      return { ...state, grid: copy, isDirty: true };
    }

    case 'PAINT_END':
      return { ...state, isPainting: false, paintAction: null };

    case 'SET_ALL_CELLS': {
      if (!state.grid) return state;
      return {
        ...state,
        grid: state.grid.map((row) =>
          row.map((cell) => ({ ...cell, active: action.active }))
        ),
        isDirty: true,
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
        grid: [...state.grid, newRow],
        layoutHeight: state.layoutHeight + 1,
        isDirty: true,
      };
    }

    case 'ADD_COL_LEFT': {
      if (!state.grid) return state;
      return {
        ...state,
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
        grid: state.grid.map((row) => row.slice(0, -1)),
        layoutWidth: state.layoutWidth - 1,
        placements: filtered,
        isDirty: true,
        ...withRemoval(state, state.placements.length - filtered.length),
      };
    }

    case 'ADD_PLACEMENT':
      return {
        ...state,
        placements: [
          ...state.placements,
          {
            id: action.id,
            plantId: action.plantId,
            startRow: action.row,
            startCol: action.col,
            spanRows: 1,
            spanCols: 1,
            notes: null,
          },
        ],
        isDirty: true,
      };

    case 'REPLACE_PLACEMENT':
      return {
        ...state,
        placements: state.placements.map((p) =>
          p.id === action.placementId ? { ...p, plantId: action.plantId } : p
        ),
        isDirty: true,
      };

    case 'REMOVE_PLACEMENT':
      return {
        ...state,
        placements: state.placements.filter((p) => p.id !== action.placementId),
        isDirty: true,
      };

    case 'SET_SHAPE_EDIT_MODE':
      return { ...state, shapeEditMode: action.enabled };

    case 'ZOOM_IN':
      return { ...state, zoom: Math.min(2, state.zoom + 0.2) };

    case 'ZOOM_OUT':
      return { ...state, zoom: Math.max(0.5, state.zoom - 0.2) };

    case 'MARK_SAVED':
      return { ...state, isDirty: false, lastSaved: snapshotOf(state) };

    case 'RESTORE_LAST_SAVED': {
      if (!state.lastSaved) return state;
      const snap = state.lastSaved;
      return {
        ...state,
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
        grid: null,
        placements: [],
        layoutWidth: 0,
        layoutHeight: 0,
        isDirty: false,
      };

    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
