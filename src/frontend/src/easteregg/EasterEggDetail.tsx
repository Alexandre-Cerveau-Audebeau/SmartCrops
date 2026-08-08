import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import type { TocSection } from '../components/plantDetail/PlantDetailToc';
import EggToc from './EggToc';
import UnitSystemToggle from '../components/plantDetail/UnitSystemToggle';
import AboutSection from '../components/plantDetail/AboutSection';
import { PlantBreadcrumb } from '../components/plantDetail/PlantBreadcrumb';
import { AiAssistantFab } from '../components/plantDetail/AiAssistantFab';
import { CommonNamesSection } from '../components/plantDetail/CommonNamesSection';
import { BotanicalSynonymsSection } from '../components/plantDetail/BotanicalSynonymsSection';
import { CommunitySection } from '../components/plantDetail/CommunitySection';
import { adaptBadge } from '../utils/badgeColors';
import { pickHeroImage } from '../utils/plantDetail';
import type { EasterEggEntry } from './types';
import {
  EggCharacteristics,
  EggCulture,
  EggDistribution,
  EggFaq,
  EggFinalLine,
  EggGallery,
  EggGauges,
  EggLifecycle,
  EggNotes,
  EggObservations,
  EggPests,
  EggResources,
  EggScientific,
  EggSimilar,
} from './sections';

/**
 * SMA-394: the whole hidden page, in one file, in this folder.
 *
 * The shell (breadcrumb, sticky rail, hero card, admin actions) is copied from
 * PlantDetail so the page renders exactly as the catalogue's does; the fifteen
 * sections come from `./sections`, each the counterpart of one plantDetail
 * component. PlantDetail itself keeps nothing but the two-line switch that
 * routes here, and no shared component knows this feature exists.
 *
 * What is deliberately NOT copied, because it can never fire for an entry that
 * has no API row and no photograph: the fetch effect and its loading / error /
 * not-found states, the photo lightbox, and the planner back button.
 */

// Anchor offset for in-page section navigation (SMA-247), as PlantDetail sets it.
const SECTION_SCROLL_MARGIN = {
  scrollMarginTop: { xs: '104px', md: '80px' },
} as const;

/**
 * The frozen 15-entry sommaire. Every state is constant for an easter egg.
 *
 * The four teaser states are kept deliberately: those features really are still
 * coming, so the badge is honest and the dot keeps its colour. They are still
 * reachable, because `EggToc` renders every entry as an anchor — all fifteen
 * sections exist on this page, unlike on a real plant page.
 */
const TOC_SECTIONS: TocSection[] = [
  { num: '01', id: 'overview', labelKey: 'plantDetail.sections.overview', state: 'live' },
  { num: '02', id: 'gallery', labelKey: 'plantDetail.sections.gallery', state: 'live' },
  { num: '03', id: 'distribution', labelKey: 'plantDetail.sections.distribution', state: 'coming-data' },
  { num: '04', id: 'lifecycle', labelKey: 'plantDetail.sections.lifecycle', state: 'live' },
  { num: '05', id: 'scientific-data', labelKey: 'plantDetail.scientificData.title', state: 'live' },
  { num: '06', id: 'characteristics', labelKey: 'plantDetail.sections.characteristics', state: 'live' },
  { num: '07', id: 'edible', labelKey: 'plantDetail.sections.edibleAndPropagation', state: 'live' },
  { num: '08', id: 'pests', labelKey: 'plantDetail.sections.pestsAndDiseases', state: 'live' },
  { num: '09', id: 'common-names', labelKey: 'plantDetail.sections.commonNames', state: 'live' },
  { num: '10', id: 'synonyms', labelKey: 'plantDetail.sections.synonyms', state: 'live' },
  { num: '11', id: 'plantnet', labelKey: 'plantDetail.sections.plantnet', state: 'coming-data' },
  { num: '12', id: 'sources', labelKey: 'plantDetail.sections.sources', state: 'live' },
  { num: '13', id: 'similar', labelKey: 'plantDetail.sections.similar', state: 'coming-backend' },
  { num: '14', id: 'faq', labelKey: 'plantDetail.sections.faq', state: 'live' },
  { num: '15', id: 'community', labelKey: 'plantDetail.sections.community', state: 'coming-backend' },
];

