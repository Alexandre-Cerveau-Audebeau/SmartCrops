import { memo } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import SectionHeader from './SectionHeader';
import StatusBadge from './StatusBadge';
import { Sym } from '../Sym';
import { adaptBadge } from '../../utils/badgeColors';
import {
  isUserFacingUrl,
  toUserFacingUrl,
} from '../../utils/externalSourceUrl';
import {
  buildExternalResourceLinks,
  type ExternalResourceLink,
} from '../../utils/externalResources';
import type { Plant } from '../../types/Plant';

const ER = 'plantDetail.externalResources';

// Two-letter pill abbreviations, keyed by resource (matches the mockup).
const ABBREV: Readonly<Record<string, string>> = {
  gbif: 'GB',
  wfo: 'WF',
  perenual: 'PE',
  powo: 'PO',
  ipni: 'IP',
  eppo: 'EP',
  plantuse: 'PU',
  wikipedia: 'WP',
};

// Light-mode mockup palette (dark mode reads theme tokens). Named to satisfy the
// no-inline-hex rule (SMA-226).
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
 * External resources for Plant Detail v2 (SMA-246, section 12). A curated list of
 * authoritative catalogue links (GBIF, WFO, Perenual, POWO, IPNI, EPPO, PlantUse,
 * Wikipedia) built by the pure {@link buildExternalResourceLinks} helper: direct
 * id-addressed pages when we have the id, name-search links otherwise. Below the
 * list, the enrichment-provenance banner (source chips + last-enriched date) is
 * kept from the previous inline "sources" card. Real data only, BUILD NOW badge,
 * always mounted (scientific name is always present). Mode-aware; the `id="sources"`
 * TOC anchor is preserved.
 */
export const ExternalResourcesSection = memo(function ExternalResourcesSection({
  plant,
}: {
  plant: Plant;
}) {
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const mode = palette.mode;
  const dark = mode === 'dark';

  // Perenual public page derived from the persisted API source URL
  // (requestedPerenualId-aware), kept only if it isn't an API endpoint.
  const perenualSource = plant.sources.find((s) => s.sourceType === 'Perenual');
  const perenualUserUrl = perenualSource
    ? toUserFacingUrl(
        perenualSource.url,
        plant.perenualData?.requestedPerenualId
      )
    : null;

  const links = buildExternalResourceLinks({
    scientificName: plant.scientificName,
    gbifTaxonKey: plant.gbifTaxonKey,
    wfoId: plant.wfoId,
    perenualUserUrl: isUserFacingUrl(perenualUserUrl) ? perenualUserUrl : null,
    lang: i18n.language,
  });

  const fullyEnriched =
    plant.enrichmentSources.includes('Manual') &&
    plant.enrichmentSources.includes('GBIF') &&
    plant.enrichmentSources.includes('Trefle') &&
    plant.enrichmentSources.includes('Perenual');

  const rowBg = dark ? 'rgba(255,255,255,0.03)' : LIGHT.rowBg;
  const rowBorder = dark ? 'rgba(255,255,255,0.10)' : LIGHT.rowBorder;
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
        {links.map((l: ExternalResourceLink) => (
          <Link
            key={l.key}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            underline="none"
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
              {ABBREV[l.key]}
            </Box>

            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Typography
                  sx={{ fontSize: 14, fontWeight: 700, color: 'heading' }}
                >
                  {t(l.labelKey)}
                </Typography>
                {l.isNew && (
                  <Box
                    component="span"
                    sx={{
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      px: '6px',
                      py: '2px',
                      borderRadius: '6px',
                      bgcolor: dark ? 'rgba(46,139,87,0.25)' : LIGHT.pillBg,
                      color: dark ? palette.primary.main : LIGHT.pillFg,
                    }}
                  >
                    {t(`${ER}.badgeNew`)}
                  </Box>
                )}
              </Box>
              <Typography
                sx={{ fontSize: 12, color: 'text.secondary', mt: '1px' }}
              >
                {t(l.descriptionKey)}
              </Typography>
            </Box>

            <Box
              component="span"
              sx={{
                flexShrink: 0,
                display: 'inline-flex',
                color: 'text.secondary',
              }}
            >
              <Sym name="open_in_new" size={16} color="inherit" />
            </Box>
          </Link>
        ))}
      </Box>

      {/* Enrichment-provenance banner (source chips + last-enriched date), kept
          from the previous inline "sources" card. */}
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
        {plant.lastEnrichmentAt && (
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            sx={{ mt: 0.75 }}
          >
            {t('plantDetail.labels.lastEnriched')}:{' '}
            {new Date(plant.lastEnrichmentAt).toLocaleDateString(i18n.language)}
          </Typography>
        )}
      </Box>
    </Box>
  );
});
