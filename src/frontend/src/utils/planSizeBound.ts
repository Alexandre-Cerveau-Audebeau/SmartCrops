import type { DashboardLevel, FormulasCatalog } from '../types/Dashboard';
import { ownFormula } from '../hooks/useFormulas';

/** The size a plan may be grown to, and why. */
export interface PlanSizeBound {
  /** The account's formula. */
  formula: DashboardLevel;
  /** The formula's largest size. */
  limit: { width: number; height: number };
  /** The columns the plan may reach: the larger of the formula's width and the stored one. */
  cols: number;
  /** The rows the plan may reach: the larger of the formula's height and the stored one. */
  rows: number;
  /** The stored plan is already beyond the formula in at least one dimension — kept, shrinkable, never grown (« Votre formule — conservée »). */
  kept: boolean;
}

/**
 * SMA-448, lot F3, step L3 — the rule the server applies to
 * `PUT /api/gardens/{id}/layout` (`GardensController.SaveLayout`), on the
 * client, so the planner never offers what the server would refuse: the
 * bound of each dimension is the larger of the formula's limit and the size
 * the garden is STORED at — a garden already beyond its formula keeps its
 * size and may shrink, but never grows (Alexandre, 22/09 18:02, the limits
 * apply going forward only). Null while the catalogue is not read: the
 * planner then bounds nothing of its own, and the server's refusal says why.
 */
export function planSizeBound(
  catalog: FormulasCatalog | null,
  stored: { width: number; height: number } | null
): PlanSizeBound | null {
  const formula = ownFormula(catalog);
  if (!formula) return null;
  const limit = formula.maxGardenSize;
  const cols = Math.max(limit.width, stored?.width ?? 0);
  const rows = Math.max(limit.height, stored?.height ?? 0);
  return {
    formula: formula.key,
    limit: { width: limit.width, height: limit.height },
    cols,
    rows,
    kept: cols > limit.width || rows > limit.height,
  };
}
