import type { TFunction } from 'i18next';
import type { FormulaRefusal } from '../../types/Dashboard';

/**
 * SMA-448, PR #293, fix round 2 (A1) — the refusal of a formula, in words:
 * the formula refused, then each reason the server served with its numbers —
 * how many gardens for how many at most, a garden of what size for what size
 * at most —, joined as the language lists things. No refusal is an empty
 * string, what a live region born empty says.
 *
 * Lot F3, L4 (R3-E1) — a switch that did not go through for another reason
 * says that reason, not a refusal: a session that expired says so (and the
 * surface offers to sign in again); a right the account lacks says the
 * right; a failure the server did not explain proposes to try again — the
 * one case where « réessayez » is true.
 *
 * ONE sentence for the two places a formula is chosen — the Customize panel,
 * and the choice of formula the chip opens — so a refusal cannot be said in
 * two ways.
 */
export function formulaRefusalText(refusal: FormulaRefusal | null, t: TFunction): string {
  if (!refusal) return '';
  const level = t(`dashboard.levels.${refusal.formula}.name`);
  switch (refusal.kind) {
    case 'unauthorized':
      return t('common.sessionExpired');
    case 'forbidden':
      return t('common.forbidden');
    case 'failed':
      return t('dashboard.panel.refusedNoReason', { level });
    case 'refused':
      break;
  }
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
