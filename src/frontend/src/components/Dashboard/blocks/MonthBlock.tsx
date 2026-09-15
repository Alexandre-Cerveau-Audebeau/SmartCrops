import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { visuallyHidden } from '@mui/utils';
import type { SvgIconComponent } from '@mui/icons-material';
import AgricultureOutlinedIcon from '@mui/icons-material/AgricultureOutlined';
import ContentCutOutlinedIcon from '@mui/icons-material/ContentCutOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import SpaOutlinedIcon from '@mui/icons-material/SpaOutlined';
import DashboardBlock from '../DashboardBlock';
import IconDisc from '../IconDisc';
import InviteState from '../InviteState';
import { BLOCK_ICONS } from '../blockIcons';
import {
  CALENDAR_LANES,
  MONTHS_OF_YEAR,
  monthCalendar,
  monthLabel,
  varietyName,
  type CalendarLane,
  type VarietyCalendar,
} from './plantCalendar';
import { DASHBOARD_TYPE } from '../../../theme/dashboardTokens';
import { useDashboardTokens } from '../../../theme/useDashboardTokens';
import type { DashboardTokens } from '../../../theme/dashboardTokens';
import type { DashboardSize } from '../../../types/Dashboard';
import type { DashboardGardenData, DashboardVarietyData } from '../../../types/DashboardData';
import type { DashboardWeatherData } from '../../../types/DashboardWeather';
import { capitalizeFirst } from '../../../utils/capitalizeFirst';
import { formatCount } from '../../../utils/formatNumber';

interface Props {
  size: DashboardSize;
  editing?: boolean;
  gardens: DashboardGardenData[];
  varieties: DashboardVarietyData[];
  /** Read for ONE thing: the month of a located garden's own place (arbitrage Q10). */
  weather: DashboardWeatherData;
  loading: boolean;
  loadError: boolean;
  refreshing?: boolean;
  onRetry: () => void;
}

/** The three verbs the artboards count — flowering has a lane, never a counter. */
const COUNTED_LANES = ['prune', 'sow', 'harvest'] as const;

type CountedLane = (typeof COUNTED_LANES)[number];

/**
 * Rows a Large card lists before the deploy button. Round 1, V26: back to the
 * frozen design's own cap of TEN (verrou 11) — the widget shipped at eight —
 * on Alexandre's call: « pas besoin du plafond, mais disons plutôt 10 que 8 ».
 * It is no longer a ceiling on what can be read, only on what is read at rest:
 * the button below deploys the rest into the same scrolling zone.
 */
const LARGE_ROWS = 10;

/**
 * Round 1, V24 — an AMENDMENT to the frozen plate, taken by Alexandre on the
 * visual pass: « mérite une police plus grande, c'est trop peu visible ».
 * `A3Expert.dc.html` draws `.pn` at 14 px, `.mh` at 12 px, its rows at 28 px
 * and `.lane` at 4 px. That scale reads on the artboard's own canvas and not
 * on a card in a grid, so each is raised one step. The plate's figure is kept
 * beside each value: this is a deviation, and a deviation has to stay legible
 * as one.
 */
const LARGE_GRID = {
  /** `.pn` — 14 px on the plate. */
  nameSize: 15,
  /** `.mh` — 12 px on the plate. */
  axisSize: 13,
  /** `.cal { min-height: 28px }` on the plate. */
  rowHeight: 32,
  /** `.lane { height: 4px }` on the plate. */
  laneHeight: 5,
  /** `.lane { border-radius: 2px }` — half the height, so the bar stays a pill. */
  laneRadius: 2.5,
} as const;

/** `Main.dc.html` l. 309: « Thym, Romarin, Courgette +7 » — three names, then the rest as a figure. */
const MEDIUM_NAMES = 3;

/** Matched path-for-path against the artboards' own glyphs. */
const LANE_ICONS: Record<CountedLane, SvgIconComponent> = {
  prune: ContentCutOutlinedIcon,
  sow: SpaOutlinedIcon,
  harvest: AgricultureOutlinedIcon,
};

