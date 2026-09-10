import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import GrassOutlinedIcon from '@mui/icons-material/GrassOutlined';
import DashboardBlock from '../DashboardBlock';
import InviteState from '../InviteState';
import { DASHBOARD_TYPE } from '../../../theme/dashboardTokens';
import { useDashboardTokens } from '../../../theme/useDashboardTokens';
import type { DashboardSize } from '../../../types/Dashboard';
import type {
  DashboardGardenData,
  DashboardTotals,
  DashboardVarietyData,
} from '../../../types/DashboardData';
import { isEdibleVariety } from '../../../utils/gardenStats';
import { getPlantColor } from '../../../utils/plantColor';
import { PLANT_HERO_PLACEHOLDER } from '../../../utils/plantDetail';
import {
  COUNTERS_GARDEN_ALL,
  countersOptions,
} from './countersOptions';

/** Varieties a Medium card lists before « +N » (_spec.md 4). */
const MEDIUM_ROWS = 8;
/** Data rows a Large card lists, across its two columns (_spec.md 4). */
const LARGE_ROWS = 19;

const AVATAR_PX = 34;

interface Props {
  size: DashboardSize;
  editing?: boolean;
  /** The widget's own settings, as stored on the block (`photos`, `garden`). */
  options: Record<string, unknown> | null;
  varieties: DashboardVarietyData[];
  gardens: DashboardGardenData[];
  totals: DashboardTotals;
  loading: boolean;
  loadError: boolean;
  onRetry: () => void;
}

/**
 * SMA-336 PR 2/5 — « Counts by variety »: what is planted, and how much of it.
 *
 * The numbers come straight from the aggregate's `GROUP BY PlantId`; nothing
 * here recounts them. What the widget decides is the SPLIT: edible varieties
 * first, ornamental ones under their own heading, by rule R4 — a variety is
 * edible when its catalog type says so OR its own flag does, because on the
 * real catalog the two signals disagree in both directions.
 *
 * Pastilles by default, photos behind the option. The frozen design draws both
 * states and means both: a colour hash costs nothing and is always there, while
 * twenty photos are twenty requests to a third party for images served at their
 * original size, a quarter of which have no photo to serve.
 */
