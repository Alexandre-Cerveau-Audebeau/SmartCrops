import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import RefreshIcon from '@mui/icons-material/Refresh';
import SettingsIcon from '@mui/icons-material/Settings';
import { useAuth } from '../hooks/useAuth';
import {
  classifyReEnrich,
  reEnrichPerenual,
  reEnrichTrefle,
  type ReEnrichResponse,
} from '../services/adminApi';
import PlantDetailToc from '../components/plantDetail/PlantDetailToc';
import type { TocSection } from '../components/plantDetail/PlantDetailToc';
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
 * The frozen 15-entry sommaire. Every state is constant for an easter egg: the
 * four teasers keep the catalogue's non-clickable treatment, everything else is
 * live because every section renders.
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

type ToastSeverity = 'success' | 'info' | 'warning' | 'error';
type Toast = { message: string; severity: ToastSeverity };

export default function EasterEggDetail({ egg }: { egg: EasterEggEntry }) {
  const { t } = useTranslation();
  const mode = useTheme().palette.mode;
  const { user } = useAuth();
  const isAdmin = user?.isAdmin ?? false;
  const [adminMenuAnchor, setAdminMenuAnchor] = useState<null | HTMLElement>(
    null
  );
  const [adminRunning, setAdminRunning] = useState<
    null | 'trefle' | 'perenual'
  >(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const plant = egg.plant;
  const displayName = plant.commonName ?? plant.scientificName;
  const heroEyebrow = [
    t(`plantTypes.${plant.plantType!.name}`, plant.plantType!.name),
    t(`plantDetail.enumValues.lifeCycle.${plant.lifeCycle}`, plant.lifeCycle!),
  ].join(' · ');
  // The only trait this entry states as a fact, in the hero's chip palette.
  const pollinatorChip = adaptBadge({ bg: '#F3E5F5', fg: '#4A148C' }, mode);

  const handleReEnrich = async (kind: 'trefle' | 'perenual') => {
    setAdminMenuAnchor(null);
    setAdminRunning(kind);
    try {
      const response: ReEnrichResponse =
        kind === 'trefle'
          ? await reEnrichTrefle(plant.id)
          : await reEnrichPerenual(plant.id);
      const outcome = classifyReEnrich(response);
      setToast(
        outcome === 'matched'
          ? { severity: 'info', message: t('plantDetail.toasts.skipped') }
          : outcome === 'skipped'
            ? { severity: 'info', message: t('plantDetail.toasts.skipped') }
            : { severity: 'warning', message: t('plantDetail.toasts.notMatched') }
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      setToast({
        severity: 'error',
        message: t('plantDetail.toasts.error', { reason }),
      });
    } finally {
      setAdminRunning(null);
    }
  };

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
        typeLabel={t(
          `plantTypes.${plant.plantType!.name}`,
          plant.plantType!.name
        )}
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
          <PlantDetailToc sections={TOC_SECTIONS} disableSticky />
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
                  <Box sx={{ mt: 'auto' }}>
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      sx={{ mt: 2.5 }}
                    >
                      {isAdmin && (
                        <>
                          <Tooltip title={t('plantDetail.actions.adminMenu')}>
                            <span>
                              <IconButton
                                color="default"
                                onClick={(e) =>
                                  setAdminMenuAnchor(e.currentTarget)
                                }
                                disabled={adminRunning !== null}
                                aria-label={t('plantDetail.actions.adminMenu')}
                              >
                                {adminRunning ? (
                                  <CircularProgress size={20} />
                                ) : (
                                  <SettingsIcon />
                                )}
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Menu
                            anchorEl={adminMenuAnchor}
                            open={Boolean(adminMenuAnchor)}
                            onClose={() => setAdminMenuAnchor(null)}
                            disableScrollLock
                          >
                            <MenuItem
                              onClick={() => handleReEnrich('trefle')}
                              disabled={adminRunning !== null}
                            >
                              <RefreshIcon fontSize="small" sx={{ mr: 1 }} />
                              {t('plantDetail.actions.reEnrichTrefle')}
                            </MenuItem>
                            <MenuItem
                              onClick={() => handleReEnrich('perenual')}
                              disabled={adminRunning !== null}
                            >
                              <RefreshIcon fontSize="small" sx={{ mr: 1 }} />
                              {t('plantDetail.actions.reEnrichPerenual')}
                            </MenuItem>
                          </Menu>
                        </>
                      )}
                    </Stack>
                  </Box>
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

      {/* Admin toast */}
      <Snackbar
        open={toast !== null}
        autoHideDuration={6000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? (
          <Alert
            onClose={() => setToast(null)}
            severity={toast.severity}
            variant="filled"
            sx={{ width: '100%' }}
          >
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>

      <AiAssistantFab />
    </Container>
  );
}
