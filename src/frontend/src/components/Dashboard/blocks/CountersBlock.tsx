import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import DashboardBlock from '../DashboardBlock';
import InviteState from '../InviteState';
import { BLOCK_ICONS } from '../blockIcons';
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
  resolveCountersFigures,
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

/**
 * The two marks a Counters row can open on (round 6, partie E1).
 *
 * By DEFAULT the artboards draw a plain coloured DOT with no letter in it —
 * `Main.dc.html` l. 158: `.dot { width: 14px; height: 14px; border-radius:
 * 50%; border: 1px solid rgba(0,0,0,0.12) }`, filled with the plant's hue. The
 * widget drew the planner's idiom instead: a 34 px avatar carrying the initial.
 * The photo option draws the artboard's `.av` — a 26 px circle (`A3Expert.dc.
 * html`, `.av { width: 26px; height: 26px; border-radius: 50% }`), which was
 * also 34 here.
 */
const DOT_PX = 14;
const AVATAR_PX = 26;

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
  /**
   * A replacement is in flight while the error (or the figures) is still on
   * screen (round 7, S33 — Extension #7-17): the Retry button says so by
   * disabling itself, instead of taking a click that changed nothing visible.
   */
  refreshing?: boolean;
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
  refreshing = false,
  onRetry,
  onOptionsChange,
}: Props) {
  const { t, i18n } = useTranslation();
  const tk = useDashboardTokens();
  // The PARSED document, whole: a writer below spreads it so a key another
  // build stored survives this build's write (round 6, Extension #4-11).
  const parsed = countersOptions(options);
  const { photos } = parsed;

  // EVERY figure this widget states comes from here (round 6, partie A): the
  // filter that applies — with the deleted-garden fallback of round 1 (E8), the
  // rows it keeps with their counts re-stated for that garden, and the two
  // totals the chip, the Small card and the catalog line print. The list was
  // filtered and the numbers were not; now nothing is a number unless it came
  // through this call. See `resolveCountersFigures` for what each figure is.
  //
  // NOT memoized, deliberately: the resolver is an imported function, and the
  // React Compiler rules refuse to preserve a `useMemo` whose dependency they
  // cannot prove immutable — keeping one here failed `npm run lint` outright.
  // The cost is one pass over the caller's varieties per render, against a
  // body that maps every surviving variety to DOM on the same render.
  const figures = resolveCountersFigures(options, gardens, varieties, totals);
  const activeGarden = figures.garden;
  const filtered = figures.varieties;

  // Collapsed again whenever the list this « +N » was opened against changes
  // (round 6, Extension #5-6 — the V9 class): a bare boolean survived a filter
  // change and a resize, so an expanded Medium card resized to Large bypassed
  // the ten-line lock and rendered the whole list. The key is the list's
  // identity — the size and the garden it was opened on.
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  const listIdentity = `${size}:${activeGarden}`;
  const expanded = expandedFor === listIdentity;

  // The invitation glyph is the widget's own, from the ONE table (round 6,
  // Extension #5-7): a hardcoded `GrassOutlined` here drew grass in the empty
  // state under a header that draws `BLOCK_ICONS.counters`.
  const CounterIcon = BLOCK_ICONS.counters;

  const displayName = (variety: DashboardVarietyData) =>
    variety.commonName ?? variety.scientificName;

  const avatar = (variety: DashboardVarietyData) => {
    const colour = getPlantColor(variety.plantId);
    if (!photos) {
      // `.dot` — a plain coloured circle, no letter (partie E1). The name
      // beside it carries the meaning; the dot is the row's colour key to the
      // plan, and decorative.
      return (
        <Box
          aria-hidden
          data-variety-dot
          sx={{
            width: DOT_PX,
            height: DOT_PX,
            flexShrink: 0,
            borderRadius: '50%',
            backgroundColor: colour,
            border: `1px solid ${tk.dotRing}`,
          }}
        />
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

  // The row as `Main.dc.html` draws it: `gap: 10px`, the name at 15 px / 600,
  // the count as `.val` — 15 px / 700 (partie E1, taken with the dot).
  const row = (variety: DashboardVarietyData) => (
    <Box
      key={variety.plantId}
      data-variety-row
      sx={{ display: 'flex', alignItems: 'center', gap: '10px', minHeight: 42 }}
    >
      {avatar(variety)}
      <Typography
        sx={{
          flex: 1,
          minWidth: 0,
          fontSize: DASHBOARD_TYPE.body,
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {displayName(variety)}
      </Typography>
      <Typography
        sx={{ fontSize: DASHBOARD_TYPE.body, fontWeight: 700 }}
      >
        {/* Locale-formatted (round 1, G5): a four-digit count concatenated
            into a template literal reads « 1440 » in a French widget that
            groups it « 1 440 » two lines above.

            And the GARDEN's count, not the page's (round 6, partie A — GitHub,
            hors diff, `CountersBlock.tsx:195`): the aggregate groups placements
            by plant across every garden, so a variety planted once here and
            twice elsewhere read « × 3 » on a widget filtered to here. The row
            reads `figures.varieties`, whose `count` is re-stated per garden. */}
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

  // A TWO-WAY control (round 7, S28 — Extension #7-9). `setExpandedFor` was
  // the only writer and the button vanished with `hidden`, so an expanded
  // Large card scrolled inside the widget for the rest of the session: the
  // only ways back were a resize or a filter change, which worked by accident
  // because they change the identity. The inverse gesture takes the same
  // place the « +N » held.
  const moreButton = (hidden: number) =>
    hidden > 0 ? (
      <Button
        size="small"
        onClick={() => setExpandedFor(listIdentity)}
        sx={{ alignSelf: 'flex-start', fontSize: DASHBOARD_TYPE.link }}
      >
        {t('dashboard.blocks.counters.more', { count: hidden })}
      </Button>
    ) : expanded ? (
      <Button
        size="small"
        onClick={() => setExpandedFor(null)}
        sx={{ alignSelf: 'flex-start', fontSize: DASHBOARD_TYPE.link }}
      >
        {t('dashboard.blocks.counters.less')}
      </Button>
    ) : null;

  /** Writes the same `options` document the panel writes — see `Props`. */
  const selectGarden = (garden: string) =>
    onOptionsChange ? () => onOptionsChange({ ...parsed, garden }) : undefined;

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
   *
   * Round 3, E″4 / G″3 — the selection state is shown ONLY while the row can
   * change it. Without `onOptionsChange` a `Chip` has no click handler, is not
   * focusable, and MUI renders it as a roleless `div`; the filled variant and
   * `aria-pressed="true"` then drew a single-select control nobody could
   * operate — the round 1 defect over again, in the one configuration round 1
   * did not close. Removing the state rather than forcing the chips active is
   * the honest half: with no handler there is nothing to write the choice to,
   * and a control that cannot record an answer should not ask a question.
   */
  const interactive = Boolean(onOptionsChange);
  const chipState = (selected: boolean) => ({
    // The assertion goes on each branch, not on the ternary: `as const` applies
    // to a literal, and `tsc -b` refuses it on a conditional expression.
    variant: interactive && selected ? ('filled' as const) : ('outlined' as const),
    // The selected chip is the artboard's `background: var(--prim); color:
    // var(--on-prim)` (round 6, N6-1) — MUI's default filled chip is grey.
    color: interactive && selected ? ('primary' as const) : ('default' as const),
    'aria-pressed': interactive ? selected : undefined,
  });

  // `A3Expert.dc.html`: `<span class="pill" style="height: 30px; padding: 0
  // 13px">` for every filter chip, the unselected ones `.pill.type` with the
  // `--chip-bd` border (round 6, N6-1). They were 26 px with MUI's border.
  const filterChipSx = {
    height: 30,
    fontSize: DASHBOARD_TYPE.chip,
    '& .MuiChip-label': { px: '13px' },
    '&.MuiChip-outlined': { borderColor: tk.chipBorder },
  };

  const gardenFilter = gardens.length > 1 && (
    <Box sx={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      <Chip
        label={t('dashboard.blocks.counters.allGardens')}
        size="small"
        onClick={selectGarden(COUNTERS_GARDEN_ALL)}
        {...chipState(activeGarden === COUNTERS_GARDEN_ALL)}
        sx={filterChipSx}
      />
      {gardens.map((g) => (
        <Chip
          key={g.id}
          label={g.name}
          size="small"
          onClick={selectGarden(g.id)}
          {...chipState(activeGarden === g.id)}
          sx={filterChipSx}
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
        {/* THROUGH THE FILTER (round 6, partie A — Extension #4-7). The card
            printed `totals.placementCount` and `totals.varietyCount`, which are
            page-wide by construction: a user who narrowed Counters to one
            garden on the Large card and then resized it to Small read every
            garden's figure on a filtered widget. */}
        <Typography
          sx={{ fontSize: DASHBOARD_TYPE.big, fontWeight: 800, lineHeight: 1.1 }}
        >
          {formatCount(figures.placementCount, i18n.language)}
        </Typography>
        <Typography
          sx={{ fontSize: DASHBOARD_TYPE.secondary, color: 'text.secondary' }}
        >
          {t('dashboard.blocks.counters.plants', {
            count: figures.placementCount,
          })}
        </Typography>
      </Box>
      <Typography
        sx={{ fontSize: DASHBOARD_TYPE.secondary, color: 'text.secondary' }}
      >
        {t('dashboard.blocks.counters.ofCatalog', {
          count: figures.varietyCount,
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
        {/* `column-gap: 24px` on both artboards' grids (round 6, N6-3); the
            widget had 16. */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            columnGap: '24px',
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
                // `.sec-t` verbatim (round 6, N5-3): 800 / 0.06em.
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: '0.06em',
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
                columnGap: '24px',
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
          <Button size="small" onClick={onRetry} disabled={refreshing}>
            {t('dashboard.retry')}
          </Button>
        </Box>
      );
    }

    if (varieties.length === 0) {
      return (
        <InviteState
          icon={<CounterIcon />}
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
            icon={<CounterIcon />}
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
        // And THROUGH THE FILTER (round 6, partie A): the chip printed the page
        // total over a filtered list, so the header said « 3 variétés » above
        // one row.
        label={t('dashboard.blocks.counters.varieties', {
          count: figures.varietyCount,
        })}
        size="small"
        // FILLED, and green (round 5, A10-5). `Main.dc.html` l. 145 gives this
        // one header chip `.pill.ok` — `--chip-ok-bg` / `--chip-ok-tx` — where
        // Gardens and Statistics take the neutral `.pill.n`. It was an MUI
        // outline like the others.
        sx={{
          height: DASHBOARD_TYPE.chipHeight,
          fontSize: DASHBOARD_TYPE.chip,
          fontWeight: 700,
          backgroundColor: tk.okBg,
          color: tk.okText,
        }}
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
