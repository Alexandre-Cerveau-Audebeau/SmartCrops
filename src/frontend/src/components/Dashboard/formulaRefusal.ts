import type { TFunction } from 'i18next';
import type { FormulaRefusal } from '../../types/Dashboard';

/**
 * SMA-448, PR #293, fix round 2 (A1) — the refusal of a formula, in words:
 * the formula refused, then each reason the server served with its numbers —
 * how many gardens for how many at most, a garden of what size for what size
 * at most —, joined as the language lists things. A refusal the server did
 * not explain names the formula alone; no refusal is an empty string, what a
 * live region born empty says.
 *
 * ONE sentence for the two places a formula is chosen — the Customize panel,
 * and the Novice page's provisional chooser (lot F2, N3) — so a refusal
 * cannot be said in two ways.
 */
export function formulaRefusalText(refusal: FormulaRefusal | null, t: TFunction): string {
  if (!refusal) return '';
  const level = t(`dashboard.levels.${refusal.formula}.name`);
  if (refusal.reasons.length === 0) return t('dashboard.panel.refusedNoReason', { level });
  return t('dashboard.panel.refused', {
    level,
    reasons: refusal.reasons.map((reason) =>
      reason.kind === 'gardens'
        ? t('dashboard.panel.reasonGardens', { count: reason.have, limit: reason.limit })
        : t('dashboard.panel.reasonSize', {
            width: reason.width,
            height: reason.height,
            maxWidth: reason.maxWidth,
            maxHeight: reason.maxHeight,
          })
    ),
  });
}
