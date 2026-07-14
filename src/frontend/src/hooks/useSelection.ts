import { useCallback, useMemo, useState } from 'react';
import type { PlannerPlacement } from '../pages/gardenPlanner/plannerReducer';

/**
 * Planner selection state (5.1-B): the armed sidebar plant and the selected
 * placement, held by ID instead of array index. ID-based selection survives
 * placement-array rebuilds (row/column shifts, layout refreshes) as long as
 * the placement itself survives, and degrades gracefully when it does not:
 * `selectedPlacement` derives to null and the detail panel simply closes.
 */
export function useSelection(placements: PlannerPlacement[]) {
  const [selectedPlantId, setSelectedPlantId] = useState<string | null>(null);
  const [selectedPlacementId, setSelectedPlacementId] = useState<
    string | null
  >(null);

  const selectedPlacement = useMemo(
    () => placements.find((p) => p.id === selectedPlacementId) ?? null,
    [placements, selectedPlacementId]
  );

  const selectPlant = useCallback(
    (plantId: string | null) => setSelectedPlantId(plantId),
    []
  );
  const selectPlacement = useCallback(
    (placementId: string | null) => setSelectedPlacementId(placementId),
    []
  );
  const clearSelection = useCallback(() => {
    setSelectedPlantId(null);
    setSelectedPlacementId(null);
  }, []);

  return {
    selectedPlantId,
    selectPlant,
    selectedPlacementId,
    selectPlacement,
    selectedPlacement,
    clearSelection,
  };
}
