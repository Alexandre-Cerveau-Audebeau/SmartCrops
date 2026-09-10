import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import DashboardBlock from '../DashboardBlock';
import ExposureDot from '../ExposureDot';
import InviteState from '../InviteState';
import MissingDataMark from '../MissingDataMark';
import OccupancyBar from '../OccupancyBar';
import { DASHBOARD_TYPE } from '../../../theme/dashboardTokens';
import type { DashboardSize } from '../../../types/Dashboard';
import type { DashboardGardenData } from '../../../types/DashboardData';
import {
  DASHBOARD_MOMENT,
  DASHBOARD_SEASON,
  EXPOSURE_ORDER,
  sumExposureTallies,
} from '../../../utils/gardenStats';
import { useGardenViews } from '../../../hooks/useGardenViews';
import { formatCount, formatDecimal } from '../../../utils/formatNumber';

interface Props {
  size: DashboardSize;
  editing?: boolean;
  gardens: DashboardGardenData[];
  loading: boolean;
  loadError: boolean;
  onRetry: () => void;
}

/**
 * SMA-336 PR 2/5 — « Statistics »: the three sections of the frozen design —
 * occupancy per garden, the dominant exposure across everything, and exposure
 * per garden — plus the active surface and the free-cell count.
 *
 * Every figure is derived here, from the plans the aggregate transports. The
 * exposure engine is asked for SUMMER at NOON and nothing else (decision D12),
 * and the header says so: the planner lets a user pick the season and the
 * moment, this widget has no such control, and deriving them from a clock would
 * make the numbers change under someone who changed nothing.
 *
 * A garden with no saved layout has neither a surface nor an exposure. It still
 * appears — with a marker where its figures would be, rather than a zero. Zero
 * is a measurement; « not drawn yet » is not.
 */
