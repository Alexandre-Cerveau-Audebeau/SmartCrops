import { memo } from 'react';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import SectionHeader from './SectionHeader';
import StatusBadge from './StatusBadge';

const O = 'plantDetail.observations';

// Decorative continent blobs for the mini observation map — purely visual
// teaser (no real geo/observation data yet).
const MAP_BLOBS = [
  { left: '14%', top: '32%', w: 110, h: 60 },
  { left: '52%', top: '28%', w: 150, h: 70 },
];
const MONTH_KEYS = [
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
] as const;

/**
 * Observations & phenology teaser for Plant Detail v2 (SMA-78, section 11).
 * Empty-state panel carrying the "COMING SOON · DATA" badge: the structure
 * (per-year chart card, top-contributors card, decorative mini observation
 * map, 12-month phenology band) is shown with honest empty states — no
 * invented values — until the section is wired to real PlantNet/GBIF data.
 * Always mounted (teaser, not gated); the matching TOC entry (`plantnet`)
 * stays `coming-data` (non-clickable). Colours are mode-aware.
 */
export const ObservationsSection = memo(function ObservationsSection({
  // --- SMA-394 easter eggs — delete these three lines to remove ---
  series,
  seriesTitle,
  contributors,
}: {
  /** Bars for the left-hand chart, replacing its empty state. */
  series?: readonly {
    readonly label: string;
    readonly value: number;
    readonly note?: string;
  }[];
  /** Title of that chart when the series is not per-year. */
  seriesTitle?: string;
  /** Rows for the contributors panel, replacing its empty state. */
  contributors?: readonly { readonly name: string; readonly count: string }[];
  // --- end SMA-394 ---
} = {}) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const dark = palette.mode === 'dark';

  const cardBg = palette.background.paper;
  const mapBg = dark ? '#16242C' : '#E8F1F6';
  const blob = dark ? 'rgba(120,170,105,0.40)' : 'rgba(123,168,107,0.50)';
  const emptyPhase = dark ? 'rgba(255,255,255,0.10)' : '#E6E9E7';
  const legendGrowth = dark ? '#4FB37C' : '#52A06D';
  const legendFlowering = dark ? '#E0B14E' : '#E0A82E';
  const legendFruiting = dark ? '#D06A4A' : '#C0512E';

  // Reuse the already-localized short month labels (Jan…Dec / Jan…Déc); fall
  // back to the static keys if the i18n value isn't a string array.
  const monthsRaw = t('plantDetail.lifecycle.monthsShort', {
    returnObjects: true,
  });
  const months =
    Array.isArray(monthsRaw) &&
    monthsRaw.length === 12 &&
    monthsRaw.every((m): m is string => typeof m === 'string')
      ? monthsRaw
      : MONTH_KEYS;

  const cardSx = {
    bgcolor: cardBg,
    border: '1px solid',
    borderColor: 'borderSubtle',
    borderRadius: 3,
    p: 2.5,
  } as const;
  const cardTitleSx = {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: 'text.secondary',
  } as const;
  const emptyMsgSx = {
    fontSize: 13,
    color: 'text.secondary',
    textAlign: 'center',
  } as const;

  return (
    <Box id="plantnet" sx={{ mb: 3, scrollMarginTop: '80px' }}>
      <SectionHeader
        title={t(`${O}.sectionTitle`)}
        badge={<StatusBadge variant="data" />}
        mb="4px"
      />
      <Typography
        sx={{ m: 0, mb: '14px', fontSize: 13, color: 'text.secondary' }}
      >
        {t(`${O}.caption`)}
      </Typography>

      {/* Top row: per-year chart (left, wide) + contributors & mini-map (right) */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1.5fr 1fr' },
          gap: 2,
          mb: 2,
        }}
      >
        {/* ── Per-year chart card — empty state, or a written series ── */}
        <Box sx={cardSx}>
          <Typography sx={{ ...cardTitleSx, mb: 2 }}>
            {seriesTitle ?? t(`${O}.perYearTitle`)}
          </Typography>
          {series && series.length > 0 ? (
            /* --- SMA-394 easter eggs — delete this branch to remove --- */
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: `repeat(${series.length}, 1fr)`,
                alignItems: 'end',
                gap: 1,
                minHeight: 200,
              }}
            >
              {series.map((s) => {
                const peak = Math.max(...series.map((x) => x.value));
                const bar = (
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: 0.75,
                      height: 200,
                    }}
                  >
                    <Typography
                      sx={{ fontSize: 11, fontWeight: 700, color: 'heading' }}
                    >
                      {s.value}
                    </Typography>
                    <Box
                      sx={{
                        width: '100%',
                        height: `${Math.round((s.value / peak) * 74)}%`,
                        minHeight: 8,
                        borderRadius: '6px 6px 0 0',
                        bgcolor: legendGrowth,
                      }}
                    />
                    <Typography
                      sx={{
                        fontSize: 11,
                        color: 'text.secondary',
                        textAlign: 'center',
                        lineHeight: 1.25,
                      }}
                    >
                      {s.label}
                    </Typography>
                  </Box>
                );
                return s.note ? (
                  <Tooltip key={s.label} title={s.note} arrow placement="top">
                    <Box>{bar}</Box>
                  </Tooltip>
                ) : (
                  <Box key={s.label}>{bar}</Box>
                );
              })}
            </Box>
          ) : (
            /* --- end SMA-394 --- */
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 200,
              }}
            >
              <Typography sx={emptyMsgSx}>{t(`${O}.emptyChart`)}</Typography>
            </Box>
          )}
        </Box>

        {/* ── Right column: contributors + mini observation map ── */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={cardSx}>
            <Typography sx={{ ...cardTitleSx, mb: 1.5 }}>
              {t(`${O}.topContributors`)}
            </Typography>
            {contributors && contributors.length > 0 ? (
              /* --- SMA-394 easter eggs — delete this branch to remove --- */
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  gap: 1,
                  minHeight: 96,
                }}
              >
                {contributors.map((c) => (
                  <Box
                    key={c.name}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1.5,
                    }}
                  >
                    <Typography
                      sx={{ fontSize: 14, fontWeight: 700, color: 'heading' }}
                    >
                      {c.name}
                    </Typography>
                    <Typography
                      sx={{ fontSize: 12, color: 'text.secondary' }}
                    >
                      {c.count}
                    </Typography>
                  </Box>
                ))}
              </Box>
            ) : (
              /* --- end SMA-394 --- */
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 96,
                }}
              >
                <Typography sx={emptyMsgSx}>
                  {t(`${O}.emptyContributors`)}
                </Typography>
              </Box>
            )}
          </Box>

          {/* Mini observation map — decorative (blue canvas + green blobs), no data dots */}
          <Box
            aria-hidden
            sx={{
              position: 'relative',
              flex: 1,
              minHeight: 130,
              borderRadius: 3,
              overflow: 'hidden',
              bgcolor: mapBg,
              border: '1px solid',
              borderColor: 'borderSubtle',
            }}
          >
            {MAP_BLOBS.map((b, i) => (
              <Box
                key={i}
                sx={{
                  position: 'absolute',
                  left: b.left,
                  top: b.top,
                  width: b.w,
                  height: b.h,
                  borderRadius: '50%',
                  background: `radial-gradient(ellipse at center, ${blob} 0%, transparent 72%)`,
                  filter: 'blur(5px)',
                }}
              />
            ))}
            <Box
              sx={{
                position: 'absolute',
                bottom: 10,
                left: 10,
                bgcolor: cardBg,
                borderRadius: 5,
                px: 1.25,
                py: 0.5,
                boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
              }}
            >
              <Typography
                sx={{ fontSize: 12, fontWeight: 600, color: 'text.secondary' }}
              >
                {t(`${O}.obsMapLabel`)}
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Full-width phenology band — empty state (all months grey) */}
      <Box sx={cardSx}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 1,
            mb: 2,
          }}
        >
          <Typography sx={cardTitleSx}>{t(`${O}.phenologyTitle`)}</Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            {[
              { key: 'phaseGrowth', c: legendGrowth },
              { key: 'phaseFlowering', c: legendFlowering },
              { key: 'phaseFruiting', c: legendFruiting },
            ].map((l) => (
              <Box
                key={l.key}
                sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
              >
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    bgcolor: l.c,
                  }}
                />
                <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                  {t(`${O}.${l.key}`)}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(12, 1fr)',
            gap: 0.75,
          }}
        >
          {MONTH_KEYS.map((mk, i) => (
            <Box
              key={mk}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 0.75,
              }}
            >
              <Box
                sx={{
                  width: '100%',
                  height: 22,
                  borderRadius: 1,
                  bgcolor: emptyPhase,
                }}
              />
              <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
                {months[i]}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
});
