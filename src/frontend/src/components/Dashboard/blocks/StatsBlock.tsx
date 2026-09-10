import { useMemo } from 'react';
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
  deriveGardenView,
  EXPOSURE_ORDER,
  sumExposureTallies,
} from '../../../utils/gardenStats';

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
  const { t } = useTranslation();

  const views = useMemo(
    () =>
      gardens.map((garden) => ({
        garden,
        view: deriveGardenView(garden),
      })),
    [gardens]
  );

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

  const sectionTitle = (label: string) => (
    <Typography
      sx={{
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: 'text.secondary',
      }}
    >
      {label}
    </Typography>
  );

  const surfaceText = (value: number) =>
    t('dashboard.blocks.stats.surface', { value: value.toFixed(1) });

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
              ? `${Math.round((distribution[category] / totalRated) * 100)} %`
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

  const freeCellsLine = (
    <Typography
      sx={{ fontSize: DASHBOARD_TYPE.secondary, color: 'text.secondary' }}
    >
      {t('dashboard.blocks.stats.freeCells', {
        count: totalFree,
        sunny: freeDistribution.full,
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
        {t('dashboard.blocks.stats.activeCells', {
          count: totalActive,
          occupied: totalOccupied,
        })}
      </Typography>
    </Box>
  );

  const smallBody = () => (
    <Box
      sx={{
        flex: 1,
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
