import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import AgricultureIcon from '@mui/icons-material/Agriculture';
import GrassIcon from '@mui/icons-material/Grass';
import LocalFloristIcon from '@mui/icons-material/LocalFlorist';
import EmojiNatureIcon from '@mui/icons-material/EmojiNature';
import YardIcon from '@mui/icons-material/Yard';
import type { Plant } from '../../types/Plant';
import { periodToMonths } from '../../utils/formatPeriod';

// Terracotta accent shared with the TOC "coming-data" state (PlantDetailToc.tsx).
// SMA-184: dark-mode / AA-contrast audit pending for these literals.
const COMING_DATA = '#C88968';
const TITLE_GREEN = '#2E8B57';

// Stage bar / legend swatch colours, aligned to the v2 mockup (p.2).
const STAGE_COLORS: Record<string, string> = {
  sowing: '#A5D6A7', // light green — seed / sowing
  growth: '#3C9A5F', // medium green — growth
  flowering: '#E0A526', // amber / gold — flowering
  fruiting: '#D1495B', // tomato red — fruiting
  harvest: '#A8642A', // brown — harvest
};

// Plain outline glyphs (no coloured disc) — the colour lives in the bars + legend.
const STAGE_ICONS: Record<string, ReactNode> = {
  sowing: <GrassIcon sx={{ fontSize: 19, color: 'text.secondary' }} />,
  growth: <YardIcon sx={{ fontSize: 19, color: 'text.secondary' }} />,
  flowering: (
    <LocalFloristIcon sx={{ fontSize: 19, color: 'text.secondary' }} />
  ),
  fruiting: <EmojiNatureIcon sx={{ fontSize: 19, color: 'text.secondary' }} />,
  harvest: <AgricultureIcon sx={{ fontSize: 19, color: 'text.secondary' }} />,
};

// Legend uses SHORT words (mockup) — distinct from the full row labels.
const LEGEND: ReadonlyArray<{ stageKey: string; legendKey: string }> = [
  { stageKey: 'sowing', legendKey: 'seed' },
  { stageKey: 'growth', legendKey: 'plant' },
  { stageKey: 'flowering', legendKey: 'flowering' },
  { stageKey: 'fruiting', legendKey: 'fruits' },
  { stageKey: 'harvest', legendKey: 'harvest' },
];

const LABEL_W = 170; // fixed left label column (fits "Plant · croissance" on one line)
const TIMELINE_MIN_W = 680; // min width before horizontal scroll kicks in (mobile)

/** Collapse a set of 1-based month indices into contiguous [start,end] runs (1=Jan). */
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

/** A single stage row: fixed label cell + a 12-column track holding pill bars. */
function StageRow({
  icon,
  label,
  color,
  months,
}: {
  icon: ReactNode;
  label: string;
  color: string;
  months: number[];
}) {
  const runs = toRuns(months);
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={0.75}
        sx={{ width: LABEL_W, flexShrink: 0, pr: 1 }}
      >
        <Box
          sx={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </Box>
        <Typography
          variant="body2"
          fontWeight={600}
          sx={{ whiteSpace: 'nowrap' }}
        >
          {label}
        </Typography>
      </Stack>
      <Box
        sx={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'repeat(12, 1fr)',
          alignItems: 'center',
          columnGap: '2px',
          height: 22,
        }}
      >
        {runs.map((run) => (
          <Box
            key={`${run.start}-${run.end}`}
            sx={{
              gridColumn: `${run.start} / ${run.end + 1}`,
              height: 16,
              borderRadius: 999,
              bgcolor: color,
            }}
          />
        ))}
      </Box>
    </Box>
  );
}

/**
 * Seasonal calendar for Plant Detail v2 (SMA-78, PR C). 12-month Gantt timeline
 * (mockup p.2): a month header plus one bar per stage (sowing / growth /
 * flowering / fruiting / harvest) spanning its active months, derived from
 * `sowingPeriod` / `harvestPeriod` and the Perenual flowering / harvest seasons
 * via {@link periodToMonths}. Stages without a data source (growth, fruiting)
 * render an empty track — the labelled row is kept for parity with the mockup.
 * The "Indoor · greenhouse · IoT" mode (per-phase durations in DAYS) has no data
 * source yet (tracked in SMA-197), so its toggle segment is disabled and the
 * section carries a COMING SOON · DATA badge. Pure: the parent mounts it only
 * when `showLifecycleSection` is true (TOC state unchanged — Option B).
 */
