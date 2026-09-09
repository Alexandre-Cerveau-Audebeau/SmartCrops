import { useTranslation } from 'react-i18next';
import DashboardBlock from '../DashboardBlock';
import InviteState from '../InviteState';
import { BLOCK_ICONS } from '../blockIcons';
import type { DashboardBlockKey, DashboardSize } from '../../../types/Dashboard';

interface Props {
  blockKey: DashboardBlockKey;
  size: DashboardSize;
  editing?: boolean;
}

/**
 * SMA-336 PR 1/5 — the seven widgets whose DATA lands in a later lot: Météo,
 * Conseils, Ce mois-ci, À faire, Compteurs, Statistiques, Récolte. They exist,
 * they take their place in the grid, they can be moved, resized, hidden and
 * brought back — and they say honestly that their content is not there yet.
 *
 * One generic component rather than seven near-identical files: the widgets
 * differ only by their icon and their two strings, and every one of them is
 * replaced by a real body in PR ② / ③ / ⑤.
 *
 * The « soon » variant carries no gesture ON PURPOSE. The frozen design gives
 * Météo a « Ville ou code postal » field, but the geocoding endpoint that would
 * make it work lands in PR ③ (orchestrator decision R4): a field that accepts
 * a city and does nothing with it is worse than saying « bientôt ».
 */
export default function InviteBlock({ blockKey, size, editing }: Props) {
  const { t } = useTranslation();
  const Icon = BLOCK_ICONS[blockKey];

  return (
    <DashboardBlock
      blockKey={blockKey}
      title={t(`dashboard.blocks.${blockKey}.title`)}
      size={size}
      editing={editing}
    >
      <InviteState
        icon={<Icon />}
        message={t(`dashboard.blocks.${blockKey}.invite`)}
        variant="soon"
      />
    </DashboardBlock>
  );
}
