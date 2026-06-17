import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Link as RouterLink,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import AgricultureIcon from '@mui/icons-material/Agriculture';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import LocalFloristIcon from '@mui/icons-material/LocalFlorist';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import ScienceIcon from '@mui/icons-material/Science';
import SettingsIcon from '@mui/icons-material/Settings';
import SpaIcon from '@mui/icons-material/Spa';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import YardIcon from '@mui/icons-material/Yard';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import { addPlantToGarden, fetchGardens } from '../services/gardenApi';
import { fetchPlantById } from '../services/plantApi';
import {
  classifyReEnrich,
  reEnrichPerenual,
  reEnrichTrefle,
  type ReEnrichResponse,
} from '../services/adminApi';
import type { Garden } from '../types/Garden';
import type { Plant, PlantImage } from '../types/Plant';
import PlantDetailToc from '../components/plantDetail/PlantDetailToc';
import type { TocSection } from '../components/plantDetail/PlantDetailToc';
import PlantHeroGauges from '../components/plantDetail/PlantHeroGauges';
import { isUserFacingUrl, toUserFacingUrl } from '../utils/externalSourceUrl';
import { resolveTranslatedField } from '../utils/getTranslation';
import { capitalizeFirst } from '../utils/capitalizeFirst';
import { formatPeriod } from '../utils/formatPeriod';
import {
  formatHardinessZone,
  formatPlantSpacing,
  formatRange,
  formatXDataRange,
  groupCommonNamesByLanguage,
  hasAnyXData,
  hasDistinctImageTypes,
  isHardinessSuspicious,
  parseStringArray,
  parseStringArrayJson,
  pickHeroImage,
  pickLongDescription,
  sortGalleryImages,
  toCamelKey,
} from '../utils/plantDetail';

const languageLabels: Record<string, string> = {
  en: 'English',
  fr: 'Français',
};

const DESCRIPTION_TRUNCATE_CHARS = 360;
const PESTS_PREVIEW_COUNT = 10;
const COMMON_NAMES_PREVIEW_LANGUAGES = 6;
const GALLERY_PREVIEW_COUNT = 6;

type PlantDetailNavState = {
  from?: string;
  gardenId?: string;
  gardenName?: string;
} | null;

type ToastSeverity = 'success' | 'info' | 'warning' | 'error';
type Toast = { message: string; severity: ToastSeverity };

/**
 * `GET /library/:id` detail page. Renders the full `PlantDetailResponse`
 * payload across 12 conditional sections (hero + gallery + about +
 * characteristics + lifecycle + edible/propagation + scientific-data
 * placeholder + pests + common names + synonyms + sources + admin), with
 * graceful degradation when enrichments are absent (cf. Basil seed).
 */