export default function LifecycleSection({ plant }: { plant: Plant }) {
  const { t } = useTranslation();
  const months = t('plantDetail.lifecycle.monthsShort', {
    returnObjects: true,
  }) as unknown as string[];

  const stages = [
    { key: 'sowing', months: periodToMonths(plant.sowingPeriod) },
    // Growth has no period data source, so its track is intentionally empty.
    { key: 'growth', months: [] as number[] },
    {
      key: 'flowering',
      months: periodToMonths(plant.perenualData?.floweringSeason),
    },
    // Fruiting has no dedicated data source yet — empty track, row kept (mockup).
    { key: 'fruiting', months: [] as number[] },
    {
      key: 'harvest',
      months: periodToMonths(
        plant.harvestPeriod ?? plant.perenualData?.harvestSeason
      ),
    },
  ];

  return (
    <Card
      id="lifecycle"
      variant="outlined"
      sx={{ mb: 3, borderRadius: 3, scrollMarginTop: '80px' }}
    >
      <CardContent>
        {/* Header: title + COMING SOON·DATA badge + caption (left), mode toggle (right). */}
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="flex-start"
          flexWrap="wrap"
          gap={1.5}
        >
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" alignItems="center" flexWrap="wrap" gap={1}>
              <Typography
                variant="h6"
                fontWeight={600}
                sx={{ color: TITLE_GREEN }}
              >
                {t('plantDetail.lifecycle.sectionTitle')}
              </Typography>
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.5,
                  px: 1,
                  py: 0.25,
                  borderRadius: 999,
                  border: `1px solid ${COMING_DATA}`,
                  color: COMING_DATA,
                  fontSize: 10.5,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  whiteSpace: 'nowrap',
                }}
              >
                <AccessTimeIcon sx={{ fontSize: 13 }} />
                {t('plantDetail.comingSoonDataBadge')}
              </Box>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {t('plantDetail.lifecycle.caption')}
            </Typography>
          </Box>

          <ToggleButtonGroup
            size="small"
            exclusive
            value="outdoor"
            onChange={() => {}}
            aria-label={t('plantDetail.lifecycle.sectionTitle')}
            sx={{
              flexShrink: 0,
              bgcolor: '#F1F3F4',
              borderRadius: 2,
              p: '3px',
              gap: '3px',
              '& .MuiToggleButtonGroup-grouped': {
                border: 0,
                borderRadius: '8px',
                textTransform: 'none',
                px: 1.5,
                color: 'text.secondary',
                '&.Mui-selected': {
                  bgcolor: '#fff',
                  color: 'text.primary',
                  fontWeight: 600,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
                  '&:hover': { bgcolor: '#fff' },
                },
                '&.Mui-disabled': { border: 0, color: 'text.disabled' },
              },
            }}
          >
            <ToggleButton value="outdoor">
              {t('plantDetail.lifecycle.modeOutdoor')}
            </ToggleButton>
            <ToggleButton value="indoor" disabled>
              {t('plantDetail.lifecycle.modeIndoor')}
            </ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        {/* Timeline — horizontally scrollable on small screens (card never overflows). */}
        <Box sx={{ overflowX: 'auto', mt: 2 }}>
          <Box sx={{ minWidth: TIMELINE_MIN_W }}>
            {/* Month header row: label spacer + 12 month columns. */}
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box sx={{ width: LABEL_W, flexShrink: 0 }} />
              <Box
                sx={{
                  flex: 1,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(12, 1fr)',
                  columnGap: '2px',
                }}
              >
                {months.map((m, i) => (
                  <Typography
                    key={i}
                    variant="caption"
                    color="text.secondary"
                    sx={{ textAlign: 'center', fontWeight: 600 }}
                  >
                    {m}
                  </Typography>
                ))}
              </Box>
            </Box>

            {stages.map((s) => (
              <StageRow
                key={s.key}
                icon={STAGE_ICONS[s.key]}
                label={t(`plantDetail.lifecycle.stages.${s.key}`)}
                color={STAGE_COLORS[s.key]}
                months={s.months}
              />
            ))}
          </Box>
        </Box>

        {/* Legend: colour swatch + short stage word for the five stages. */}
        <Stack direction="row" flexWrap="wrap" gap={2} sx={{ mt: 2.5 }}>
          {LEGEND.map((l) => (
            <Stack
              key={l.legendKey}
              direction="row"
              alignItems="center"
              spacing={0.75}
            >
              <Box
                sx={{
                  width: 12,
                  height: 12,
                  borderRadius: 0.5,
                  bgcolor: STAGE_COLORS[l.stageKey],
                }}
              />
              <Typography variant="caption" color="text.secondary">
                {t(`plantDetail.lifecycle.legend.${l.legendKey}`)}
              </Typography>
            </Stack>
          ))}
        </Stack>

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
      </CardContent>
    </Card>
  );
}
