import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import SectionHeader from '../../components/plantDetail/SectionHeader';
import StatusBadge from '../../components/plantDetail/StatusBadge';
import { adaptBadge } from '../../utils/badgeColors';
import type { EasterEggEntry } from '../types';

const ER = 'plantDetail.externalResources';

// Light-mode mockup palette (dark mode reads theme tokens), copied verbatim.
const LIGHT = {
  rowBg: '#FFFFFF',
  rowBorder: '#E2EADF',
  rowBorderHover: '#BCE2CC',
  pillBg: '#E6F4EC',
  pillFg: '#1B5E3A',
} as const;

/** Map an enrichment source label to its provenance-chip palette. */
function sourceTypeColors(source: string): { bg: string; fg: string } {
  switch (source) {
    case 'Manual':
      return { bg: '#E0E0E0', fg: '#212121' };
    case 'GBIF':
      return { bg: '#E1F5FE', fg: '#01579B' };
    case 'Trefle':
      return { bg: '#E8F5E9', fg: '#1B5E20' };
    case 'Perenual':
      return { bg: '#FFF3E0', fg: '#E65100' };
    default:
      return { bg: '#F5F5F5', fg: '#424242' };
  }
}

/**
 * Section 12 for an easter egg: ExternalResourcesSection's cards and its
 * enrichment-provenance banner, verbatim. The catalogue builds its rows from a
 * binomial; this entry writes them, and none carries a link because no public
 * page for them could be verified, so no card promises navigation it cannot do.
 */
export function EggResources({ egg }: { egg: EasterEggEntry }) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const mode = palette.mode;
  const dark = mode === 'dark';
  const plant = egg.plant;

  const fullyEnriched =
    plant.enrichmentSources.includes('Manual') &&
    plant.enrichmentSources.includes('GBIF') &&
    plant.enrichmentSources.includes('Trefle') &&
    plant.enrichmentSources.includes('Perenual');

  const rowBorder = dark ? 'rgba(255,255,255,0.10)' : LIGHT.rowBorder;
  const rowBg = dark ? 'rgba(255,255,255,0.03)' : LIGHT.rowBg;
  const rowBorderHover = dark ? palette.primary.main : LIGHT.rowBorderHover;
  const pillBg = dark ? palette.primary.main : LIGHT.pillBg;
  const pillFg = dark ? palette.primary.contrastText : LIGHT.pillFg;

  return (
    <Box id="sources" sx={{ mb: 3, scrollMarginTop: '80px' }}>
      <SectionHeader
        title={t(`${ER}.title`)}
        badge={<StatusBadge variant="build" />}
        mb="12px"
      />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {egg.resources.map((r) => (
          <Box
            key={r.key}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              p: '12px 14px',
              borderRadius: '10px',
              border: '1px solid',
              borderColor: rowBorder,
              bgcolor: rowBg,
              color: 'inherit',
              transition: 'border-color 0.15s ease',
              '&:hover': { borderColor: rowBorderHover },
            }}
          >
            <Box
              sx={{
                flexShrink: 0,
                width: 34,
                height: 34,
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: pillBg,
                color: pillFg,
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: '0.02em',
              }}
            >
              {r.abbrev}
            </Box>

            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Typography
                  sx={{ fontSize: 14, fontWeight: 700, color: 'heading' }}
                >
                  {r.label}
                </Typography>
              </Box>
              <Typography
                sx={{ fontSize: 12, color: 'text.secondary', mt: '1px' }}
              >
                {r.description}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>

      {/* Enrichment-provenance banner (source chips + last-enriched date). */}
      <Box
        sx={{
          mt: '16px',
          pt: '14px',
          borderTop: '1px solid',
          borderColor: rowBorder,
        }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          display="block"
          sx={{ mb: 0.5 }}
        >
          {t('plantDetail.sections.sources')}
        </Typography>
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
          {plant.enrichmentSources.map((src) => {
            const b = adaptBadge(sourceTypeColors(src), mode);
            return (
              <Chip
                key={src}
                label={t(`plantDetail.enumValues.sourceType.${src}`, src)}
                size="small"
                sx={{
                  bgcolor: b.bg,
                  color: b.fg,
                  border: '1px solid',
                  borderColor: b.border,
                  fontWeight: 500,
                }}
              />
            );
          })}
          {!fullyEnriched && (
            <Chip
              label={t('plantDetail.fallback.notEnriched')}
              size="small"
              variant="outlined"
              color="default"
            />
          )}
        </Stack>
      </Box>
    </Box>
  );
}