/** The taxonomy pill of the hero row (family / genus), copied from PlantDetail. */
function TaxonomyPill({ label, value }: { label: string; value: string }) {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        bgcolor: 'surfaceSubtle',
        color: 'text.primary',
        border: '1px solid',
        borderColor: 'borderSubtle',
        borderRadius: '999px',
        padding: '6px 12px',
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      <Box component="span" sx={{ color: 'text.secondary', fontWeight: 500 }}>
        {label}
      </Box>
      {value}
    </Box>
  );
}

export default function EasterEggDetail({ egg }: { egg: EasterEggEntry }) {
  const { t } = useTranslation();
  const mode = useTheme().palette.mode;

  const plant = egg.plant;
  const displayName = plant.commonName ?? plant.scientificName;
  // `plantType` and `lifeCycle` are nullable on Plant. This entry fills both,
  // but the registry is meant to grow, so read them through guards rather than
  // through `!`: a second entry that omits one must not white-screen the route.
  const typeName = plant.plantType?.name ?? null;
  const typeLabel = typeName ? t(`plantTypes.${typeName}`, typeName) : null;
  const cycleLabel = plant.lifeCycle
    ? t(`plantDetail.enumValues.lifeCycle.${plant.lifeCycle}`, plant.lifeCycle)
    : null;
  const heroEyebrow = [typeLabel, cycleLabel].filter(Boolean).join(' · ');
  // The only trait this entry states as a fact, in the hero's chip palette.
  const pollinatorChip = adaptBadge({ bg: '#F3E5F5', fg: '#4A148C' }, mode);

  return (
    <Container
      maxWidth={false}
      disableGutters
      sx={{
        pt: 4,
        pb: 6,
        px: { xs: 2, md: 4 },
        // Inter's subsets carry no kana or kanji. Scoped to this page only, and
        // excluding the icon font, whose own rule would otherwise be outranked
        // and every glyph would render as its ligature name.
        '& :not(.material-symbols-outlined)': { fontFamily: egg.fontStack },
      }}
    >
      <PlantBreadcrumb
        libraryLabel={t('plantDetail.breadcrumb.library')}
        libraryHref="/library"
        typeLabel={typeLabel}
        currentLabel={displayName}
      />

      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          gap: { xs: 2, md: 8 },
          alignItems: { md: 'flex-start' },
          width: '100%',
        }}
      >
        <Box
          sx={{
            width: { xs: '100%', md: 272 },
            flexShrink: { md: 0 },
            position: 'sticky',
            top: { xs: 56, md: 80 },
            zIndex: 2,
            maxHeight: { md: 'calc(100vh - 96px)' },
            display: { md: 'flex' },
            flexDirection: { md: 'column' },
            minHeight: { md: 0 },
          }}
        >
          <Box
            sx={{ mb: 2, flexShrink: 0, display: { xs: 'none', md: 'block' } }}
          >
            <UnitSystemToggle />
          </Box>
          <EggToc sections={TOC_SECTIONS} disableSticky />
        </Box>
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            '& [id]': SECTION_SCROLL_MARGIN,
          }}
        >
          {/* ── Section 01: Hero header ──────────────────────────────────── */}
          <Card
            id="overview"
            variant="outlined"
            sx={{
              mb: 3,
              overflow: 'hidden',
              borderRadius: 3,
            }}
          >
            <CardContent>
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: { xs: 'column', md: 'row' },
                  gap: '28px',
                  alignItems: 'flex-start',
                }}
              >
                {/* ── Left column: hero artwork ─────────────────────────── */}
                <Box
                  sx={{
                    position: 'relative',
                    width: { xs: '100%', md: '46%' },
                    flexShrink: 0,
                    aspectRatio: '4 / 3',
                    maxHeight: { md: 360 },
                    borderRadius: '14px',
                    overflow: 'hidden',
                    bgcolor: 'grey.100',
                  }}
                >
                  <Box
                    component="img"
                    src={pickHeroImage(plant)}
                    alt={displayName}
                    sx={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                </Box>
                {/* ── Right column: title, taxonomy, badges ─────────────── */}
                <Box
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      sx={{
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: 'eyebrow',
                        mb: 0.5,
                      }}
                    >
                      {heroEyebrow}
                    </Typography>
                    <Typography
                      variant="h3"
                      fontWeight={700}
                      sx={{ mb: 0.5, color: 'heading' }}
                    >
                      {displayName}
                    </Typography>
                    <Typography
                      variant="h6"
                      color="text.secondary"
                      sx={{ fontStyle: 'italic' }}
                    >
                      {plant.scientificName}
                      {plant.author ? (
                        <Typography
                          component="span"
                          color="text.secondary"
                          sx={{ fontStyle: 'normal', ml: 1 }}
                        >
                          {plant.author}
                        </Typography>
                      ) : null}
                    </Typography>
                    <Stack
                      direction="row"
                      spacing={1}
                      flexWrap="wrap"
                      useFlexGap
                      sx={{ mt: 1.5, alignItems: 'center' }}
                    >
                      {plant.family && (
                        <TaxonomyPill
                          label={t('plantDetail.labels.family')}
                          value={plant.family}
                        />
                      )}
                      {plant.genus && (
                        <TaxonomyPill
                          label={t('plantDetail.labels.genus')}
                          value={plant.genus}
                        />
                      )}
                    </Stack>
                    <Stack
                      direction="row"
                      spacing={1}
                      flexWrap="wrap"
                      useFlexGap
                      sx={{ mt: 1.5 }}
                    >
                      <Box
                        sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          bgcolor: pollinatorChip.bg,
                          color: pollinatorChip.fg,
                          border: '1px solid',
                          borderColor: pollinatorChip.border,
                          borderRadius: '8px',
                          padding: '7px 12px',
                          fontSize: 13,
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {t('plantDetail.flags.attractsPollinators')}
                      </Box>
                    </Stack>
                  </Box>
                  {/*
                    The catalogue's admin re-enrich menu is deliberately NOT
                    copied here. It would post this entry's synthetic id to the
                    privileged Trefle / Perenual endpoints, which can only ever
                    answer "not found" for a plant that has no database row, so
                    the only outcomes were a warning toast and a confusing line
                    in the admin audit trail.
                  */}
                </Box>
              </Box>
              <EggGauges gauges={egg.gauges} />
              <AboutSection key={plant.id} plant={plant} />
            </CardContent>
          </Card>

          <EggGallery egg={egg} />
          <EggDistribution egg={egg} />
          <EggLifecycle egg={egg} />
          <EggNotes notes={egg.notes.lifecycle} />
          <EggScientific egg={egg} />
          <EggNotes notes={egg.notes.scientific} />
          <EggCharacteristics egg={egg} />
          <EggNotes notes={egg.notes.characteristics} />
          <EggCulture egg={egg} />
          <EggNotes notes={egg.notes.culture} />
          <EggPests egg={egg} />
          <EggNotes notes={egg.notes.pests} />
          <CommonNamesSection
            key={`common-names-${plant.id}`}
            commonNames={plant.commonNames}
          />
          <BotanicalSynonymsSection
            key={`botanical-synonyms-${plant.id}`}
            synonyms={plant.synonyms}
          />
          <EggObservations egg={egg} />
          <EggResources egg={egg} />
          <EggSimilar egg={egg} />
          <EggFaq egg={egg} />
          <CommunitySection />
          <EggFinalLine text={egg.finalLine} />
        </Box>
      </Box>

      <AiAssistantFab />
    </Container>
  );
}
