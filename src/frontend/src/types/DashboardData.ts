import type { PlacementData } from '../services/gardenLayoutApi';
import type { GardenConfig } from './Garden';

/**
 * SMA-336 PR 2/5 — the wire shape of `GET /api/dashboard`, the transport
 * aggregate that feeds the Gardens, Counters and Statistics widgets in one call.
 *
 * The server sends plans, not figures (decision D9): `cellsJson` and
 * `placements` arrive exactly as stored, and every derived number — active
 * cells, surface, occupancy, dominant exposure, the thumbnail — is computed
 * here by the pure functions in `utils/gardenStats` and `utils/gardenPreview`.
 */
export interface DashboardGardenData {
  id: string;
  name: string;
  /**
   * The garden's own description. Carried because the Gardens widget owns the
   * rename dialog, and `PUT /api/gardens/{id}` replaces name and description
   * together: without it the first rename would erase it.
   */
  description: string | null;
  width: number | null;
  height: number | null;
  cellSize: string | null;
  /** The sparse cell document, verbatim; null when no cell was ever painted. */
  cellsJson: string | null;
  /** Orientation, type, hemisphere, latitude band, indoor slots — the exposure inputs. */
  config: GardenConfig;
  updatedAt: string;
  placements: PlacementData[];
  placementCount: number;
  varietyCount: number;
  /** Sum of spanRows × spanCols — cells the plants take. */
  occupiedCells: number;
  /**
   * True when at least one placed variety is edible, false when the garden holds
   * placements and none is, NULL when the garden is empty. The third state is
   * the one that matters: an unplanted garden is neither, and calling it
   * ornamental would apply « never shows a harvest » to a garden nobody has
   * planted yet.
   */
  isEdible: boolean | null;
}

/** One row of the Counters widget: a variety, and how often it is planted. */
export interface DashboardVarietyData {
  plantId: string;
  scientificName: string;
  commonName: string | null;
  plantType: string | null;
  isEdible: boolean | null;
  /** A stable-source cover image, or null — the widget then draws its pastille. */
  imageUrl: string | null;
  /** Attribution for {@link imageUrl}; null exactly when it is. */
  imageAttribution: string | null;
  count: number;
  cells: number;
  /** Which gardens hold it — the per-garden filter of the widget. */
  gardenIds: string[];
}

export interface DashboardTotals {
  gardenCount: number;
  placementCount: number;
  /** DISTINCT varieties across every garden, not the sum of the per-garden counts. */
  varietyCount: number;
  catalogPlantCount: number;
}

export interface DashboardData {
  gardens: DashboardGardenData[];
  varieties: DashboardVarietyData[];
  totals: DashboardTotals;
}

/** What the page hands a widget while the aggregate is in flight or has failed. */
export const EMPTY_DASHBOARD_DATA: DashboardData = {
  gardens: [],
  varieties: [],
  totals: {
    gardenCount: 0,
    placementCount: 0,
    varietyCount: 0,
    catalogPlantCount: 0,
  },
};
