import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import type { Plant } from '../../types/Plant';
import { periodToMonths } from '../../utils/formatPeriod';
import { adaptBadge } from '../../utils/badgeColors';
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

const GRID_COLS = '150px repeat(12, 1fr)';
const TIMELINE_MIN_W = 760; // min width before horizontal scroll kicks in (mobile)

/**
 * Collapse a set of 1-based month indices into contiguous [start,end] runs (1=Jan).
 * Note: does NOT treat December->January as contiguous (e.g. [11,12,1,2] yields two
 * runs 11-12 and 1-2), which is intended for the linear Jan->Dec timeline.
 */
function toRuns(months: number[]): Array<{ start: number; end: number }> {
  const uniq = Array.from(new Set(months))
    .filter((m) => m >= 1 && m <= 12)
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
export default function LifecycleSection({ plant }: { plant: Plant }) {
  const { t } = useTranslation();
  const mode = useTheme().palette.mode;
  const comingBadge = adaptBadge({ bg: '#FBEEE6', fg: '#A0522D' }, mode);
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

  return (
    <Box id="lifecycle" sx={{ scrollMarginTop: '80px', mb: 3 }}>
      {/* ── Title + COMING SOON · DATA badge (OUTSIDE the card) ───────────── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          mb: '4px',
          flexWrap: 'wrap',
        }}
      >
        <Typography
          component="h2"
          sx={{
            m: 0,
            fontSize: '23px',
            fontWeight: 800,
            color: 'heading',
            letterSpacing: '-0.01em',
          }}
        >
          {t('plantDetail.lifecycle.sectionTitle')}
        </Typography>
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            px: '9px',
            py: '4px',
            bgcolor: comingBadge.bg,
            color: comingBadge.fg,
            border: '1px solid',
            borderColor: comingBadge.border,
            borderRadius: '6px',
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.04em',
          }}
        >
          <Sym name="schedule" size={13} color={comingBadge.fg} />
          {t('plantDetail.comingSoonDataBadge')}
        </Box>
      </Box>

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
          {t('plantDetail.lifecycle.caption')}
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
              bgcolor: '#fff',
              color: '#1B5E3A',
              fontWeight: 800,
              borderRadius: '7px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              px: '14px',
              py: '8px',
              fontSize: 13,
              textTransform: 'none',
              minWidth: 0,
              '&:hover': { bgcolor: '#fff' },
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
          <Box sx={{ minWidth: TIMELINE_MIN_W }}>
            {/* Month header — vertical gridlines between months. */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: GRID_COLS,
                alignItems: 'center',
                mb: '10px',
              }}
            >
              <Box />
              {months.map((m, i) => (
                <Typography
                  key={i}
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
              {STAGES.map((s) => {
                const runs = toRuns(monthsByStage[s.key]);
                return (
                  <Box
                    key={s.key}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: GRID_COLS,
                      alignItems: 'center',
                    }}
                  >
                    <Box
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
                      {t(`plantDetail.lifecycle.stages.${s.key}`)}
                    </Box>
                    {runs.map((run) => (
                      <Box
                        key={`${run.start}-${run.end}`}
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
          {STAGES.map((s) => (
            <Box
              key={s.legendKey}
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
              {t(`plantDetail.lifecycle.legend.${s.legendKey}`)}
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