/** The token each lane paints with — bars and legend squares only, never a word. */
const LANE_TOKEN: Record<CalendarLane, keyof DashboardTokens> = {
  prune: 'stagePrune',
  sow: 'stageSow',
  flower: 'stageFlower',
  harvest: 'stageHarvest',
};

/**
 * SMA-336 PR 4a/5 — « Ce mois-ci », the calendar of the placed varieties
 * (`SMA-336_Design_Reference.md` § 5, `A2Novice.dc.html` l. 319-322,
 * `Main.dc.html` l. 309, `A4Manquantes.dc.html` l. 335-336, `A3Expert.dc.html`
 * l. 334-338).
 *
 * ONE pure derivation feeds every surface — the header chip, the three
 * counters, the names, the grid and the Customize thumbnail — so a figure the
 * list did not pass through cannot be printed anywhere (the
 * `resolveCountersFigures` lesson). The counters count DISTINCT VARIETIES
 * (`_spec.md` § 7: « Le pied compte des variétés »), where the To-do block
 * counts placements: two units, two surfaces, said once each.
 *
 * Small: the month in 28 px and the three counters. Medium: a row per verb,
 * with the names and « +7 ». Large: the same three counters, then the grid of
 * ten varieties × twelve months — four lanes a row, the current month's column
 * tinted behind them — the legend, the button that deploys the rest into the
 * same scrolling zone, and the foot.
 *
 * Round 1 amended the Large grid three times, on Alexandre's visual pass: the
 * type and the heights are a step above the plate ({@link LARGE_GRID}), the
 * rows share the card's height instead of leaving a void under the legend, and
 * « +N variétés » became that button ({@link LARGE_ROWS}).
 *
 * The foot is a COUNT, never an assumption (decision D2): « Pas de calendrier
 * connu pour 4 variétés » names exactly the placed varieties no lane knows a
 * month for. Three zeros above it are not a misleading zero — they are the
 * month, honestly — which is why the foot is what makes them readable.
 */
