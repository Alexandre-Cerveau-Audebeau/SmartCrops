import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSelection } from './useSelection';
import type { PlannerPlacement } from '../pages/gardenPlanner/plannerReducer';

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

describe('useSelection', () => {
  it('selects a placement by id and clears it', () => {
    // The armed-plant half moved to the reducer in 5.5 (SMA-193) — its
    // arming/disarming coverage lives in plannerReducer.test.ts now.
    const placements = [placement('a'), placement('b')];
    const { result } = renderHook(() => useSelection(placements));

    act(() => {
      result.current.selectPlacement('b');
    });
    expect(result.current.selectedPlacement?.id).toBe('b');

    act(() => result.current.clearSelection());
    expect(result.current.selectedPlacementId).toBeNull();
    expect(result.current.selectedPlacement).toBeNull();
  });

  it('selection survives a placements-array rebuild that keeps the id (layout refresh)', () => {
    const { result, rerender } = renderHook(
      ({ placements }: { placements: PlannerPlacement[] }) =>
        useSelection(placements),
      { initialProps: { placements: [placement('srv-1')] } }
    );

    act(() => result.current.selectPlacement('srv-1'));
    expect(result.current.selectedPlacement?.startRow).toBe(0);

    // Fresh array, fresh objects, same id — e.g. an ADD_ROW_TOP shift or a
    // re-hydration of the same saved layout.
    rerender({
      placements: [placement('srv-1', { startRow: 1 })],
    });
    expect(result.current.selectedPlacement?.id).toBe('srv-1');
    expect(result.current.selectedPlacement?.startRow).toBe(1);
  });

  it('degrades gracefully when the selected placement disappears', () => {
    const { result, rerender } = renderHook(
      ({ placements }: { placements: PlannerPlacement[] }) =>
        useSelection(placements),
      { initialProps: { placements: [placement('srv-1'), placement('srv-2')] } }
    );

    act(() => result.current.selectPlacement('srv-2'));
    expect(result.current.selectedPlacement?.id).toBe('srv-2');

    // The selected placement is removed (e.g. dropped by a shrink). Both the
    // derived object AND the stored id must clear — a stale id would silently
    // re-select a later placement reusing it (develop-store review F1/F2).
    rerender({ placements: [placement('srv-1')] });
    expect(result.current.selectedPlacement).toBeNull();
    expect(result.current.selectedPlacementId).toBeNull();

    // And selecting something else afterwards still works.
    act(() => result.current.selectPlacement('srv-1'));
    expect(result.current.selectedPlacement?.id).toBe('srv-1');
  });

  it('a reintroduced placement with a previously-selected id does not auto-reselect (SMA-288 R2 pin)', () => {
    const { result, rerender } = renderHook(
      ({ placements }: { placements: PlannerPlacement[] }) =>
        useSelection(placements),
      { initialProps: { placements: [placement('srv-1'), placement('srv-2')] } }
    );

    act(() => result.current.selectPlacement('srv-2'));
    expect(result.current.selectedPlacement?.id).toBe('srv-2');

    // Removal degrades the selection to null AND purges the stored id
    // (render-time adjust)...
    rerender({ placements: [placement('srv-1')] });
    expect(result.current.selectedPlacement).toBeNull();
    expect(result.current.selectedPlacementId).toBeNull();

    // ...so a LATER placement reusing the same id does NOT become selected
    // without an explicit new selection.
    rerender({ placements: [placement('srv-1'), placement('srv-2')] });
    expect(result.current.selectedPlacement).toBeNull();
    expect(result.current.selectedPlacementId).toBeNull();

    // Explicit re-selection still works.
    act(() => result.current.selectPlacement('srv-2'));
    expect(result.current.selectedPlacement?.id).toBe('srv-2');
  });
});