export default function StatsBlock({
  size,
  editing,
  gardens,
  loading,
  loadError,
  onRetry,
}: Props) {
  const { t, i18n } = useTranslation();

  // The SAME views the Gardens widget reads (round 1, E22): both are on an
  // Expert page at once, and the exposure engine used to run twice per garden
  // per load because each widget derived its own copy.
  const byId = useGardenViews(gardens);
  const views = gardens.map((garden) => ({
    garden,
    view: byId.get(garden.id)!,
  }));

  const planned = views.filter((entry) => entry.view.hasPlan);
  const totalSurface = planned.reduce(
    (sum, entry) => sum + entry.view.surfaceM2,
    0
  );
  const totalActive = planned.reduce(
    (sum, entry) => sum + entry.view.activeCells,
    0
  );
  const totalOccupied = planned.reduce(
    (sum, entry) => sum + entry.view.occupiedCells,
    0
  );
  const totalFree = planned.reduce((sum, entry) => sum + entry.view.freeCells, 0);
  const distribution = sumExposureTallies(planned.map((e) => e.view.exposure));
  const freeDistribution = sumExposureTallies(
    planned.map((e) => e.view.freeExposure)
  );
  const totalRated =
    distribution.full +
    distribution.morning +
    distribution.afternoon +
    distribution.shade;

  /**
   * One section label of a Large card.
   *
   * A HEADING, not styled text (round 1, E13). A Large card carries three of
   * these, each introducing its own list of rows; as bare `Typography` a screen
   * reader met three unlabelled groups with no way to jump between them. The
   * widget card's own title is the `h2` that `DashboardBlock` renders, so these
   * sit one level below it. `h3` changes nothing on screen — the styling is
   * unchanged and the existing tests select them by text.
   */
  const sectionTitle = (label: string) => (
    <Typography
      component="h3"
      sx={{
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: 'text.secondary',
        m: 0,
      }}
    >
      {label}
    </Typography>
  );

  // Locale-formatted, never `toFixed` (round 1, G5): `toFixed` always writes a
  // point, so the French widget printed « 1.8 m² » where the language uses a
  // comma. One fractional digit, as the frozen design has it.
  const surfaceText = (value: number) =>
    t('dashboard.blocks.stats.surface', {
      value: formatDecimal(value, i18n.language, 1),
    });

  const occupancyRows = (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      {views.map(({ garden, view }) => (
        <Box
          key={garden.id}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            minHeight: 42,
          }}
        >
          <Typography
            sx={{
              flex: 1,
              minWidth: 0,
              fontSize: DASHBOARD_TYPE.body,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {garden.name}
          </Typography>
          {view.hasPlan ? (
            <OccupancyBar percent={view.occupancyPercent} />
          ) : (
            <MissingDataMark label={t('dashboard.blocks.stats.noPlan')} />
          )}
        </Box>
      ))}
    </Box>
  );

  const distributionRows = (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      {EXPOSURE_ORDER.map((category) => (
        <Box
          key={category}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            minHeight: 42,
          }}
        >
          <ExposureDot category={category} />
          <Typography sx={{ flex: 1, fontSize: DASHBOARD_TYPE.body }}>
            {/* The LONG label here — « afternoon sun », not « afternoon ». The
                short form exists for the table, where the column is 51 px. */}
            {t(`planner.exposure.categories.${category}`)}
          </Typography>
          <Typography
            sx={{ fontSize: DASHBOARD_TYPE.body, fontWeight: 700 }}
          >
            {totalRated > 0
              ? `${formatCount(Math.round((distribution[category] / totalRated) * 100), i18n.language)} %`
              : '—'}
          </Typography>
        </Box>
      ))}
    </Box>
  );

  const perGardenExposureRows = (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      {views.map(({ garden, view }) => (
        <Box
          key={garden.id}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            minHeight: 42,
          }}
        >
          <Typography
            sx={{
              flex: 1,
              minWidth: 0,
              fontSize: DASHBOARD_TYPE.body,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {garden.name}
          </Typography>
          {view.dominantExposure ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ExposureDot category={view.dominantExposure} />
              <Typography sx={{ fontSize: DASHBOARD_TYPE.body }}>
                {t(`planner.exposure.categories.${view.dominantExposure}`)}
              </Typography>
            </Box>
          ) : (
            <MissingDataMark label={t('dashboard.blocks.stats.noPlan')} />
          )}
        </Box>
      ))}
    </Box>
  );

  /**
   * « N cases libres, dont M en plein soleil » — two counts, each with its own
   * cardinality (round 1, E15 / E16 / G7).
   *
   * i18next selects a plural form from ONE variable, `count`, so a sentence
   * carrying two numbers could only ever agree with the first: « 1 cases libres,
   * dont 1 en plein soleil ». Each count is rendered by its own plural-aware key
   * and the wrapper only joins the two fragments.
   */
  const freeCellsLine = (
    <Typography
      sx={{ fontSize: DASHBOARD_TYPE.secondary, color: 'text.secondary' }}
    >
      {t('dashboard.blocks.stats.freeCells', {
        free: t('dashboard.blocks.stats.freeCellsCount', { count: totalFree }),
        sunny: t('dashboard.blocks.stats.sunnyCount', {
          count: freeDistribution.full,
        }),
      })}
    </Typography>
  );

  const headline = (
    <Box>
      <Typography
        sx={{ fontSize: DASHBOARD_TYPE.big, fontWeight: 800, lineHeight: 1.1 }}
      >
        {surfaceText(totalSurface)}
      </Typography>
      <Typography
        sx={{ fontSize: DASHBOARD_TYPE.secondary, color: 'text.secondary' }}
      >
        {/* Same two-count rule as the free-cell line above. */}
        {t('dashboard.blocks.stats.activeCells', {
          active: t('dashboard.blocks.stats.activeCellsCount', {
            count: totalActive,
          }),
          occupied: t('dashboard.blocks.stats.occupiedCount', {
            count: totalOccupied,
          }),
        })}
      </Typography>
    </Box>
  );

  const smallBody = () => (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      {headline}
      {freeCellsLine}
    </Box>
  );

  const mediumBody = () => (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      {headline}
      {sectionTitle(t('dashboard.blocks.stats.occupancySection'))}
      {occupancyRows}
      {freeCellsLine}
    </Box>
  );

  const largeBody = () => (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      {headline}
      {sectionTitle(t('dashboard.blocks.stats.occupancySection'))}
      {occupancyRows}
      {sectionTitle(
        t('dashboard.blocks.stats.exposureSection', {
          season: t(`planner.exposure.seasons.${DASHBOARD_SEASON}`),
          moment: t(`planner.exposure.moments.${DASHBOARD_MOMENT}`),
        })
      )}
      {distributionRows}
      {sectionTitle(t('dashboard.blocks.stats.perGardenExposureSection'))}
      {perGardenExposureRows}
      {freeCellsLine}
    </Box>
  );

  const body = () => {
    if (loading) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} variant="rounded" height={42} />
          ))}
        </Box>
      );
    }

    if (loadError) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Typography
            sx={{ fontSize: DASHBOARD_TYPE.body, color: 'text.secondary' }}
          >
            {t('dashboard.loadError')}
          </Typography>
          <Button size="small" onClick={onRetry}>
            {t('dashboard.retry')}
          </Button>
        </Box>
      );
    }

    if (gardens.length === 0) {
      return (
        <InviteState
          icon={<InsightsOutlinedIcon />}
          message={t('dashboard.blocks.stats.empty')}
          variant="catalogue"
        />
      );
    }

    if (planned.length === 0) {
      // Every garden exists but none has a layout: there is a gesture, and it
      // is in the planner, so this one is an invitation rather than a statement.
      return (
        <InviteState
          icon={<InsightsOutlinedIcon />}
          message={t('dashboard.blocks.stats.noPlans')}
          variant="catalogue"
        />
      );
    }

    if (size === 'small') return smallBody();
    if (size === 'medium') return mediumBody();
    return largeBody();
  };

  return (
    <DashboardBlock
      blockKey="stats"
      title={t('dashboard.blocks.stats.title')}
      size={size}
      editing={editing}
    >
      {body()}
    </DashboardBlock>
  );
}