export default function PlantDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const navState = location.state as PlantDetailNavState;
  const fromPlanner = navState?.from === 'planner' && !!navState.gardenId;
  const backTarget = fromPlanner
    ? `/gardens/${navState!.gardenId}/planner`
    : '/library';
  const backLabel = fromPlanner
    ? t('plantDetail.backToGarden', { name: navState!.gardenName ?? '' })
    : t('library.backToLibrary');
  const { language } = useLanguage();
  const { isAuthenticated, user } = useAuth();
  // SMA-33: admin UI gated on the backend role surfaced via /me (was the
  // VITE_ADMIN_EMAILS front whitelist). UX only — the real barrier is the
  // backend [Authorize(Roles = "Admin")] on the admin endpoints.
  const isAdmin = user?.isAdmin ?? false;

  const [plant, setPlant] = useState<Plant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadCounter, setReloadCounter] = useState(0);
  const mountedRef = useRef(true);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Add-to-garden dialog (unchanged from the previous implementation) ─────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [gardens, setGardens] = useState<Garden[]>([]);
  const [gardensLoading, setGardensLoading] = useState(false);
  const [selectedGardenIds, setSelectedGardenIds] = useState<Set<string>>(
    new Set()
  );
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const [descExpanded, setDescExpanded] = useState(false);
  const [pestsExpanded, setPestsExpanded] = useState(false);
  const [commonNamesExpanded, setCommonNamesExpanded] = useState(false);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [adminMenuAnchor, setAdminMenuAnchor] = useState<null | HTMLElement>(
    null
  );
  const [adminRunning, setAdminRunning] = useState<
    null | 'trefle' | 'perenual'
  >(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const toggleGarden = (gardenId: string) => {
    setSelectedGardenIds((prev) => {
      const next = new Set(prev);
      if (next.has(gardenId)) next.delete(gardenId);
      else next.add(gardenId);
      return next;
    });
  };

  const openAddDialog = async () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    setDialogOpen(true);
    setGardensLoading(true);
    setAddError(null);
    setAddSuccess(null);
    setSelectedGardenIds(new Set());
    setGardens([]);
    setIsAdding(false);
    try {
      const data = await fetchGardens();
      setGardens(data);
    } catch {
      setGardens([]);
      setAddError(t('gardens.failedToLoadGardens'));
    } finally {
      setGardensLoading(false);
    }
  };

  const handleAddToGarden = async () => {
    if (selectedGardenIds.size === 0 || !plant) return;
    if (isAdding) return;
    setIsAdding(true);
    setAddError(null);
    const results: { gardenName: string; success: boolean; error?: string }[] =
      [];
    for (const gardenId of selectedGardenIds) {
      const garden = gardens.find((g) => g.id === gardenId);
      try {
        await addPlantToGarden(gardenId, plant.id);
        results.push({ gardenName: garden?.name ?? '', success: true });
      } catch (err) {
        const status = (err as Error & { status?: number }).status;
        results.push({
          gardenName: garden?.name ?? '',
          success: false,
          error: status === 409 ? 'already added' : 'failed',
        });
      }
    }
    const successes = results.filter((r) => r.success).length;
    const alreadyAdded = results.filter(
      (r) => r.error === 'already added'
    ).length;
    const failed = results.filter((r) => r.error === 'failed').length;

    if (failed > 0) {
      let errorMsg =
        successes > 0
          ? t('gardens.addedButFailed', { count: successes, failed })
          : t('gardens.failedCount', { count: failed });
      if (alreadyAdded > 0)
        errorMsg += ` ${t('gardens.addedWithExisting', { count: alreadyAdded })}`;
      setAddError(errorMsg);
    } else if (successes > 0) {
      let message = t('gardens.addedToCount', { count: successes });
      if (alreadyAdded > 0)
        message += ` ${t('gardens.addedWithExisting', { count: alreadyAdded })}`;
      setAddSuccess(message);
      setSelectedGardenIds(new Set());
      closeTimerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        setDialogOpen(false);
        setAddSuccess(null);
        setIsAdding(false);
        closeTimerRef.current = null;
      }, 2000);
      return;
    } else if (alreadyAdded > 0) {
      setAddError(t('gardens.addedWithExisting', { count: alreadyAdded }));
    }
    setIsAdding(false);
  };

  // ── Plant fetch with abort + reload trigger after admin re-enrich ─────────
  useEffect(() => {
    mountedRef.current = true;
    setPlant(null);
    setError(null);
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const controller = new AbortController();

    fetchPlantById(id, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setPlant(data);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        if (err.status === 404) return;
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : t('library.error'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => {
      mountedRef.current = false;
      controller.abort();
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, reloadCounter]);

  const handleReEnrich = async (kind: 'trefle' | 'perenual') => {
    if (!plant) return;
    setAdminMenuAnchor(null);
    setAdminRunning(kind);
    try {
      const response: ReEnrichResponse =
        kind === 'trefle'
          ? await reEnrichTrefle(plant.id)
          : await reEnrichPerenual(plant.id);
      const outcome = classifyReEnrich(response);
      if (outcome === 'matched') {
        if (kind === 'trefle') {
          setToast({
            severity: 'success',
            message: t('plantDetail.toasts.trefleSuccess', {
              images: response.imagesAdded ?? 0,
              commonNames: response.commonNamesAdded ?? 0,
              synonyms: response.synonymsAdded ?? 0,
            }),
          });
        } else {
          setToast({
            severity: 'success',
            message: t('plantDetail.toasts.perenualSuccess', {
              images: response.imagesAdded ?? 0,
              pests: response.pestsAdded ?? 0,
              longDescriptions: response.longDescriptionsAdded ?? 0,
            }),
          });
        }
        // Refetch the plant so the new images / pests / common names render.
        setReloadCounter((n) => n + 1);
      } else if (outcome === 'skipped') {
        setToast({
          severity: 'info',
          message: t('plantDetail.toasts.skipped'),
        });
      } else {
        setToast({
          severity: 'warning',
          message: t('plantDetail.toasts.notMatched'),
        });
      }
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

  // ── Memoised derived data ────────────────────────────────────────────────
  const heroImageUrl = useMemo(
    () => (plant ? pickHeroImage(plant) : ''),
    [plant]
  );
  // SMA-118: the gallery (thumbnails, category-filter row, "+N" count, lightbox)
  // all derive from this — filter to STABLE-source images only (Trefle/PlantNet)
  // so no dead Perenual URL ever renders a broken tile, consistent with
  // pickHeroImage. A category with no stable image simply drops out of the row.
  const galleryImages = useMemo<PlantImage[]>(
    () =>
      plant
        ? sortGalleryImages(
            plant.images.filter(
              (i) => i.source === 'Trefle' || i.source === 'PlantNet'
            )
          )
        : [],
    [plant]
  );
  const longDescription = useMemo(
    () =>
      plant ? pickLongDescription(plant.longDescriptions, language) : null,
    [plant, language]
  );
  const groupedCommonNames = useMemo<Map<string, Plant['commonNames']>>(
    () =>
      plant
        ? groupCommonNamesByLanguage(plant.commonNames, language)
        : new Map<string, Plant['commonNames']>(),
    [plant, language]
  );
  const ediblePartsList = useMemo(
    () => (plant ? parseStringArray(plant.edibleParts) : []),
    [plant]
  );

  // ── Early-return guards (unchanged behaviour, just maxWidth=lg) ──────────
  if (!id) {
    return (
      <Container maxWidth="lg" sx={{ pt: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {t('library.missingPlantId')}
        </Alert>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(backTarget)}
        >
          {backLabel}
        </Button>
      </Container>
    );
  }

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ pt: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ pt: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(backTarget)}
        >
          {backLabel}
        </Button>
      </Container>
    );
  }

  if (!plant) {
    return (
      <Container maxWidth="lg" sx={{ pt: 4, textAlign: 'center' }}>
        <Typography color="text.secondary" sx={{ py: 8 }}>
          {t('library.plantNotFound')}
        </Typography>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(backTarget)}
        >
          {backLabel}
        </Button>
      </Container>
    );
  }

  // SMA-120: resolve name + short description per-field (requested → en), so an FR
  // row with only a name still shows the EN description (FR descriptions: SMA-61).
  // The common name is sentence-cased for display (the ScientificName fallback is
  // already capitalised); the description is never recased.
  const displayName =
    capitalizeFirst(resolveTranslatedField(plant, language, 'commonName')) ??
    plant.scientificName;
  const shortDescription = resolveTranslatedField(
    plant,
    language,
    'description'
  );

  // Section D rows — characteristics column
  const characteristicRows: {
    label: string;
    value: string;
    warning?: boolean;
    tooltip?: string;
  }[] = [];
  if (plant.lifeCycle) {
    characteristicRows.push({
      label: t('plantDetail.labels.lifeCycle'),
      value: t(
        `plantDetail.enumValues.lifeCycle.${plant.lifeCycle}`,
        plant.lifeCycle
      ),
    });
  }
  if (plant.growthRate) {
    characteristicRows.push({
      label: t('plantDetail.labels.growthRate'),
      value: t(
        `plantDetail.enumValues.growthRate.${plant.growthRate}`,
        plant.growthRate
      ),
    });
  }
  if (plant.careLevel) {
    characteristicRows.push({
      label: t('plantDetail.labels.careLevel'),
      value: t(
        `plantDetail.enumValues.careLevel.${plant.careLevel}`,
        plant.careLevel
      ),
    });
  }
  if (plant.wateringNeedLevel) {
    characteristicRows.push({
      label: t('plantDetail.labels.wateringNeed'),
      value: t(
        `plantDetail.enumValues.wateringNeed.${plant.wateringNeedLevel}`,
        plant.wateringNeedLevel
      ),
    });
  }
  const zone = formatHardinessZone(
    plant.hardinessZoneMin,
    plant.hardinessZoneMax
  );
  if (zone) {
    const suspicious = isHardinessSuspicious(
      plant.hardinessZoneMin,
      plant.hardinessZoneMax
    );
    characteristicRows.push({
      label: t('plantDetail.labels.hardinessZone'),
      value: zone,
      warning: suspicious,
      tooltip: suspicious
        ? t('plantDetail.warnings.suspiciousHardiness')
        : undefined,
    });
  }
  const height = formatRange(plant.minHeightCm, plant.maxHeightCm, 'cm');
  if (height)
    characteristicRows.push({
      label: t('plantDetail.labels.height'),
      value: height,
    });
  const spread = formatRange(plant.minSpreadCm, plant.maxSpreadCm, 'cm');
  if (spread)
    characteristicRows.push({
      label: t('plantDetail.labels.spread'),
      value: spread,
    });
  const phRange =
    plant.soilPhMin != null && plant.soilPhMax != null
      ? `${plant.soilPhMin} – ${plant.soilPhMax}`
      : null;
  if (phRange)
    characteristicRows.push({
      label: t('plantDetail.labels.soilPh'),
      value: phRange,
    });

  // Section D rows — growing conditions column (existing legacy fields)
  const conditions = (
    [
      {
        icon: <WbSunnyIcon />,
        label: t('library.sunExposure'),
        value: plant.sunExposure
          ? t(`plantValues.${plant.sunExposure}`, plant.sunExposure)
          : null,
      },
      {
        icon: <WaterDropIcon />,
        label: t('library.waterNeeds'),
        value: plant.waterNeeds
          ? t(`plantValues.${plant.waterNeeds}`, plant.waterNeeds)
          : null,
      },
      {
        icon: <CalendarMonthIcon />,
        label: t('library.sowingPeriod'),
        value: formatPeriod(plant.sowingPeriod, t),
      },
      {
        icon: <AgricultureIcon />,
        label: t('library.harvestPeriod'),
        value: formatPeriod(plant.harvestPeriod, t),
      },
    ] as { icon: React.ReactNode; label: string; value: string | null }[]
  ).filter((c): c is { icon: React.ReactNode; label: string; value: string } =>
    Boolean(c.value)
  );

  const showLifecycleSection =
    !!plant.sowingPeriod || !!plant.harvestPeriod || !!plant.lifeCycle;

  const showEdibleAndPropagation =
    ediblePartsList.length > 0 ||
    !!plant.propagationInstructions ||
    !!plant.sowingInstructions;

  const pestsToShow = pestsExpanded
    ? plant.pests
    : plant.pests.slice(0, PESTS_PREVIEW_COUNT);
  const commonNameLanguages = [...groupedCommonNames.keys()];
  const visibleCommonNameLanguages = commonNamesExpanded
    ? commonNameLanguages
    : commonNameLanguages.slice(0, COMMON_NAMES_PREVIEW_LANGUAGES);

  const heroChips = buildFeatureChips(plant, t);

  const fullyEnriched =
    plant.enrichmentSources.includes('Manual') &&
    plant.enrichmentSources.includes('GBIF') &&
    plant.enrichmentSources.includes('Trefle') &&
    plant.enrichmentSources.includes('Perenual');

  // SMA-169 — the scientific (Perenual xData) section renders only when Supreme
  // data is present AND at least one xData field is populated (mirrors Section F.6).
  const showScientificData = !!(
    plant.perenualData?.hasSupremeData && hasAnyXData(plant.perenualData)
  );

  // SMA-169 — table-of-contents entries, built from the sections ACTUALLY
  // rendered for this plant (same conditions as the JSX below) so the sticky
  // sommaire never links to an absent section. Anchors target each section's id.
  const tocSections: TocSection[] = [
    { id: 'overview', label: t('plantDetail.sections.overview') },
    ...(galleryImages.length > 0
      ? [{ id: 'gallery', label: t('plantDetail.sections.gallery') }]
      : []),
    ...(longDescription || shortDescription
      ? [{ id: 'about', label: t('plantDetail.sections.about') }]
      : []),
    ...(characteristicRows.length > 0 || conditions.length > 0
      ? [
          {
            id: 'characteristics',
            label: t('plantDetail.sections.characteristics'),
          },
        ]
      : []),
    ...(showLifecycleSection
      ? [{ id: 'lifecycle', label: t('plantDetail.sections.lifecycle') }]
      : []),
    ...(showEdibleAndPropagation
      ? [
          {
            id: 'edible',
            label: t('plantDetail.sections.edibleAndPropagation'),
          },
        ]
      : []),
    ...(showScientificData
      ? [
          {
            id: 'scientific-data',
            label: t('plantDetail.scientificData.title'),
          },
        ]
      : []),
    ...(plant.pests.length > 0
      ? [{ id: 'pests', label: t('plantDetail.sections.pestsAndDiseases') }]
      : []),
    ...(plant.commonNames.length > 1
      ? [{ id: 'common-names', label: t('plantDetail.sections.commonNames') }]
      : []),
    ...(plant.synonyms.length > 0
      ? [{ id: 'synonyms', label: t('plantDetail.sections.synonyms') }]
      : []),
    { id: 'sources', label: t('plantDetail.sections.sources') },
  ];

  return (
    <Container maxWidth="lg" sx={{ pt: 4, pb: 6 }}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate(backTarget)}
        sx={{ mb: 3 }}
      >
        {backLabel}
      </Button>

      {/* SMA-169 — two-column shell: sticky TOC (left) + content column (right). */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          gap: { md: 4 },
          alignItems: { md: 'flex-start' },
        }}
      >
        <PlantDetailToc sections={tocSections} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* ── Section A: Hero header ───────────────────────────────────── */}
          <Card
            id="overview"
            variant="outlined"
            sx={{
              mb: 3,
              overflow: 'hidden',
              borderRadius: 3,
              scrollMarginTop: '80px',
            }}
          >
            <Box
              sx={{
                position: 'relative',
                width: '100%',
                height: { xs: 220, sm: 320, md: 400 },
                bgcolor: 'grey.100',
              }}
            >
              {/* The hero is a focusable button so keyboard users can open the
              lightbox; when no STABLE gallery exists we render a plain img instead
              (a disabled button would be a confusing focus target). Gated on the
              filtered gallery (SMA-118) so a Perenual-only plant — whose hero is
              the placeholder — never opens an empty lightbox. */}
              {galleryImages.length > 0 ? (
                <Box
                  component="button"
                  type="button"
                  onClick={() => setLightboxIndex(0)}
                  aria-label={t('plantDetail.gallery.openHero')}
                  sx={{
                    p: 0,
                    m: 0,
                    border: 0,
                    background: 'transparent',
                    width: '100%',
                    height: '100%',
                    display: 'block',
                    cursor: 'pointer',
                  }}
                >
                  <Box
                    component="img"
                    src={heroImageUrl}
                    alt={displayName}
                    sx={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                </Box>
              ) : (
                <Box
                  component="img"
                  src={heroImageUrl}
                  alt={displayName}
                  sx={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
              )}
            </Box>
            <CardContent>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between"
                alignItems={{ sm: 'flex-start' }}
                gap={2}
              >
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="h3" fontWeight={700} sx={{ mb: 0.5 }}>
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
                    {plant.plantType && (
                      <Chip
                        label={t(
                          `plantTypes.${plant.plantType.name}`,
                          plant.plantType.name
                        )}
                        color="primary"
                        variant="outlined"
                        size="small"
                      />
                    )}
                    {plant.family && (
                      <Typography variant="body2" color="text.secondary">
                        {t('plantDetail.labels.family')}:{' '}
                        <Box component="span" sx={{ fontWeight: 500 }}>
                          {plant.family}
                        </Box>
                      </Typography>
                    )}
                    {plant.genus && (
                      <Typography variant="body2" color="text.secondary">
                        {t('plantDetail.labels.genus')}:{' '}
                        <Box component="span" sx={{ fontStyle: 'italic' }}>
                          {plant.genus}
                        </Box>
                      </Typography>
                    )}
                    {plant.gbifTaxonKey != null && (
                      <Chip
                        component="a"
                        href={`https://www.gbif.org/species/${plant.gbifTaxonKey}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        label={t('plantDetail.gbifBadge', {
                          key: plant.gbifTaxonKey,
                        })}
                        size="small"
                        clickable
                        icon={<OpenInNewIcon fontSize="small" />}
                        sx={{ bgcolor: 'grey.200' }}
                      />
                    )}
                  </Stack>
                  {heroChips.length > 0 && (
                    <Stack
                      direction="row"
                      spacing={1}
                      flexWrap="wrap"
                      useFlexGap
                      sx={{ mt: 1.5 }}
                    >
                      {heroChips.map((c) => (
                        <Chip
                          key={c.key}
                          label={c.label}
                          size="small"
                          sx={{
                            bgcolor: c.bgcolor,
                            color: c.color,
                            fontWeight: 500,
                          }}
                        />
                      ))}
                    </Stack>
                  )}
                </Box>
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ flexShrink: 0 }}
                >
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={<AddIcon />}
                    onClick={openAddDialog}
                  >
                    {t('library.addToGarden')}
                  </Button>
                  {isAdmin && (
                    <>
                      <Tooltip title={t('plantDetail.actions.adminMenu')}>
                        <span>
                          <IconButton
                            color="default"
                            onClick={(e) => setAdminMenuAnchor(e.currentTarget)}
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
              </Stack>
              <PlantHeroGauges plant={plant} />
            </CardContent>
          </Card>

          {/* ── Section B: Photo gallery ───────────────────────────────────── */}
          {galleryImages.length > 0 && (
            <Card
              id="gallery"
              variant="outlined"
              sx={{ mb: 3, borderRadius: 3, scrollMarginTop: '80px' }}
            >
              <CardContent>
                <Grid container spacing={1.5}>
                  {galleryImages
                    .slice(0, GALLERY_PREVIEW_COUNT)
                    .map((img, idx) => {
                      const isLastTile =
                        idx === GALLERY_PREVIEW_COUNT - 1 &&
                        galleryImages.length > GALLERY_PREVIEW_COUNT;
                      // The overlay tile is itself one of the preview slots — so the
                      // remaining count is the gallery total minus the preview slots,
                      // not minus (preview - 1). Aloe vera (31 images, 6 preview slots)
                      // should display "+25 more", not "+26".
                      const remaining =
                        galleryImages.length - GALLERY_PREVIEW_COUNT;
                      return (
                        <Grid key={img.id} size={{ xs: 4, sm: 4, md: 2 }}>
                          <Tooltip
                            title={
                              [img.credit, img.licenseName]
                                .filter(Boolean)
                                .join(' · ') || ''
                            }
                            placement="top"
                            arrow
                          >
                            <Box
                              component="button"
                              type="button"
                              onClick={() => setLightboxIndex(idx)}
                              aria-label={t('plantDetail.gallery.openTile', {
                                index: idx + 1,
                              })}
                              sx={{
                                position: 'relative',
                                aspectRatio: '1 / 1',
                                borderRadius: 2,
                                overflow: 'hidden',
                                cursor: 'pointer',
                                bgcolor: 'grey.100',
                                p: 0,
                                border: 0,
                                width: '100%',
                                display: 'block',
                                '&:hover .overlay': { opacity: 1 },
                              }}
                            >
                              <Box
                                component="img"
                                src={img.thumbnailUrl ?? img.url}
                                alt={img.imageType}
                                sx={{
                                  width: '100%',
                                  height: '100%',
                                  objectFit: 'cover',
                                  display: 'block',
                                }}
                              />
                              {isLastTile && (
                                <Box
                                  sx={{
                                    position: 'absolute',
                                    inset: 0,
                                    bgcolor: 'rgba(0,0,0,0.55)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#fff',
                                    fontWeight: 600,
                                    fontSize: '1.1rem',
                                  }}
                                >
                                  +{remaining}
                                </Box>
                              )}
                            </Box>
                          </Tooltip>
                        </Grid>
                      );
                    })}
                </Grid>
                {hasDistinctImageTypes(galleryImages) && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mt: 1.5, display: 'block' }}
                  >
                    {galleryImages
                      .map((i) => i.imageType)
                      .filter((v, i, a) => a.indexOf(v) === i)
                      .join(' · ')}
                  </Typography>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Section C: About / long description ────────────────────────── */}
          {(longDescription || shortDescription) && (
            <Card
              id="about"
              variant="outlined"
              sx={{ mb: 3, borderRadius: 3, scrollMarginTop: '80px' }}
            >
              <CardContent>
                <Typography variant="h6" fontWeight={600} sx={{ mb: 1.5 }}>
                  {t('plantDetail.sections.about')}
                </Typography>
                {longDescription ? (
                  <>
                    <Typography
                      variant="body1"
                      sx={{ lineHeight: 1.8, whiteSpace: 'pre-wrap' }}
                    >
                      {descExpanded ||
                      longDescription.longDescription.length <=
                        DESCRIPTION_TRUNCATE_CHARS
                        ? longDescription.longDescription
                        : `${longDescription.longDescription.slice(0, DESCRIPTION_TRUNCATE_CHARS).trimEnd()}…`}
                    </Typography>
                    {longDescription.longDescription.length >
                      DESCRIPTION_TRUNCATE_CHARS && (
                      <Button
                        size="small"
                        onClick={() => setDescExpanded((v) => !v)}
                        sx={{ mt: 1, textTransform: 'none' }}
                      >
                        {descExpanded
                          ? t('plantDetail.description.readLess')
                          : t('plantDetail.description.readMore')}
                      </Button>
                    )}
                    {longDescription.sourceMethod && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ mt: 1.5, display: 'block' }}
                      >
                        {t('plantDetail.description.sourceLabel', {
                          source: longDescription.sourceMethod,
                        })}
                      </Typography>
                    )}
                  </>
                ) : shortDescription ? (
                  <Typography variant="body1" sx={{ lineHeight: 1.8 }}>
                    {shortDescription}
                  </Typography>
                ) : null}
              </CardContent>
            </Card>
          )}

          {/* ── Section D: Characteristics + growing conditions ────────────── */}
          {(characteristicRows.length > 0 || conditions.length > 0) && (
            <Grid
              id="characteristics"
              container
              spacing={3}
              sx={{ mb: 3, scrollMarginTop: '80px' }}
            >
              {characteristicRows.length > 0 && (
                <Grid size={{ xs: 12, md: 6 }}>
                  <Card
                    variant="outlined"
                    sx={{ borderRadius: 3, height: '100%' }}
                  >
                    <CardContent>
                      <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                        {t('plantDetail.sections.characteristics')}
                      </Typography>
                      <Stack spacing={1.25} divider={<Divider flexItem />}>
                        {characteristicRows.map((row) => (
                          <Box
                            key={row.label}
                            sx={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: 2,
                            }}
                          >
                            <Typography variant="body2" color="text.secondary">
                              {row.label}
                            </Typography>
                            <Stack
                              direction="row"
                              spacing={0.5}
                              alignItems="center"
                            >
                              <Typography
                                variant="body2"
                                fontWeight={500}
                                color={
                                  row.warning ? 'warning.main' : 'text.primary'
                                }
                              >
                                {row.value}
                              </Typography>
                              {row.warning && (
                                <Tooltip title={row.tooltip ?? ''} arrow>
                                  <WarningAmberIcon
                                    fontSize="small"
                                    color="warning"
                                  />
                                </Tooltip>
                              )}
                            </Stack>
                          </Box>
                        ))}
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              )}
              {conditions.length > 0 && (
                <Grid size={{ xs: 12, md: 6 }}>
                  <Card
                    variant="outlined"
                    sx={{ borderRadius: 3, height: '100%' }}
                  >
                    <CardContent>
                      <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                        {t('library.growingConditions')}
                      </Typography>
                      <Stack spacing={1.5}>
                        {conditions.map((c) => (
                          <Box
                            key={c.label}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1.5,
                            }}
                          >
                            <Box
                              sx={{ color: 'primary.main', display: 'flex' }}
                            >
                              {c.icon}
                            </Box>
                            <Box>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                display="block"
                              >
                                {c.label}
                              </Typography>
                              <Typography variant="body2" fontWeight={500}>
                                {c.value}
                              </Typography>
                            </Box>
                          </Box>
                        ))}
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              )}
            </Grid>
          )}

          {/* ── Section E: Lifecycle frieze ─────────────────────────────────── */}
          {showLifecycleSection && (
            <Card
              id="lifecycle"
              variant="outlined"
              sx={{ mb: 3, borderRadius: 3, scrollMarginTop: '80px' }}
            >
              <CardContent>
                <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                  {t('plantDetail.sections.lifecycle')}
                </Typography>
                <Grid container spacing={2}>
                  <LifecycleStage
                    icon={<SpaIcon />}
                    label={t('plantDetail.lifecycle.stages.sowing')}
                    value={formatPeriod(plant.sowingPeriod, t)}
                  />
                  <LifecycleStage
                    icon={<YardIcon />}
                    label={t('plantDetail.lifecycle.stages.growth')}
                    value={null}
                  />
                  <LifecycleStage
                    icon={<LocalFloristIcon />}
                    label={t('plantDetail.lifecycle.stages.flowering')}
                    value={formatPeriod(
                      plant.perenualData?.floweringSeason ?? null,
                      t
                    )}
                  />
                  <LifecycleStage
                    icon={<AgricultureIcon />}
                    label={t('plantDetail.lifecycle.stages.harvest')}
                    value={formatPeriod(
                      plant.harvestPeriod ??
                        plant.perenualData?.harvestSeason ??
                        null,
                      t
                    )}
                  />
                </Grid>
                {plant.lifeCycle === 'Perennial' ||
                plant.lifeCycle === 'HerbaceousPerennial' ? (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mt: 2, display: 'block' }}
                  >
                    {t('plantDetail.lifecycle.perennialNote')}
                  </Typography>
                ) : plant.lifeCycle === 'Biennial' ? (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mt: 2, display: 'block' }}
                  >
                    {t('plantDetail.lifecycle.biennialNote')}
                  </Typography>
                ) : null}
              </CardContent>
            </Card>
          )}

          {/* ── Section F: Edible parts & propagation ──────────────────────── */}
          {showEdibleAndPropagation && (
            <Card
              id="edible"
              variant="outlined"
              sx={{ mb: 3, borderRadius: 3, scrollMarginTop: '80px' }}
            >
              <CardContent>
                <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                  {t('plantDetail.sections.edibleAndPropagation')}
                </Typography>
                {ediblePartsList.length > 0 && (
                  <Box sx={{ mb: 2 }}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                      sx={{ mb: 0.75 }}
                    >
                      {t('plantDetail.labels.edibleParts')}
                    </Typography>
                    <Stack
                      direction="row"
                      spacing={1}
                      flexWrap="wrap"
                      useFlexGap
                    >
                      {ediblePartsList.map((part) => (
                        <Chip
                          key={part}
                          label={t(
                            `plantDetail.enumValues.ediblePart.${part.toLowerCase()}`,
                            part
                          )}
                          size="small"
                          sx={{
                            bgcolor: '#E8F5E9',
                            color: '#1B5E20',
                            fontWeight: 500,
                          }}
                        />
                      ))}
                    </Stack>
                  </Box>
                )}
                {plant.propagationInstructions && (
                  <Box sx={{ mb: plant.sowingInstructions ? 2 : 0 }}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                      sx={{ mb: 0.5 }}
                    >
                      {t('plantDetail.labels.propagationInstructions')}
                    </Typography>
                    <Typography variant="body2" sx={{ lineHeight: 1.7 }}>
                      {plant.propagationInstructions
                        .split(/;\s*|\n/)
                        .filter(Boolean)
                        .join(' · ')}
                    </Typography>
                  </Box>
                )}
                {plant.sowingInstructions && (
                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                      sx={{ mb: 0.5 }}
                    >
                      {t('plantDetail.labels.sowingInstructions')}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}
                    >
                      {plant.sowingInstructions}
                    </Typography>
                  </Box>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Section F.6: Perenual Supreme scientific data (Sprint 1.5 PR B) ── */}
          {/* Rendered only when the plant carries Supreme-tier xData AND at least
          one field is populated — an empty section is worse than no section.
          IIFE keeps each formatted value computed once. */}
          {(() => {
            const pd = plant.perenualData;
            if (!pd?.hasSupremeData || !hasAnyXData(pd)) return null;

            const phRange = formatXDataRange(
              pd.xWateringPhMin,
              pd.xWateringPhMax
            );
            const wateringTemp = formatXDataRange(
              pd.xWateringBasedTempMinC,
              pd.xWateringBasedTempMaxC,
              '°C'
            );
            const sunlight = formatXDataRange(
              pd.xSunlightHoursMin,
              pd.xSunlightHoursMax,
              ' h'
            );
            const tempTol = formatXDataRange(
              pd.xTemperatureToleranceMinC,
              pd.xTemperatureToleranceMaxC,
              '°C'
            );
            const spacing = formatPlantSpacing(
              pd.xPlantSpacingValue,
              pd.xPlantSpacingUnit
            );
            const waterQuality = parseStringArrayJson(pd.xWateringQualityJson);
            const wateringPeriod = parseStringArrayJson(pd.xWateringPeriodJson);

            const row = (label: string, value: string) => (
              <Stack direction="row" justifyContent="space-between" spacing={2}>
                <Typography variant="body2" color="text.secondary">
                  {label}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 500, textAlign: 'right' }}
                >
                  {value}
                </Typography>
              </Stack>
            );

            const chips = (label: string, values: string[], dict: string) => (
              <Box>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 0.5 }}
                >
                  {label}
                </Typography>
                <Stack direction="row" flexWrap="wrap" gap={0.5}>
                  {values.map((v) => (
                    <Chip
                      key={v}
                      size="small"
                      label={t(
                        `plantDetail.scientificData.${dict}.${toCamelKey(v)}`,
                        v
                      )}
                    />
                  ))}
                </Stack>
              </Box>
            );

            return (
              <Card
                id="scientific-data"
                variant="outlined"
                sx={{ mb: 3, borderRadius: 3, scrollMarginTop: '80px' }}
              >
                <CardContent>
                  <Stack direction="row" spacing={2} alignItems="flex-start">
                    <ScienceIcon sx={{ color: 'success.main', mt: 0.5 }} />
                    <Box sx={{ flex: 1 }}>
                      <Typography
                        variant="h6"
                        fontWeight={600}
                        sx={{ mb: 1.5 }}
                      >
                        {t('plantDetail.scientificData.title')}
                      </Typography>
                      <Stack spacing={1.25}>
                        {phRange &&
                          row(
                            t('plantDetail.scientificData.wateringPh'),
                            phRange
                          )}
                        {wateringTemp &&
                          row(
                            t('plantDetail.scientificData.wateringIdealTemp'),
                            wateringTemp
                          )}
                        {sunlight &&
                          row(
                            t('plantDetail.scientificData.sunlightHours'),
                            sunlight
                          )}
                        {tempTol &&
                          row(
                            t(
                              'plantDetail.scientificData.temperatureTolerance'
                            ),
                            tempTol
                          )}
                        {spacing &&
                          row(t('plantDetail.scientificData.spacing'), spacing)}
                        {waterQuality &&
                          chips(
                            t('plantDetail.scientificData.waterQuality'),
                            waterQuality,
                            'waterQualityValues'
                          )}
                        {wateringPeriod &&
                          chips(
                            t('plantDetail.scientificData.wateringPeriod'),
                            wateringPeriod,
                            'wateringPeriodValues'
                          )}
                      </Stack>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            );
          })()}

          {/* ── Section F.5: Scientific data (coming soon) placeholder ─────── */}
          {/* Always rendered — this is a promise to the user about what's next,
          not a graceful-degradation fallback. Surfaces between edible parts
          and pests so it sits in the "deep data" middle of the page. */}
          <Card
            variant="outlined"
            sx={{ mb: 3, borderRadius: 3, bgcolor: 'grey.50' }}
          >
            <CardContent>
              <Stack direction="row" spacing={2} alignItems="flex-start">
                <ScienceIcon sx={{ color: 'text.secondary', mt: 0.5 }} />
                <Box sx={{ flex: 1 }}>
                  <Typography
                    variant="h6"
                    fontWeight={600}
                    color="text.secondary"
                    sx={{ mb: 1.5 }}
                  >
                    {t('plantDetail.sections.scientificData')}
                  </Typography>
                  <Box
                    component="ul"
                    sx={{
                      m: 0,
                      pl: 2.5,
                      color: 'text.secondary',
                      fontStyle: 'italic',
                      '& li': { mb: 0.5, fontSize: '0.9rem' },
                    }}
                  >
                    <li>{t('plantDetail.scientificData.items.waterLiters')}</li>
                    <li>{t('plantDetail.scientificData.items.lightLumens')}</li>
                    <li>
                      {t('plantDetail.scientificData.items.nutrientsNPK')}
                    </li>
                    <li>
                      {t('plantDetail.scientificData.items.daysToGermination')}
                    </li>
                  </Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', mt: 1.5 }}
                  >
                    {t('plantDetail.scientificData.comingSoon')}
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>

          {/* ── Section G: Pests & diseases ─────────────────────────────────── */}
          {plant.pests.length > 0 && (
            <Card
              id="pests"
              variant="outlined"
              sx={{ mb: 3, borderRadius: 3, scrollMarginTop: '80px' }}
            >
              <CardContent>
                <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                  {t('plantDetail.pests.header', { count: plant.pests.length })}
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {pestsToShow.map((pest) => {
                    const pestColors = pestTypeColors(pest.type);
                    return (
                      <Tooltip
                        key={pest.id}
                        title={pest.description ?? ''}
                        arrow
                      >
                        <Chip
                          label={pest.name}
                          size="small"
                          sx={{
                            bgcolor: pestColors.bg,
                            color: pestColors.fg,
                            fontWeight: 500,
                          }}
                        />
                      </Tooltip>
                    );
                  })}
                </Stack>
                {plant.pests.length > PESTS_PREVIEW_COUNT && (
                  <Button
                    size="small"
                    onClick={() => setPestsExpanded((v) => !v)}
                    sx={{ mt: 1.5, textTransform: 'none' }}
                  >
                    {pestsExpanded
                      ? t('plantDetail.pests.showLess')
                      : t('plantDetail.pests.showAll', {
                          count: plant.pests.length,
                        })}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Section H: Common names ─────────────────────────────────────── */}
          {plant.commonNames.length > 1 && (
            <Card
              id="common-names"
              variant="outlined"
              sx={{ mb: 3, borderRadius: 3, scrollMarginTop: '80px' }}
            >
              <CardContent>
                <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                  {t('plantDetail.sections.commonNames')}
                </Typography>
                <Stack spacing={1.5}>
                  {visibleCommonNameLanguages.map((lang) => {
                    const names = groupedCommonNames.get(lang) ?? [];
                    return (
                      <Box key={lang}>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          display="block"
                          sx={{ mb: 0.5 }}
                        >
                          {languageLabels[lang] ?? lang.toUpperCase()}
                        </Typography>
                        <Stack
                          direction="row"
                          spacing={1}
                          flexWrap="wrap"
                          useFlexGap
                        >
                          {names.map((cn) => (
                            <Chip
                              key={cn.id}
                              label={cn.name}
                              size="small"
                              variant={cn.isPrimary ? 'filled' : 'outlined'}
                              color={cn.isPrimary ? 'primary' : 'default'}
                            />
                          ))}
                        </Stack>
                      </Box>
                    );
                  })}
                </Stack>
                {commonNameLanguages.length >
                  COMMON_NAMES_PREVIEW_LANGUAGES && (
                  <Button
                    size="small"
                    onClick={() => setCommonNamesExpanded((v) => !v)}
                    sx={{ mt: 1.5, textTransform: 'none' }}
                  >
                    {commonNamesExpanded
                      ? t('plantDetail.commonNames.showFewerLanguages')
                      : t('plantDetail.commonNames.showAllLanguages', {
                          count:
                            commonNameLanguages.length -
                            COMMON_NAMES_PREVIEW_LANGUAGES,
                        })}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Section I: Synonyms ─────────────────────────────────────────── */}
          {plant.synonyms.length > 0 && (
            <Card
              id="synonyms"
              variant="outlined"
              sx={{ mb: 3, borderRadius: 3, scrollMarginTop: '80px' }}
            >
              <CardContent>
                <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
                  {t('plantDetail.sections.synonyms')}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ fontStyle: 'italic', color: 'text.secondary' }}
                >
                  {plant.synonyms.map((s) => s.synonym).join(', ')}
                </Typography>
              </CardContent>
            </Card>
          )}

          {/* ── Section J: Enrichment footer + external sources ─────────────── */}
          <Card
            id="sources"
            variant="outlined"
            sx={{ mb: 3, borderRadius: 3, scrollMarginTop: '80px' }}
          >
            <CardContent>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
                alignItems={{ sm: 'center' }}
                justifyContent="space-between"
              >
                <Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                    sx={{ mb: 0.5 }}
                  >
                    {t('plantDetail.sections.sources')}
                  </Typography>
                  <Stack
                    direction="row"
                    spacing={0.75}
                    flexWrap="wrap"
                    useFlexGap
                  >
                    {plant.enrichmentSources.map((src) => (
                      <Chip
                        key={src}
                        label={t(
                          `plantDetail.enumValues.sourceType.${src}`,
                          src
                        )}
                        size="small"
                        sx={{
                          bgcolor: sourceTypeColors(src).bg,
                          color: sourceTypeColors(src).fg,
                          fontWeight: 500,
                        }}
                      />
                    ))}
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
                <Box>
                  {plant.lastEnrichmentAt && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                    >
                      {t('plantDetail.labels.lastEnriched')}:{' '}
                      {new Date(plant.lastEnrichmentAt).toLocaleDateString(
                        language
                      )}
                    </Typography>
                  )}
                  {plant.sources.length > 0 && (
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ mt: 0.5 }}
                      flexWrap="wrap"
                      useFlexGap
                    >
                      {plant.sources.flatMap((s) => {
                        // PlantSource.Url persists the API endpoint we called during enrichment.
                        // Rewrite to the upstream's public species page before rendering, and
                        // drop the link entirely if the rewrite couldn't take it out of /api/ —
                        // sending the user to a JSON endpoint (or one that demands an API key)
                        // is worse than no link at all.
                        //
                        // For Perenual: prefer the requested id over the canonical one stored in
                        // the API URL (issue #67 — Perenual canonicalises server-side). The
                        // helper ignores the explicit id for non-Perenual sources, so passing
                        // it unconditionally is safe and removes a per-source branch here.
                        const userUrl = toUserFacingUrl(
                          s.url,
                          plant.perenualData?.requestedPerenualId
                        );
                        if (!isUserFacingUrl(userUrl)) return [];
                        return [
                          <Link
                            key={s.id}
                            href={userUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            underline="hover"
                            variant="caption"
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 0.25,
                            }}
                          >
                            {t('plantDetail.sources.viewExternal', {
                              source: t(
                                `plantDetail.enumValues.sourceType.${s.sourceType}`,
                                s.sourceType
                              ),
                            })}
                            <OpenInNewIcon sx={{ fontSize: 12 }} />
                          </Link>,
                        ];
                      })}
                    </Stack>
                  )}
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Box>
      </Box>

      {/* Add to garden dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{t('library.addToGardenDialog')}</DialogTitle>
        <DialogContent>
          {gardensLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          )}

          {!gardensLoading && gardens.length === 0 && !addError && (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <Typography sx={{ mb: 2 }}>
                {t('library.noGardensYet')}
              </Typography>
              <Button variant="contained" component={RouterLink} to="/gardens">
                {t('library.createAGarden')}
              </Button>
            </Box>
          )}

          {addSuccess && (
            <Typography color="success.main" sx={{ mb: 2 }}>
              {addSuccess}
            </Typography>
          )}

          {addError && (
            <Typography color="error" sx={{ mb: 2 }}>
              {addError}
            </Typography>
          )}

          {!gardensLoading && gardens.length > 0 && !addSuccess && (
            <List>
              {gardens.map((garden) => (
                <ListItemButton
                  key={garden.id}
                  onClick={() => toggleGarden(garden.id)}
                >
                  <Checkbox
                    checked={selectedGardenIds.has(garden.id)}
                    edge="start"
                    tabIndex={-1}
                    disableRipple
                  />
                  <ListItemText
                    primary={garden.name}
                    secondary={t('gardens.plantsCount', {
                      count: garden.gardenPlants.length,
                    })}
                  />
                </ListItemButton>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>
            {t('gardens.cancel')}
          </Button>
          <Button
            variant="contained"
            disabled={selectedGardenIds.size === 0 || isAdding}
            onClick={handleAddToGarden}
          >
            {selectedGardenIds.size > 0
              ? t('library.addToCount', { count: selectedGardenIds.size })
              : t('library.add')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Photo lightbox */}
      <PhotoLightbox
        images={galleryImages}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onPrev={() =>
          setLightboxIndex((i) =>
            i == null
              ? null
              : (i - 1 + galleryImages.length) % galleryImages.length
          )
        }
        onNext={() =>
          setLightboxIndex((i) =>
            i == null ? null : (i + 1) % galleryImages.length
          )
        }
      />

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
    </Container>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Internal helpers — kept in this file because they're tightly coupled to
// the rendering above and not reused elsewhere.

/**
 * Build the hero feature-chip list (Edible, Medicinal, Toxic, …) from the
 * plant's boolean trait flags. Each chip ships its own `bgcolor`/`color`
 * pair sourced from the design palette — kept here rather than in `theme.ts`
 * because the colours are semantic (red for toxic, green for edible) and
 * tightly coupled to the chip labels.
 */
function buildFeatureChips(
  plant: Plant,
  t: ReturnType<typeof useTranslation>['t']
): { key: string; label: string; bgcolor: string; color: string }[] {
  const chips: {
    key: string;
    label: string;
    bgcolor: string;
    color: string;
  }[] = [];
  if (plant.isEdible)
    chips.push({
      key: 'edible',
      label: t('plantDetail.flags.edible'),
      bgcolor: '#E8F5E9',
      color: '#1B5E20',
    });
  if (plant.isMedicinal)
    chips.push({
      key: 'medicinal',
      label: t('plantDetail.flags.medicinal'),
      bgcolor: '#E0F7FA',
      color: '#006064',
    });
  if (plant.isToxicToHumans || plant.isToxicToPets) {
    chips.push({
      key: 'toxic',
      label: plant.isToxicToHumans
        ? t('plantDetail.flags.toxic')
        : t('plantDetail.flags.toxicToPets'),
      bgcolor: '#FFEBEE',
      color: '#B71C1C',
    });
  }
  if (plant.isIndoor)
    chips.push({
      key: 'indoor',
      label: t('plantDetail.flags.indoor'),
      bgcolor: '#E3F2FD',
      color: '#0D47A1',
    });
  if (plant.isDroughtTolerant)
    chips.push({
      key: 'drought',
      label: t('plantDetail.flags.droughtTolerant'),
      bgcolor: '#FFF8E1',
      color: '#E65100',
    });
  if (plant.isSaltTolerant)
    chips.push({
      key: 'salt',
      label: t('plantDetail.flags.saltTolerant'),
      bgcolor: '#E1F5FE',
      color: '#01579B',
    });
  if (plant.isInvasive)
    chips.push({
      key: 'invasive',
      label: t('plantDetail.flags.invasive'),
      bgcolor: '#FFCDD2',
      color: '#7F0000',
    });
  if (plant.isThorny)
    chips.push({
      key: 'thorny',
      label: t('plantDetail.flags.thorny'),
      bgcolor: '#ECEFF1',
      color: '#263238',
    });
  if (plant.isTropical)
    chips.push({
      key: 'tropical',
      label: t('plantDetail.flags.tropical'),
      bgcolor: '#FFF3E0',
      color: '#BF360C',
    });
  if (plant.attractsPollinators)
    chips.push({
      key: 'pollinators',
      label: t('plantDetail.flags.attractsPollinators'),
      bgcolor: '#F3E5F5',
      color: '#4A148C',
    });
  return chips;
}

/** Map a `PlantPestType` string to its chip background/foreground palette. */
function pestTypeColors(type: string): { bg: string; fg: string } {
  switch (type) {
    case 'Insect':
      return { bg: '#FFF3E0', fg: '#E65100' };
    case 'Fungus':
    case 'Disease':
      return { bg: '#FFEBEE', fg: '#C62828' };
    case 'Bacteria':
      return { bg: '#FCE4EC', fg: '#AD1457' };
    case 'Virus':
      return { bg: '#F3E5F5', fg: '#6A1B9A' };
    case 'Mite':
    case 'Nematode':
      return { bg: '#FBE9E7', fg: '#BF360C' };
    default:
      return { bg: '#ECEFF1', fg: '#37474F' };
  }
}

/** Map an enrichment source label to its footer-badge palette. */
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

/** One column of the lifecycle frieze — icon + label + period text (or em-dash). */
function LifecycleStage({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <Grid size={{ xs: 6, md: 3 }}>
      <Box sx={{ textAlign: 'center', py: 1 }}>
        <Box
          sx={{
            mx: 'auto',
            width: 48,
            height: 48,
            borderRadius: '50%',
            bgcolor: value ? 'primary.main' : 'grey.300',
            color: value ? 'primary.contrastText' : 'text.secondary',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mb: 1,
          }}
        >
          {icon}
        </Box>
        <Typography variant="body2" fontWeight={600}>
          {label}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 0.25 }}
        >
          {value ?? '—'}
        </Typography>
      </Box>
    </Grid>
  );
}

/**
 * Full-screen photo viewer with prev/next/close controls and a credit /
 * license caption. Rendered only while `index` is non-null, so callers can
 * mount/unmount it via a single state variable.
 */
function PhotoLightbox({
  images,
  index,
  onClose,
  onPrev,
  onNext,
}: {
  images: PlantImage[];
  index: number | null;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  if (index == null) return null;
  const img = images[index];
  if (!img) return null;
  return (
    <Dialog open onClose={onClose} maxWidth="lg" fullWidth>
      <Box sx={{ position: 'relative', bgcolor: 'black' }}>
        <Box
          component="img"
          src={img.url}
          alt={img.imageType}
          sx={{
            width: '100%',
            maxHeight: '80vh',
            objectFit: 'contain',
            display: 'block',
          }}
        />
        {images.length > 1 && (
          <>
            <IconButton
              onClick={onPrev}
              aria-label={t('plantDetail.gallery.lightboxPrev')}
              sx={{
                position: 'absolute',
                top: '50%',
                left: 8,
                transform: 'translateY(-50%)',
                color: 'white',
                bgcolor: 'rgba(0,0,0,0.4)',
              }}
            >
              <ChevronLeftIcon />
            </IconButton>
            <IconButton
              onClick={onNext}
              aria-label={t('plantDetail.gallery.lightboxNext')}
              sx={{
                position: 'absolute',
                top: '50%',
                right: 8,
                transform: 'translateY(-50%)',
                color: 'white',
                bgcolor: 'rgba(0,0,0,0.4)',
              }}
            >
              <ChevronRightIcon />
            </IconButton>
          </>
        )}
        <IconButton
          onClick={onClose}
          aria-label={t('plantDetail.gallery.lightboxClose')}
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            color: 'white',
            bgcolor: 'rgba(0,0,0,0.4)',
          }}
        >
          <CloseIcon />
        </IconButton>
      </Box>
      {(img.credit || img.licenseName) && (
        <Box sx={{ p: 2 }}>
          {img.credit && (
            <Typography
              variant="caption"
              display="block"
              color="text.secondary"
            >
              {t('plantDetail.gallery.credit', { name: img.credit })}
            </Typography>
          )}
          {img.licenseName && (
            <Typography
              variant="caption"
              display="block"
              color="text.secondary"
            >
              {t('plantDetail.gallery.license', { name: img.licenseName })}
            </Typography>
          )}
        </Box>
      )}
    </Dialog>
  );
}
