import { useState } from 'react';
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
import { formatCount } from '../../../utils/formatNumber';
import { isEdibleVariety } from '../../../utils/gardenStats';
import { getPlantColor } from '../../../utils/plantColor';
import { PLANT_HERO_PLACEHOLDER } from '../../../utils/plantDetail';
import {
  COUNTERS_GARDEN_ALL,
  countersOptions,
  resolveCountersGarden,
} from './countersOptions';

/**
 * Varieties a Medium card lists before « +N », and in how many columns
 * (`_spec.md` § 4: « Compteurs 4 × 2 = 8 variétés + « +18 variétés » »).
 *
 * V9 — the count was right and the COLUMNS were wrong. Eight varieties drawn in
 * one column are eight data lines on a card whose density lock allows six, so
 * the body scrolled instead of capping. Two columns of four is what the frozen
 * design draws and what the lock permits: 8 / 2 = 4 lines.
 */
const MEDIUM_VARIETIES = 8;
const MEDIUM_COLUMNS = 2;

/**
 * Varieties a Large card lists, across its two columns (`_spec.md` § 4: « les
 * 19 potagères en deux colonnes »). 19 over two columns is 10 lines, which is
 * exactly the Large lock.
 */
const LARGE_VARIETIES = 19;
const LARGE_COLUMNS = 2;

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
  /**
   * Writes the block's own `options` document — the SAME one
   * `CountersOptionsPanel` writes (round 1, E7).
   *
   * Optional so the widget still renders where nobody can persist a layout;
   * without it the filter chips are not drawn as a selection at all, because a
   * selection nobody can change is a lie the styling tells.
   */
  onOptionsChange?: (options: Record<string, unknown>) => void;
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
  onOptionsChange,
}: Props) {
  const { t, i18n } = useTranslation();
  const tk = useDashboardTokens();
  const { photos, garden: gardenOption } = countersOptions(options);

  // A filter naming a garden that has since been deleted must not empty the
  // widget with no way back: the chip row would no longer offer that garden,
  // so the user could not clear it. ONE owner for that rule since round 1 (E8)
  // — the options panel resolves it with the same call.
  const activeGarden = resolveCountersGarden(gardenOption, gardens);

  const [expanded, setExpanded] = useState(false);

  // NOT memoized, deliberately. `activeGarden` now comes from
  // `resolveCountersGarden` — an imported function — and the React Compiler
  // rules refuse to preserve a `useMemo` whose dependency it cannot prove
  // immutable, so keeping one here failed `npm run lint` outright. The cost of
  // dropping it is one `Array.filter` over the caller's varieties per render,
  // against a body that maps every surviving variety to DOM on the same render.
  const filtered =
    activeGarden === COUNTERS_GARDEN_ALL
      ? varieties
      : varieties.filter((v) => v.gardenIds.includes(activeGarden));

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
        {/* Locale-formatted (round 1, G5): a four-digit count concatenated
            into a template literal reads « 1440 » in a French widget that
            groups it « 1 440 » two lines above. */}
        {`× ${formatCount(variety.count, i18n.language)}`}
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

  /** Writes the same `options` document the panel writes — see `Props`. */
  const selectGarden = (garden: string) =>
    onOptionsChange ? () => onOptionsChange({ photos, garden }) : undefined;

  /**
   * The per-garden filter, as the frozen design draws it on the LARGE card
   * (artboard A3): « Tous les jardins » filled, one outlined chip per garden.
   *
   * Round 1, E7 — the chips now DO what their filled-and-outlined styling says.
   * A `Chip` with no `onClick` is not focusable and not clickable, so the row
   * drew the standard MUI single-select affordance over nothing: a user with a
   * stored filter on a deleted-then-recreated garden met the empty state, read
   * « the filter above is the way back », clicked « All gardens » and watched
   * nothing happen. The only writer was the options panel, which lives in Edit
   * mode. They write the same document that panel writes, so the two stay in
   * agreement by construction rather than by copy.
   *
   * Not on Medium: the frozen design puts the row on the Large card only, and
   * the Medium card has no room for it under the density lock (V9).
   */
  const gardenFilter = gardens.length > 1 && (
    <Box sx={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
      <Chip
        label={t('dashboard.blocks.counters.allGardens')}
        size="small"
        onClick={selectGarden(COUNTERS_GARDEN_ALL)}
        variant={activeGarden === COUNTERS_GARDEN_ALL ? 'filled' : 'outlined'}
        aria-pressed={activeGarden === COUNTERS_GARDEN_ALL}
        sx={{ height: DASHBOARD_TYPE.chipHeight, fontSize: DASHBOARD_TYPE.chip }}
      />
      {gardens.map((g) => (
        <Chip
          key={g.id}
          label={g.name}
          size="small"
          onClick={selectGarden(g.id)}
          variant={activeGarden === g.id ? 'filled' : 'outlined'}
          aria-pressed={activeGarden === g.id}
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
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <Box>
        <Typography
          sx={{ fontSize: DASHBOARD_TYPE.big, fontWeight: 800, lineHeight: 1.1 }}
        >
          {formatCount(totals.placementCount, i18n.language)}
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

  const listBody = (limit: number, columns: number, withFilter: boolean) => {
    // EDIBLE FIRST, then the cut (round 1, E6). Slicing `filtered` — whose
    // order is the aggregate's, by placement count — let ornamental varieties
    // take the first `limit` slots: five ferns ahead of the basil on a Medium
    // card meant three edible rows and « +N » over the rest. The headings stayed
    // in the right order while the wrong rows survived, so the widget's own
    // stated rule (« a gardener counting what they will eat should not have to
    // read past the ferns ») was contradicted by its arithmetic. `hidden` is
    // unchanged: the same varieties are hidden, they are just not the same ones
    // shown.
    const edible = filtered.filter(isEdibleVariety);
    const ornamental = filtered.filter((v) => !isEdibleVariety(v));
    const ordered = [...edible, ...ornamental];

    const shown = expanded ? ordered : ordered.slice(0, limit);
    const hidden = ordered.length - shown.length;
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
        {withFilter && gardenFilter}
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
            {/* A HEADING (round 1, E13), like the Statistics section labels:
                it introduces its own list of rows, and the widget card's title
                is the h2 above it. Styling unchanged. */}
            <Typography
              component="h3"
              sx={{
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: 'text.secondary',
                mt: '4px',
                mb: 0,
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
        {/* « Ajouter depuis la Bibliothèque → » is a LARGE-card element in the
            frozen design (artboard A3); the Medium card carries the eight
            varieties and the « +N » and nothing else (Main.dc.html). Keeping it
            on Medium cost a 30 px row the density lock has no room for. */}
        {withFilter && libraryLink}
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
    if (size === 'medium')
      return listBody(MEDIUM_VARIETIES, MEDIUM_COLUMNS, false);
    return listBody(LARGE_VARIETIES, LARGE_COLUMNS, true);
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
