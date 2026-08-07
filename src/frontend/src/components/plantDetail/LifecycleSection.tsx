import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { visuallyHidden } from '@mui/utils';
import type { Plant } from '../../types/Plant';
import { periodToMonths } from '../../utils/formatPeriod';
import { NAV_BG } from '../../constants/colors';
import SectionHeader from './SectionHeader';
import StatusBadge from './StatusBadge';
import { Sym } from '../Sym';

// Stage bar / legend swatch colours + Material Symbols glyph names, exact to the
// Claude Design reference HTML. SMA-184: dark-mode / AA-contrast audit pending.
const STAGES: ReadonlyArray<{
  key: string;
  icon: string;
  color: string;
  legendKey: string;
}> = [
  { key: 'sowing', icon: 'spa', color: '#8FB996', legendKey: 'seed' },
  { key: 'growth', icon: 'grass', color: '#2E8B57', legendKey: 'plant' },
  {
    key: 'flowering',
    icon: 'local_florist',
    color: '#E0A93B',
    legendKey: 'flowering',
  },
  { key: 'fruiting', icon: 'nutrition', color: '#C0492F', legendKey: 'fruits' },
  {
    key: 'harvest',
    icon: 'agriculture',
    color: '#A0522D',
    legendKey: 'harvest',
  },
];

const TIMELINE_MIN_W = 760; // min width before horizontal scroll kicks in (mobile)

// --- SMA-394 easter eggs — delete this block to remove ---
/**
 * A timeline written by the caller instead of derived from sowing/harvest
 * periods: its own columns (an entry whose cycle is a DAY, not a year), its own
 * stages, and each stage's spans as 1-based column indices.
 */
export interface WrittenTimeline {
  readonly columns: readonly string[];
  readonly caption: string;
  readonly label: string;
  readonly stages: readonly {
    readonly key: string;
    readonly icon: string;
    readonly color: string;
    readonly label: string;
    readonly spans: readonly number[];
  }[];
}
// --- end SMA-394 ---

/**
 * Collapse a set of 1-based month indices into contiguous [start,end] runs (1=Jan).
 * Note: does NOT treat December->January as contiguous (e.g. [11,12,1,2] yields two
 * runs 11-12 and 1-2), which is intended for the linear Jan->Dec timeline.
 */
function toRuns(
  months: readonly number[],
  max = 12
): Array<{ start: number; end: number }> {
  const uniq = Array.from(new Set(months))
    .filter((m) => m >= 1 && m <= max)
    .sort((a, b) => a - b);
  const runs: Array<{ start: number; end: number }> = [];
  for (const m of uniq) {
    const last = runs[runs.length - 1];
    if (last && m === last.end + 1) last.end = m;
    else runs.push({ start: m, end: m });
  }
  return runs;
}

/**
 * Seasonal calendar for Plant Detail v2 (SMA-78, PR C) — pixel-matched to the
 * Claude Design reference HTML. The title + COMING SOON · DATA badge + caption +
 * mode toggle live OUTSIDE the white card; the card holds only the 12-month Gantt
 * timeline (a bar per stage spanning its active months, from `sowingPeriod` /
 * `harvestPeriod` and the Perenual flowering / harvest seasons via
 * {@link periodToMonths}) and the legend. Stages with no data source (growth,
 * fruiting) keep a labelled row with an empty track. The "Indoor · greenhouse ·
 * IoT" mode (per-phase day durations) has no data yet (tracked in SMA-197), so
 * its toggle segment is a disabled teaser. Pure: the parent mounts it only when
 * `showLifecycleSection` is true (TOC state unchanged — Option B).
 */