export default function MonthBlock({
  size,
  editing,
  gardens,
  varieties,
  weather,
  loading,
  loadError,
  refreshing = false,
  onRetry,
}: Props) {
  const { t, i18n } = useTranslation();
  const tk = useDashboardTokens();
  const MonthIcon = BLOCK_ICONS.month;
  /**
   * V26 — the Large grid deployed past its ten rows. Session-only, in React
   * and nowhere else: this is a reading position, not a preference, and the
   * dashboard's preferences live on the server (§ 7). The chip and the three
   * counters never read it — they count the whole calendar, deployed or not
   * (the `resolveCountersFigures` rule).
   */
  const [expanded, setExpanded] = useState(false);
  /** Ties the deploy button to the region it opens, for `aria-controls`. */
  const gridId = useId();

  // ONE derivation for the chip, the counters, the names, the grid and the foot.
  const calendar = monthCalendar(gardens, varieties, weather);
  const { month, known, unknown, active } = calendar;

  /** « Septembre » — the header chip and the Small headline. */
  const title = capitalizeFirst(monthLabel(month.month, i18n.language)) ?? '';

  /** The twelve axis labels of the Large grid, guarded like the detail timeline's. */
  const monthsShort = ((): string[] => {
    const raw = t('dashboard.blocks.month.monthsShort', { returnObjects: true });
    return Array.isArray(raw) && raw.length === 12 && raw.every((label) => typeof label === 'string')
      ? (raw as string[])
      : MONTHS_OF_YEAR.map((value) => String(value));
  })();

  const names = (entries: readonly VarietyCalendar[]): string[] =>
    entries.map((entry) => varietyName(entry.variety));

  /** « Thym, Romarin, Courgette » + « +7 » — the artboard's own truncation. */
  const nameLine = (entries: readonly VarietyCalendar[]) => {
    const shown = names(entries).slice(0, MEDIUM_NAMES);
    return { shown: shown.join(', '), rest: entries.length - shown.length };
  };

  /** A lane's 4 px bar on the twelve columns; an idle month draws a transparent one. */
  const lane = (entry: VarietyCalendar, key: CalendarLane) => (
    <Box
      key={key}
      sx={{
        // `.lanes` — twelve equal columns that may shrink to nothing.
        display: 'grid',
        gridTemplateColumns: `repeat(12, minmax(0, 1fr))`,
      }}
    >
      {MONTHS_OF_YEAR.map((value) => {
        const on = entry.lanes[key].includes(value);
        return (
          <Box key={value} sx={{ position: 'relative', zIndex: 1 }}>
            {/* `.lane { height: 4px; border-radius: 2px }` — the attribute
                marks the PAINTED months only, so a test reads the bars the
                way the eye does rather than through a class name. */}
            <Box
              data-month-bar={on ? key : undefined}
              sx={{
                height: `${LARGE_GRID.laneHeight}px`,
                borderRadius: `${LARGE_GRID.laneRadius}px`,
                backgroundColor: on ? tk[LANE_TOKEN[key]] : 'transparent',
              }}
            />
          </Box>
        );
      })}
    </Box>
  );

  /**
   * What a screen reader hears for a row: the plant, then every lane it has
   * months for, named and spelled out. The bars themselves are `aria-hidden` —
   * a colour is not a fact anyone can hear (§ 7).
   */
  const rowSpoken = (entry: VarietyCalendar): string => {
    const spoken = CALENDAR_LANES.filter((key) => entry.lanes[key].length > 0).map((key) =>
      t('dashboard.blocks.month.laneSpoken', {
        lane: t(`dashboard.blocks.month.legend.${key}`),
        months: entry.lanes[key].map((value) => monthLabel(value, i18n.language)).join(', '),
      })
    );
    return t('dashboard.blocks.month.rowSpoken', {
      plant: varietyName(entry.variety),
      lanes: spoken.join(' · '),
    });
  };

  /** « Pas de calendrier connu pour 4 variétés » — counted, never assumed (D2). */
  const foot = unknown.length > 0 && (
    <Typography
      data-month-unknown
      sx={{
        // `.sub` on `margin-top: auto`, with its 16 px glyph.
        mt: 'auto',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: DASHBOARD_TYPE.secondary,
        lineHeight: 1.45,
        color: 'text.secondary',
      }}
    >
      <InfoOutlinedIcon aria-hidden sx={{ fontSize: 16, flexShrink: 0 }} />
      {t('dashboard.blocks.month.unknown', { count: unknown.length })}
    </Typography>
  );

  /** Nothing placed at all: the calendar has no subject — a statement, not a zero. */
  const nothing = (
    <InviteState icon={<MonthIcon />} message={t('dashboard.blocks.month.empty')} variant="catalogue" />
  );

  const smallBody = () => (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* `.big.sm2` — 28 px (`A2Novice.dc.html` l. 320, helmet l. 132). */}
      <Typography
        data-month-title
        sx={{ fontSize: DASHBOARD_TYPE.bigSmall, fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.01em' }}
      >
        {title}
      </Typography>
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly' }}>
        {COUNTED_LANES.map((key) => {
          const Icon = LANE_ICONS[key];
          return (
            <Box key={key} data-month-count={key} sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Icon aria-hidden sx={{ fontSize: 19, color: 'primary.main', flexShrink: 0 }} />
              {/* `.num.mcn` — 28 px / 800, tabular, a 38 px gutter so the three align. */}
              <Typography
                component="span"
                sx={{
                  fontSize: DASHBOARD_TYPE.bigSmall,
                  fontWeight: 800,
                  lineHeight: 1.1,
                  minWidth: 38,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatCount(active[key].length, i18n.language)}
              </Typography>
              <Typography component="span" sx={{ fontSize: DASHBOARD_TYPE.body, color: 'text.secondary' }}>
                {t(`dashboard.blocks.month.counts.${key}`)}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );

  const mediumBody = () => (
    <>
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly' }}>
        {COUNTED_LANES.map((key) => {
          const Icon = LANE_ICONS[key];
          const { shown, rest } = nameLine(active[key]);
          return (
            <Box key={key} data-month-row={key} sx={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              {/* `.inv-ic` at 30 px — the disc the artboard puts before each row. */}
              <IconDisc iconSize={17}>
                <Icon />
              </IconDisc>
              <Box
                sx={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '8px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                }}
              >
                <Typography component="span" sx={{ fontSize: DASHBOARD_TYPE.body, fontWeight: 800 }}>
                  {t(`dashboard.blocks.month.verbs.${key}`)}
                </Typography>
                <Typography
                  component="span"
                  sx={{
                    fontSize: DASHBOARD_TYPE.body,
                    fontWeight: 800,
                    color: 'primary.main',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatCount(active[key].length, i18n.language)}
                </Typography>
                <Typography
                  component="span"
                  sx={{
                    fontSize: DASHBOARD_TYPE.secondary,
                    color: 'text.secondary',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {shown}
                </Typography>
                {rest > 0 && (
                  /* OUTSIDE the truncated zone (`_spec.md` § 10.34): the « +N »
                     must never be the part the ellipsis eats. */
                  <Typography
                    component="span"
                    data-month-more={key}
                    sx={{
                      fontSize: DASHBOARD_TYPE.secondary,
                      color: 'text.secondary',
                      flexShrink: 0,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {t('dashboard.blocks.month.moreNames', { count: rest })}
                  </Typography>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>
      {foot}
    </>
  );

  const largeBody = () => {
    const shown = expanded ? known : known.slice(0, LARGE_ROWS);
    // What the button offers to reveal — counted on the CAP, not on what is
    // currently drawn, so the collapsed and the deployed states name the same
    // number and the label does not change under the reader's hand.
    const rest = Math.max(0, known.length - LARGE_ROWS);
    // `.cal` — a 108 px name column, then the twelve months.
    const gridColumns = `108px repeat(12, minmax(0, 1fr))`;
    return (
      <>
        {/* The three counters in a row (`A3Expert.dc.html` l. 334). */}
        <Box sx={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
          {COUNTED_LANES.map((key) => {
            const Icon = LANE_ICONS[key];
            return (
              <Box
                key={key}
                data-month-count={key}
                component="span"
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: DASHBOARD_TYPE.body,
                  color: 'text.secondary',
                }}
              >
                <Icon aria-hidden sx={{ fontSize: 18, color: 'primary.main' }} />
                <Box
                  component="b"
                  sx={{
                    fontSize: DASHBOARD_TYPE.bigSmall,
                    fontWeight: 800,
                    lineHeight: 1.1,
                    color: 'text.primary',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatCount(active[key].length, i18n.language)}
                </Box>
                {t(`dashboard.blocks.month.counts.${key}`)}
              </Box>
            );
          })}
        </Box>

        {/* `.s2` — 8 px over the 12 px gap, the artboard's section spacing. */}
        {/* Round 1, V25: `flex: 1`, where this was `flex: '0 1 auto'`. The
            grid now takes the card's leftover height instead of leaving it to
            pile up under the legend — « c'est dommage de voir un si grand vide
            en bas de widget ». It CLIPS (`overflow: hidden`) so the deployed
            list of V26 scrolls inside it and never grows the card (lesson V7). */}
        <Box
          data-month-grid
          id={gridId}
          role="table"
          aria-label={t('dashboard.blocks.month.gridLabel')}
          sx={{ mt: '8px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        >
          {/* The axis: `.mh` 12 px / 700, each with its left rule; the current month tinted. */}
          <Box role="row" sx={{ display: 'grid', gridTemplateColumns: gridColumns, alignItems: 'center' }}>
            {/* `A3Expert.dc.html` l. 336 opens `.cal` with a bare
                `<div></div>`: the corner cell above the 108 px name column,
                EMPTY but IN FLOW, and that is what puts « Jan » on track 2,
                over the first of the lane columns.

                Round 1, V23 (= C3's zone): this cell carried
                `sx={visuallyHidden}`, whose `position: absolute` takes a grid
                child out of the flow entirely. It consumed no track, the
                twelve labels auto-placed on tracks 1 to 12 instead of 2 to
                13, and the whole axis sat one column to the left of the bars
                it names — « Jan » stretched across the 108 px name column
                while the thirteenth track stayed empty. The rows never drifted
                because their lane container DECLARES `grid-column: 2 / 14`
                (l. 213) rather than relying on auto-placement.

                The plate's own shape is the fix: one empty in-flow box, not
                twelve `gridColumn` declarations on the labels. The
                `columnheader` role stays — the ARIA table still needs a
                header for the name column — and only the box comes back into
                the grid. The spoken cell of each row below is the one thing
                that MUST stay out of flow, and does. */}
            <Box role="columnheader" sx={{ minWidth: 0 }} />
            {MONTHS_OF_YEAR.map((value, index) => (
              <Box
                key={value}
                role="columnheader"
                data-month-axis={value === month.month ? 'now' : undefined}
                sx={{
                  textAlign: 'center',
                  fontSize: LARGE_GRID.axisSize,
                  fontWeight: 700,
                  color: 'text.secondary',
                  borderLeft: '1px solid',
                  borderLeftColor: 'divider',
                  py: '3px',
                  backgroundColor: value === month.month ? tk.tint : 'transparent',
                }}
              >
                {monthsShort[index]}
              </Box>
            ))}
          </Box>

          {/* `A3Expert.dc.html` l. 336: `flex: 1; justify-content:
              space-evenly` — the rows share the height evenly rather than
              massing at the top (V25, a RETURN to the plate: this shipped at
              `flex: '0 1 auto'`).

              Deployed, the list scrolls, and even distribution has no meaning
              there — worse, `space-evenly` on a scrolling box pushes the first
              rows above the scrollable area, where no scrollbar can reach
              them. So the deployed state packs from the top (V26, the V7
              lesson: nothing may leave the card, and nothing may become
              unreachable inside it). */}
          <Box
            data-month-rows
            sx={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: expanded ? 'flex-start' : 'space-evenly',
              gap: expanded ? '2px' : 0,
              mt: '6px',
            }}
          >
            {shown.map((entry) => (
              <Box
                key={entry.variety.plantId}
                role="row"
                data-month-plant={entry.variety.plantId}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: gridColumns,
                  alignItems: 'center',
                  minHeight: LARGE_GRID.rowHeight,
                  // A scrolling list must not squeeze its rows to fit (V26).
                  flexShrink: 0,
                }}
              >
                {/* `.pn` — 14 px / 600, ellipsized, with its 8 px gutter. */}
                <Box
                  role="rowheader"
                  sx={{
                    fontSize: LARGE_GRID.nameSize,
                    fontWeight: 600,
                    color: 'text.primary',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    pr: '8px',
                  }}
                >
                  {varietyName(entry.variety)}
                </Box>
                {/* The sentence the bars cannot say. */}
                <Box role="cell" sx={visuallyHidden}>
                  {rowSpoken(entry)}
                </Box>
                {/* `.lanes` — the twelve month columns of the row, placed
                    EXPLICITLY at `grid-column: 2 / 14` (`A3Expert.dc.html`
                    l. 213) rather than auto-placed, so no sibling can shift
                    them. Round 1, F1: it carries the ONE `aria-hidden` of the
                    row. Everything under it is decoration — a colour is not a
                    fact anyone can hear — and the row's sentence is spoken by
                    the `cell` above, outside this container. */}
                <Box
                  aria-hidden
                  data-month-lanes
                  sx={{
                    position: 'relative',
                    gridColumn: '2 / 14',
                    display: 'flex',
                    flexDirection: 'column',
                    rowGap: '3px',
                  }}
                >
                  {/* `.nowcol` — ONE column behind the four lanes, not four marks. */}
                  <Box
                    data-month-now
                    sx={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: `${((month.month - 1) / 12) * 100}%`,
                      width: `${100 / 12}%`,
                      backgroundColor: tk.tint,
                      borderRadius: '2px',
                      zIndex: 0,
                    }}
                  />
                  {CALENDAR_LANES.map((key) => lane(entry, key))}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>

        {/* The legend, and the deploy button pushed to its right. V25: it
            sits OUTSIDE the scrolling zone and, the grid above it now taking
            the slack, at the foot of the card — « fixer la légende en bas de
            widget ». `flexShrink: 0` so a deployed list never eats it. */}
        <Box
          data-month-legend-row
          sx={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap', flexShrink: 0 }}
        >
          {CALENDAR_LANES.map((key) => (
            <Box
              key={key}
              component="span"
              data-month-legend={key}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                fontSize: DASHBOARD_TYPE.secondary,
                fontWeight: 600,
                color: 'text.secondary',
              }}
            >
              <Box
                aria-hidden
                sx={{ width: 12, height: 12, borderRadius: '3px', backgroundColor: tk[LANE_TOKEN[key]] }}
              />
              {t(`dashboard.blocks.month.legend.${key}`)}
            </Box>
          ))}
          {/* Round 1, V26: « +14 variétés » was a sentence, and a sentence
              that promises fourteen rows nobody can reach is a dead end. It
              is a BUTTON now — focusable, named in full (« Afficher les 14
              autres variétés »), announcing the region it opens — and it
              folds back, because a deploy with no way back traps the reader.
              The state is React's alone: it lives for the session and is
              written nowhere, the widget's own rule for anything that is not
              a preference. No transition is attached to the toggle, so there
              is nothing for `prefers-reduced-motion` to have to neutralise. */}
          {rest > 0 && (
            <Button
              data-month-more-varieties
              variant="text"
              size="small"
              onClick={() => setExpanded((open) => !open)}
              aria-expanded={expanded}
              aria-controls={gridId}
              sx={{
                ml: 'auto',
                p: 0,
                minWidth: 0,
                fontSize: DASHBOARD_TYPE.secondary,
                fontWeight: 700,
                textTransform: 'none',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {expanded
                ? t('dashboard.blocks.month.collapse')
                : t('dashboard.blocks.month.moreVarieties', { count: rest })}
            </Button>
          )}
        </Box>
        {foot}
      </>
    );
  };

  const body = (): ReactNode => {
    if (loading) {
      return (
        <Box data-month-skeleton sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} variant="rounded" height={28} />
          ))}
        </Box>
      );
    }
    if (loadError) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Typography sx={{ fontSize: DASHBOARD_TYPE.body, color: 'text.secondary' }}>
            {t('dashboard.blocks.month.loadError')}
          </Typography>
          <Button size="small" onClick={onRetry} disabled={refreshing} sx={{ alignSelf: 'flex-start' }}>
            {t('dashboard.retry')}
          </Button>
        </Box>
      );
    }
    // No variety placed: the calendar has no subject to speak of. A month and
    // three zeros would be the misleading zero rule 4 of the design contract
    // forbids — where three zeros BESIDE a counted foot are not.
    if (varieties.length === 0) return nothing;
    if (size === 'small') return smallBody();
    if (size === 'medium') return mediumBody();
    return largeBody();
  };

  /** « Septembre » — `.pill.n`, the neutral header chip (`Main.dc.html` l. 309). */
  const chip = !loading && !loadError && size !== 'small' && (
    <Chip
      data-month-chip
      label={title}
      size="small"
      sx={{
        height: DASHBOARD_TYPE.chipHeight,
        fontSize: DASHBOARD_TYPE.chip,
        fontWeight: 700,
        backgroundColor: tk.pillBg,
        color: tk.pillText,
      }}
    />
  );

  return (
    <DashboardBlock
      blockKey="month"
      title={t('dashboard.blocks.month.title')}
      size={size}
      editing={editing}
      chip={chip || undefined}
    >
      {body()}
    </DashboardBlock>
  );
}
