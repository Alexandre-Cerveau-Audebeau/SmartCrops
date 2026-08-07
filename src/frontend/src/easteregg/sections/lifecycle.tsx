import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { visuallyHidden } from '@mui/utils';
import { NAV_BG } from '../../constants/colors';
import SectionHeader from '../../components/plantDetail/SectionHeader';
import StatusBadge from '../../components/plantDetail/StatusBadge';
import { Sym } from '../../components/Sym';
import type { EasterEggEntry } from '../types';

const TIMELINE_MIN_W = 760; // min width before horizontal scroll kicks in (mobile)

/**
 * Collapse a set of 1-based column indices into contiguous [start,end] runs.
 * Copied from LifecycleSection, widened from twelve months to any column count.
 */
function toRuns(
  cols: readonly number[],
  max: number
): Array<{ start: number; end: number }> {
  const uniq = Array.from(new Set(cols))
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
 * Section 04 for an easter egg: LifecycleSection's Gantt, verbatim, over this
 * entry's own columns and stages. The catalogue plots twelve months of sowing,
 * flowering and harvest; this entry plots the twenty-four hours of a day.
 */
export function EggLifecycle({ egg }: { egg: EasterEggEntry }) {
  const { t } = useTranslation();
  const mode = useTheme().palette.mode;
  const { timeline } = egg;
  const columns = timeline.columns;
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
          {timeline.caption}
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
            aria-label={timeline.label}
            sx={{ minWidth: timelineMinW }}
          >
            {/* Column header: vertical gridlines between columns. */}
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
              {timeline.stages.map((s) => {
                const runs = toRuns(s.spans, columns.length);
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

        {/* Legend: divider above, colour swatch + short word per stage. */}
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
          {timeline.stages.map((s) => (
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
              {s.label}
            </Box>
          ))}
        </Box>
      </Box>

      {egg.plant.lifeCycle === 'Perennial' ||
      egg.plant.lifeCycle === 'HerbaceousPerennial' ? (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 1.5, display: 'block' }}
        >
          {t('plantDetail.lifecycle.perennialNote')}
        </Typography>
      ) : egg.plant.lifeCycle === 'Biennial' ? (
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
