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
 * SMA-336 PR 1/5 — the widgets whose DATA lands in a later lot. Seven at PR
 * 1/5; Compteurs and Statistiques left the list in PR 2/5, Météo and À faire
 * in PR 3b/5 (`WeatherBlock`, with the « Ville » field the geocoding endpoint
 * of PR 3a/5 now stands behind — decision R4 honoured, then lifted;
 * `TodoBlock`, which grew its « Tailler » and « Semer » tasks in PR 4a/5), and
 * Ce mois-ci in PR 4a/5 (`MonthBlock`). Still here: Conseils (PR 4b/5) and
 * Récolte (PR 5/5). They exist, they take their place in the grid, they can be
 * moved, resized, hidden and brought back — and they say honestly that their
 * content is not there yet.
 *
 * One generic component rather than near-identical files: the widgets differ
 * only by their icon and their two strings, and every one of them is replaced
 * by a real body in its own lot.
 *
 * The « soon » variant carries no gesture ON PURPOSE (PR 1/5 doctrine): a
 * field that accepts an input and does nothing with it is worse than saying
 * « bientôt ».
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
