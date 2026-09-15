import type { ReactNode } from 'react';
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

/** `A3Expert.dc.html` l. 334: eight rows of 28 px, then « +14 variétés » (`_spec.md` § 4). */
const LARGE_ROWS = 8;

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
 * eight varieties × twelve months — four 4 px lanes a row, the current month's
 * column tinted behind them — the legend, « +14 variétés », and the foot.
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
      aria-hidden
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
                height: '4px',
                borderRadius: '2px',
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
              <Box
                aria-hidden
                sx={{
                  width: 30,
                  height: 30,
                  flexShrink: 0,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: tk.invIcBg,
                  color: 'primary.main',
                  '& .MuiSvgIcon-root': { fontSize: 17 },
                }}
              >
                <Icon />
              </Box>
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
    const shown = known.slice(0, LARGE_ROWS);
    const rest = known.length - shown.length;
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
        <Box
          data-month-grid
          role="table"
          aria-label={t('dashboard.blocks.month.gridLabel')}
          sx={{ mt: '8px', flex: '0 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        >
          {/* The axis: `.mh` 12 px / 700, each with its left rule; the current month tinted. */}
          <Box role="row" sx={{ display: 'grid', gridTemplateColumns: gridColumns, alignItems: 'center' }}>
            <Box role="columnheader" sx={visuallyHidden} />
            {MONTHS_OF_YEAR.map((value, index) => (
              <Box
                key={value}
                role="columnheader"
                data-month-axis={value === month.month ? 'now' : undefined}
                sx={{
                  textAlign: 'center',
                  fontSize: 12,
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

          <Box
            sx={{
              flex: '0 1 auto',
              minHeight: 0,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-evenly',
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
                  minHeight: 28,
                }}
              >
                {/* `.pn` — 14 px / 600, ellipsized, with its 8 px gutter. */}
                <Box
                  role="rowheader"
                  sx={{
                    fontSize: 14,
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
                <Box
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
                    aria-hidden
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

        {/* The legend, and « +14 variétés » pushed to its right. */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
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
          {rest > 0 && (
            <Typography
              data-month-more-varieties
              sx={{
                ml: 'auto',
                fontSize: DASHBOARD_TYPE.secondary,
                color: 'text.secondary',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {t('dashboard.blocks.month.moreVarieties', { count: rest })}
            </Typography>
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
