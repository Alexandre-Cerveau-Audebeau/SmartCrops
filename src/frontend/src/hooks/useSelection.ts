import { useCallback, useMemo, useState } from 'react';
import type { PlannerPlacement } from '../pages/gardenPlanner/plannerReducer';

/**
 * Planner selection state (5.1-B): the armed sidebar plant and the selected
 * placement, held by ID instead of array index. ID-based selection survives
 * placement-array rebuilds (row/column shifts, layout refreshes) as long as
 * the placement itself survives, and degrades gracefully when it does not:
 * `selectedPlacement` derives to null, the detail panel closes, and the
 * EXPOSED `selectedPlacementId` derives to null with it (F2, develop-store
 * review on ef076f0) — consumers can never observe a selection that no longer
 * exists. The reconciliation is derived rather than a state-clearing effect
 * because `react-hooks/set-state-in-effect` forbids the effect variant (same
 * lint precedent as the #169 cycle); reducer-driven removals additionally
 * clear the stored id via the removal-toast `selectPlacement(null)`.
 */
export function useSelection(placements: PlannerPlacement[]) {
  const [selectedPlantId, setSelectedPlantId] = useState<string | null>(null);
  const [storedPlacementId, setStoredPlacementId] = useState<string | null>(
    null
  );

  // Purge the STORED id the moment its placement leaves the collection —
  // React's render-time adjust pattern (no effect, so no
  // react-hooks/set-state-in-effect surface). Without this, a later
  // placement REUSING the id would silently re-select itself (SMA-288 R2,
  // Extension finding on ef076f0).
  const [prevPlacements, setPrevPlacements] = useState(placements);
  if (placements !== prevPlacements) {
    setPrevPlacements(placements);
    if (
      storedPlacementId !== null &&
      !placements.some((p) => p.id === storedPlacementId)
    ) {
      setStoredPlacementId(null);
    }
  }

  const selectedPlacement = useMemo(
    () => placements.find((p) => p.id === storedPlacementId) ?? null,
    [placements, storedPlacementId]
  );

  // Never expose a stale id: when the stored id no longer resolves to a live
  // placement, the public id is null in the SAME commit — no effect, no
  // cascading render, no window where a future placement reusing the id could
  // be silently re-selected through a consumer's eyes.
  const selectedPlacementId = selectedPlacement?.id ?? null;

  const selectPlant = useCallback(
    (plantId: string | null) => setSelectedPlantId(plantId),
    []
  );
  const selectPlacement = useCallback(
    (placementId: string | null) => setStoredPlacementId(placementId),
    []
  );
  const clearSelection = useCallback(() => {
    setSelectedPlantId(null);
    setStoredPlacementId(null);
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
