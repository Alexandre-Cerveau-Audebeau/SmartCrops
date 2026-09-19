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
 * `TodoBlock`, which grew its « Tailler » and « Semer » tasks in PR 4a/5),
 * Ce mois-ci in PR 4a/5 (`MonthBlock`) and Conseils in PR 4b/5 (`TipsBlock`).
 * Still here, and alone: Récolte (PR 5/5). It exists, it takes its place in
 * the grid, it can be moved, resized, hidden and brought back — and it says
 * honestly that its content is not there yet.
 *
 * One generic component rather than a dedicated file: the widget differs from
 * the six that left only by its icon and its two strings, and it is replaced
 * by a real body in its own lot — after which this component goes.
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
