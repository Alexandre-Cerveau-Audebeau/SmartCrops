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
  it('selects a placement by id and clears both selections', () => {
    const placements = [placement('a'), placement('b')];
    const { result } = renderHook(() => useSelection(placements));

    act(() => {
      result.current.selectPlant('basil');
      result.current.selectPlacement('b');
    });
    expect(result.current.selectedPlantId).toBe('basil');
    expect(result.current.selectedPlacement?.id).toBe('b');

    act(() => result.current.clearSelection());
    expect(result.current.selectedPlantId).toBeNull();
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

    // The selected placement is removed (e.g. dropped by a shrink).
    rerender({ placements: [placement('srv-1')] });
    expect(result.current.selectedPlacement).toBeNull();

    // And selecting something else afterwards still works.
    act(() => result.current.selectPlacement('srv-1'));
    expect(result.current.selectedPlacement?.id).toBe('srv-1');
  });
});