export default function LifecycleSection({
  plant,
  // --- SMA-394 easter eggs — delete this line to remove ---
  timeline,
  // --- end SMA-394 ---
}: {
  plant: Plant;
  timeline?: WrittenTimeline;
}) {
  const { t } = useTranslation();
  const mode = useTheme().palette.mode;
  const monthsRaw = t('plantDetail.lifecycle.monthsShort', {
    returnObjects: true,
  });
  const months =
    Array.isArray(monthsRaw) &&
    monthsRaw.length === 12 &&
    monthsRaw.every((m): m is string => typeof m === 'string')
      ? monthsRaw
      : [
          'Jan',
          'Feb',
          'Mar',
          'Apr',
          'May',
          'Jun',
          'Jul',
          'Aug',
          'Sep',
          'Oct',
          'Nov',
          'Dec',
        ];

  const monthsByStage: Record<string, number[]> = {
    sowing: periodToMonths(plant.sowingPeriod),
    growth: [],
    flowering: periodToMonths(plant.perenualData?.floweringSeason),
    fruiting: [],
    harvest: periodToMonths(
      plant.harvestPeriod?.trim()
        ? plant.harvestPeriod
        : plant.perenualData?.harvestSeason
    ),
  };

  // A written timeline supplies columns, stages and spans; everything below
  // renders from these two, so the markup is the same either way.
  const columns = timeline?.columns ?? months;
  const stages = timeline
    ? timeline.stages.map((s) => ({
        key: s.key,
        icon: s.icon,
        color: s.color,
        label: s.label,
        legendLabel: s.label,
        active: s.spans,
      }))
    : STAGES.map((s) => ({
        key: s.key,
        icon: s.icon,
        color: s.color,
        label: t(`plantDetail.lifecycle.stages.${s.key}`),
        legendLabel: t(`plantDetail.lifecycle.legend.${s.legendKey}`),
        active: monthsByStage[s.key],
      }));
  const gridCols = `150px repeat(${columns.length}, 1fr)`;
  const timelineMinW = Math.max(TIMELINE_MIN_W, 150 + columns.length * 42);

  return (
    <Box id="lifecycle" sx={{ scrollMarginTop: '80px', mb: 3 }}>
      {/* ── Title + COMING SOON · DATA badge (OUTSIDE the card) ───────────── */}
      <SectionHeader
        title={t('plantDetail.lifecycle.sectionTitle')}
        badge={<StatusBadge variant="data" />}
        mb="4px"
      />

      {/* ── Caption + mode toggle (OUTSIDE the card) ─────────────────────── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          mb: '14px',
        }}
      >
        <Typography sx={{ m: 0, fontSize: 13, color: 'text.secondary' }}>
          {timeline?.caption ?? t('plantDetail.lifecycle.caption')}
        </Typography>
        <Box
          sx={{
            display: 'flex',
            bgcolor: 'surfaceSubtle',
            borderRadius: '9px',
            p: '3px',
            gap: '3px',
          }}
        >
          <Button
            disableRipple
            sx={{
              // Active segment, mode-aware like UnitSystemToggle's selected
              // option (SMA-217): light = raised white pill with NAV_BG text
              // (unchanged); dark = the same brand-green fill with navy text.
              bgcolor: mode === 'dark' ? 'primary.main' : '#fff',
              color: mode === 'dark' ? 'background.default' : NAV_BG,
              fontWeight: 700,
              borderRadius: '8px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
              px: '14px',
              py: '8px',
              fontSize: 13,
              textTransform: 'none',
              minWidth: 0,
              '&:hover': { bgcolor: mode === 'dark' ? 'primary.main' : '#fff' },
            }}
          >
            {t('plantDetail.lifecycle.modeOutdoor')}
          </Button>
          <Button
            disabled
            disableRipple
            sx={{
              bgcolor: 'transparent',
              color: 'text.secondary',
              fontWeight: 700,
              borderRadius: '7px',
              px: '14px',
              py: '8px',
              fontSize: 13,
              textTransform: 'none',
              minWidth: 0,
              '&.Mui-disabled': { color: 'text.secondary' },
            }}
          >
            {t('plantDetail.lifecycle.modeIndoor')}
          </Button>
        </Box>
      </Box>

      {/* ── Card: timeline + legend only ─────────────────────────────────── */}
      <Box
        sx={{
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'borderSubtle',
          borderRadius: '12px',
          p: '20px 22px',
          boxShadow: '0 1px 3px rgba(27,94,58,0.05)',
        }}
      >
        <Box sx={{ overflowX: 'auto' }}>
          <Box
            role="table"
            aria-label={timeline?.label ?? t('plantDetail.lifecycle.timelineLabel')}
            sx={{ minWidth: timelineMinW }}
          >
            {/* Column header — vertical gridlines between columns. */}
            <Box
              role="row"
              sx={{
                display: 'grid',
                gridTemplateColumns: gridCols,
                alignItems: 'center',
                mb: '10px',
              }}
            >
              <Box
                role="columnheader"
                aria-label={t('plantDetail.lifecycle.stageHeader')}
              />
              {columns.map((m, i) => (
                <Typography
                  key={i}
                  role="columnheader"
                  sx={{
                    textAlign: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'text.secondary',
                    borderLeft: '1px solid',
                    borderLeftColor: 'divider',
                    py: '2px',
                  }}
                >
                  {m}
                </Typography>
              ))}
            </Box>

            {/* Stage rows. */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {stages.map((s) => {
                const runs = toRuns(s.active, columns.length);
                // sr-only summary of the columns this stage spans (runs are
                // 1-based; `columns` is 0-based → index by start-1/end-1).
                const activeLabel = runs.length
                  ? runs
                      .map((r) =>
                        r.start === r.end
                          ? columns[r.start - 1]
                          : `${columns[r.start - 1]} – ${columns[r.end - 1]}`
                      )
                      .join(', ')
                  : t('plantDetail.lifecycle.noDataShort');
                return (
                  <Box
                    key={s.key}
                    role="row"
                    sx={{
                      // SMA-249 — be the containing block for the sr-only absolute
                      // cell so it can never resolve its box against <body> again.
                      position: 'relative',
                      display: 'grid',
                      gridTemplateColumns: gridCols,
                      alignItems: 'center',
                    }}
                  >
                    <Box
                      role="rowheader"
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'text.primary',
                        whiteSpace: 'nowrap',
                        pr: 1,
                      }}
                    >
                      <Sym name={s.icon} size={17} color="inherit" />
                      {s.label}
                    </Box>
                    {/* SMA-249 — sr-only month summary. Uses the canonical
                        `visuallyHidden` (width/height '1px' STRINGS): the previous
                        hand-rolled `width: 1` was read by MUI's sizing system as
                        100%, and on this absolute box with no positioned ancestor
                        it resolved against <body> (~1525px), pushing the page ~382px
                        wide in Chromium. */}
                    <Box role="cell" sx={visuallyHidden}>
                      {activeLabel}
                    </Box>
                    {runs.map((run) => (
                      <Box
                        key={`${run.start}-${run.end}`}
                        aria-hidden
                        sx={{
                          gridColumn: `${run.start + 1} / ${run.end + 2}`,
                          height: '22px',
                          borderRadius: '6px',
                          bgcolor: s.color,
                          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18)',
                        }}
                      />
                    ))}
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Box>

        {/* Legend — divider above, colour swatch + short word per stage. */}
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '16px',
            borderTop: '1px solid',
            borderTopColor: 'divider',
            mt: '16px',
            pt: '14px',
          }}
        >
          {stages.map((s) => (
            <Box
              key={s.key}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: 12,
                fontWeight: 600,
                color: 'text.secondary',
              }}
            >
              <Box
                sx={{
                  width: 11,
                  height: 11,
                  borderRadius: '3px',
                  bgcolor: s.color,
                }}
              />
              {s.legendLabel}
            </Box>
          ))}
        </Box>
      </Box>

      {plant.lifeCycle === 'Perennial' ||
      plant.lifeCycle === 'HerbaceousPerennial' ? (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 1.5, display: 'block' }}
        >
          {t('plantDetail.lifecycle.perennialNote')}
        </Typography>
      ) : plant.lifeCycle === 'Biennial' ? (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 1.5, display: 'block' }}
        >
          {t('plantDetail.lifecycle.biennialNote')}
        </Typography>
      ) : null}
    </Box>
  );
}