export default function CountersBlock({
  size,
  editing,
  options,
  varieties,
  gardens,
  totals,
  loading,
  loadError,
  onRetry,
}: Props) {
  const { t } = useTranslation();
  const tk = useDashboardTokens();
  const { photos, garden: gardenOption } = countersOptions(options);

  // A filter naming a garden that has since been deleted must not empty the
  // widget with no way back: the chip row would no longer offer that garden,
  // so the user could not clear it.
  const activeGarden =
    gardenOption !== COUNTERS_GARDEN_ALL &&
    gardens.some((g) => g.id === gardenOption)
      ? gardenOption
      : COUNTERS_GARDEN_ALL;

  const [expanded, setExpanded] = useState(false);

  const filtered = useMemo(
    () =>
      activeGarden === COUNTERS_GARDEN_ALL
        ? varieties
        : varieties.filter((v) => v.gardenIds.includes(activeGarden)),
    [varieties, activeGarden]
  );

  const displayName = (variety: DashboardVarietyData) =>
    variety.commonName ?? variety.scientificName;

  const avatar = (variety: DashboardVarietyData) => {
    const colour = getPlantColor(variety.plantId);
    if (!photos) {
      return (
        <Avatar
          aria-hidden
          sx={{
            width: AVATAR_PX,
            height: AVATAR_PX,
            fontSize: 14.5,
            fontWeight: 800,
            bgcolor: colour,
          }}
        >
          {displayName(variety).charAt(0).toUpperCase()}
        </Avatar>
      );
    }
    return (
      <Avatar
        aria-hidden
        src={variety.imageUrl ?? PLANT_HERO_PLACEHOLDER}
        // A quarter of the placed varieties have no stable photo; the brand
        // placeholder is a data URI that cannot itself fail, and the dataset
        // flag stops a broken URL from looping through the handler.
        slotProps={{
          img: {
            onError: (event) => {
              const img = event.currentTarget as HTMLImageElement;
              if (img.dataset.fallback) return;
              img.dataset.fallback = '1';
              img.src = PLANT_HERO_PLACEHOLDER;
            },
          },
        }}
        sx={{
          width: AVATAR_PX,
          height: AVATAR_PX,
          bgcolor: tk.avatarFill,
        }}
      />
    );
  };

  const row = (variety: DashboardVarietyData) => (
    <Box
      key={variety.plantId}
      sx={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: 42 }}
    >
      {avatar(variety)}
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
        {displayName(variety)}
      </Typography>
      <Typography
        sx={{ fontSize: DASHBOARD_TYPE.body, fontWeight: 800 }}
      >
        {`× ${variety.count}`}
      </Typography>
    </Box>
  );

  const libraryLink = (
    <Button
      size="small"
      component={RouterLink}
      to="/library"
      sx={{ alignSelf: 'flex-start', fontSize: DASHBOARD_TYPE.link }}
    >
      {t('dashboard.blocks.counters.addFromLibrary')}
    </Button>
  );

  const moreButton = (hidden: number) =>
    hidden > 0 ? (
      <Button
        size="small"
        onClick={() => setExpanded(true)}
        sx={{ alignSelf: 'flex-start', fontSize: DASHBOARD_TYPE.link }}
      >
        {t('dashboard.blocks.counters.more', { count: hidden })}
      </Button>
    ) : null;

  const gardenFilter = gardens.length > 1 && (
    <Box sx={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
      <Chip
        label={t('dashboard.blocks.counters.allGardens')}
        size="small"
        variant={activeGarden === COUNTERS_GARDEN_ALL ? 'filled' : 'outlined'}
        sx={{ height: DASHBOARD_TYPE.chipHeight, fontSize: DASHBOARD_TYPE.chip }}
      />
      {gardens.map((g) => (
        <Chip
          key={g.id}
          label={g.name}
          size="small"
          variant={activeGarden === g.id ? 'filled' : 'outlined'}
          sx={{
            height: DASHBOARD_TYPE.chipHeight,
            fontSize: DASHBOARD_TYPE.chip,
          }}
        />
      ))}
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
      <Box>
        <Typography
          sx={{ fontSize: DASHBOARD_TYPE.big, fontWeight: 800, lineHeight: 1.1 }}
        >
          {totals.placementCount}
        </Typography>
        <Typography
          sx={{ fontSize: DASHBOARD_TYPE.secondary, color: 'text.secondary' }}
        >
          {t('dashboard.blocks.counters.plants', {
            count: totals.placementCount,
          })}
        </Typography>
      </Box>
      <Typography
        sx={{ fontSize: DASHBOARD_TYPE.secondary, color: 'text.secondary' }}
      >
        {t('dashboard.blocks.counters.ofCatalog', {
          count: totals.varietyCount,
          catalog: totals.catalogPlantCount,
        })}
      </Typography>
    </Box>
  );

  const listBody = (limit: number, columns: number) => {
    const shown = expanded ? filtered : filtered.slice(0, limit);
    const hidden = filtered.length - shown.length;
    const shownEdible = shown.filter(isEdibleVariety);
    const shownOrnamental = shown.filter((v) => !isEdibleVariety(v));

    return (
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
        {gardenFilter}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            columnGap: '16px',
          }}
        >
          {shownEdible.map(row)}
        </Box>
        {shownOrnamental.length > 0 && (
          <>
            {/* Its own heading, never mixed in: a gardener counting what they
                will eat should not have to read past the ferns. */}
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: 'text.secondary',
                mt: '4px',
              }}
            >
              {t('dashboard.blocks.counters.ornamentalSection')}
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                columnGap: '16px',
              }}
            >
              {shownOrnamental.map(row)}
            </Box>
          </>
        )}
        {moreButton(hidden)}
        {libraryLink}
      </Box>
    );
  };

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

    if (varieties.length === 0) {
      return (
        <InviteState
          icon={<GrassOutlinedIcon />}
          message={t('dashboard.blocks.counters.empty')}
          action={libraryLink}
        />
      );
    }

    if (filtered.length === 0) {
      // The catalogue variant: an honest statement with no gesture to offer —
      // the garden simply holds nothing yet, and the filter above is the way
      // back.
      return (
        <Box
          sx={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}
        >
          {gardenFilter}
          <InviteState
            icon={<GrassOutlinedIcon />}
            message={t('dashboard.blocks.counters.emptyGarden')}
            variant="catalogue"
          />
        </Box>
      );
    }

    if (size === 'small') return smallBody();
    if (size === 'medium') return listBody(MEDIUM_ROWS, 1);
    return listBody(LARGE_ROWS, 2);
  };

  const countChip =
    !loading && !loadError && varieties.length > 0 ? (
      <Chip
        // DISTINCT varieties (decision D11), which is what the aggregate's
        // totals already count: a variety planted in two gardens is one variety.
        label={t('dashboard.blocks.counters.varieties', {
          count: totals.varietyCount,
        })}
        size="small"
        variant="outlined"
        sx={{ height: DASHBOARD_TYPE.chipHeight, fontSize: DASHBOARD_TYPE.chip }}
      />
    ) : undefined;

  return (
    <DashboardBlock
      blockKey="counters"
      title={t('dashboard.blocks.counters.title')}
      size={size}
      editing={editing}
      chip={countChip}
    >
      {body()}
    </DashboardBlock>
  );
}
