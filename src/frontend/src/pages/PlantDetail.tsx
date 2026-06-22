import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useTheme } from '@mui/material/styles';
import { visuallyHidden } from '@mui/utils';
import AddIcon from '@mui/icons-material/Add';
import AgricultureIcon from '@mui/icons-material/Agriculture';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import ScienceIcon from '@mui/icons-material/Science';
import SettingsIcon from '@mui/icons-material/Settings';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import { NAV_BG } from '../constants/colors';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import { useUnitSystem } from '../hooks/useUnitSystem';
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
import { Sym } from '../components/Sym';
import PlantDetailToc from '../components/plantDetail/PlantDetailToc';
import type { TocSection } from '../components/plantDetail/PlantDetailToc';
import PlantHeroGauges from '../components/plantDetail/PlantHeroGauges';
import PlantGallerySection from '../components/plantDetail/PlantGallerySection';
import SectionHeader from '../components/plantDetail/SectionHeader';
import UnitSystemToggle from '../components/plantDetail/UnitSystemToggle';
import AboutSection from '../components/plantDetail/AboutSection';
import { DistributionSection } from '../components/plantDetail/DistributionSection';
import { ObservationsSection } from '../components/plantDetail/ObservationsSection';
import { SimilarPlantsSection } from '../components/plantDetail/SimilarPlantsSection';
import { CommonNamesSection } from '../components/plantDetail/CommonNamesSection';
import { BotanicalSynonymsSection } from '../components/plantDetail/BotanicalSynonymsSection';
import LifecycleSection from '../components/plantDetail/LifecycleSection';
import ScientificDataSection from '../components/plantDetail/ScientificDataSection';
import FaqSection from '../components/plantDetail/FaqSection';
import { buildFaqItems } from '../utils/plantDetailFaq';
import { isUserFacingUrl, toUserFacingUrl } from '../utils/externalSourceUrl';
import { resolveTranslatedField } from '../utils/getTranslation';
import { capitalizeFirst } from '../utils/capitalizeFirst';
import { composeImageAttribution } from '../utils/imageAttribution';
import { adaptBadge } from '../utils/badgeColors';
import { formatPeriod } from '../utils/formatPeriod';
import {
  formatHardinessZone,
  formatLength,
  hasAnyXData,
  isHardinessSuspicious,
  parseStringArray,
  pickHeroImage,
  pickLongDescription,
  sortGalleryImages,
} from '../utils/plantDetail';

const PESTS_PREVIEW_COUNT = 10;

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
  const { system } = useUnitSystem();
  const mode = useTheme().palette.mode;
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

  const [pestsExpanded, setPestsExpanded] = useState(false);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // The lightbox can be driven by the full gallery (hero) OR by the filtered
  // subset shown in the inline gallery section (SMA-154), so its source list is
  // held in state and set at open time, not hard-wired to galleryImages.
  const [lightboxImages, setLightboxImages] = useState<PlantImage[]>([]);
  const openLightbox = (imgs: PlantImage[], index: number) => {
    setLightboxImages(imgs);
    setLightboxIndex(index);
  };
  // Stable handlers for PhotoLightbox: its keyboard-nav effect depends on these,
  // so memoizing them stops it from re-subscribing the window `keydown` listener
  // on every PlantDetail render while the lightbox is open.
  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const prevLightbox = useCallback(
    () =>
      setLightboxIndex((i) =>
        i == null
          ? null
          : (i - 1 + lightboxImages.length) % lightboxImages.length
      ),
    [lightboxImages.length]
  );
  const nextLightbox = useCallback(
    () =>
      setLightboxIndex((i) =>
        i == null ? null : (i + 1) % lightboxImages.length
      ),
    [lightboxImages.length]
  );
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
    // SMA-154: clear any open lightbox so a previous plant's photos never linger
    // while navigating to another /library/:id.
    setLightboxIndex(null);
    setLightboxImages([]);
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
  // SMA-39: the PlantImage object behind the hero URL (for the attribution
  // overlay). Null when the hero falls back to the legacy scalar or the brand
  // placeholder — those carry no licence metadata, so no overlay renders.
  const heroImage = useMemo<PlantImage | null>(
    () =>
      plant ? (plant.images.find((i) => i.url === heroImageUrl) ?? null) : null,
    [plant, heroImageUrl]
  );
  // SMA-39: compact attribution for the hero overlay, composed from REAL fields
  // only ("{source} · {license}", matching the design chip) — never fabricate a
  // credit or licence. Empty string when no metadata exists → no overlay. The
  // full "© credit · source · license" line stays in the lightbox.
  const heroAttribution = heroImage
    ? [heroImage.source, heroImage.licenseName].filter(Boolean).join(' · ')
    : '';
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

  // SMA-178: hero eyebrow "TYPE · LIFE CYCLE" above the title. The plant type
  // moves here (removed from the taxonomy chips); the life-cycle part shows only
  // when known, and the eyebrow is omitted entirely when neither is present.
  const heroEyebrow = [
    plant.plantType
      ? t(`plantTypes.${plant.plantType.name}`, plant.plantType.name)
      : null,
    plant.lifeCycle
      ? t(
          `plantDetail.enumValues.lifeCycle.${plant.lifeCycle}`,
          plant.lifeCycle
        )
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

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
  const height = formatLength(plant.minHeightCm, plant.maxHeightCm, system);
  if (height)
    characteristicRows.push({
      label: t('plantDetail.labels.height'),
      value: height,
    });
  const spread = formatLength(plant.minSpreadCm, plant.maxSpreadCm, system);
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

  // SMA-185 — the guard now also covers the Perenual flowering/harvest seasons
  // that LifecycleSection already renders, so a plant with only those still shows
  // the section (and its TOC entry 04 lights up). No current plant exhibits
  // Perenual-only seasons, so this is correctness/future-proofing with zero
  // visible effect on today's data.
  const showLifecycleSection =
    !!plant.sowingPeriod ||
    !!plant.harvestPeriod ||
    !!plant.lifeCycle ||
    !!plant.perenualData?.floweringSeason ||
    !!plant.perenualData?.harvestSeason;

  const showEdibleAndPropagation =
    ediblePartsList.length > 0 ||
    !!plant.propagationInstructions ||
    !!plant.sowingInstructions;

  const pestsToShow = pestsExpanded
    ? plant.pests
    : plant.pests.slice(0, PESTS_PREVIEW_COUNT);

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

  // SMA-78 — FAQ items auto-built from the plant's real fields; entry 14 of the
  // TOC goes live only when at least one question can be answered.
  const faqItems = buildFaqItems(plant, t, system);

  // SMA-178 part B — FROZEN 15-entry sommaire, numbered 01–15 per the v2 mockup.
  // The skeleton is fixed: a live-capable section with no data for this plant
  // renders as a greyed `empty` entry rather than being dropped. Teaser sections
  // not built yet are `coming-data` (pending data) or `coming-backend` (pending
  // backend); they are non-clickable placeholders whose sections arrive in PR C/D.
  // Per product decision, 04 (lifecycle) and 05 (scientific data) stay LIVE when
  // they have content — the "coming soon" treatment lives on the section, not the
  // nav. Only `live` entries are clickable + scroll-spied; ids match each
  // section's anchor (the teaser ids are reserved for the future PR C/D sections).
  // NOTE: Plain array, not useMemo — built after the loading / not-found early
  // returns using plant-derived state, so wrapping it in a hook would violate the
  // rules-of-hooks. No performance impact today: PlantDetailToc is not memoized.
  // Revisit only if the component is restructured to allow hooks after the guards.
  // Tracked in SMA-189.
  const tocSections: TocSection[] = [
    {
      num: '01',
      id: 'overview',
      labelKey: 'plantDetail.sections.overview',
      state: 'live',
    },
    {
      num: '02',
      id: 'gallery',
      labelKey: 'plantDetail.sections.gallery',
      state: 'live',
    },
    {
      num: '03',
      id: 'distribution',
      labelKey: 'plantDetail.sections.distribution',
      state: 'coming-data',
    },
    {
      num: '04',
      id: 'lifecycle',
      labelKey: 'plantDetail.sections.lifecycle',
      state: showLifecycleSection ? 'live' : 'empty',
    },
    {
      num: '05',
      id: 'scientific-data',
      labelKey: 'plantDetail.scientificData.title',
      state: showScientificData ? 'live' : 'empty',
    },
    {
      num: '06',
      id: 'characteristics',
      labelKey: 'plantDetail.sections.characteristics',
      state:
        characteristicRows.length > 0 || conditions.length > 0
          ? 'live'
          : 'empty',
    },
    {
      num: '07',
      id: 'edible',
      labelKey: 'plantDetail.sections.edibleAndPropagation',
      state: showEdibleAndPropagation ? 'live' : 'empty',
    },
    {
      num: '08',
      id: 'pests',
      labelKey: 'plantDetail.sections.pestsAndDiseases',
      state: plant.pests.length > 0 ? 'live' : 'empty',
    },
    {
      num: '09',
      id: 'common-names',
      labelKey: 'plantDetail.sections.commonNames',
      state: plant.commonNames.length > 1 ? 'live' : 'empty',
    },
    {
      num: '10',
      id: 'synonyms',
      labelKey: 'plantDetail.sections.synonyms',
      state: plant.synonyms.length > 0 ? 'live' : 'empty',
    },
    {
      num: '11',
      id: 'plantnet',
      labelKey: 'plantDetail.sections.plantnet',
      state: 'coming-data',
    },
    {
      num: '12',
      id: 'sources',
      labelKey: 'plantDetail.sections.sources',
      state: 'live',
    },
    {
      num: '13',
      id: 'similar',
      labelKey: 'plantDetail.sections.similar',
      state: 'coming-backend',
    },
    {
      num: '14',
      id: 'faq',
      labelKey: 'plantDetail.sections.faq',
      state: faqItems.length > 0 ? 'live' : 'empty',
    },
    {
      num: '15',
      id: 'community',
      labelKey: 'plantDetail.sections.community',
      state: 'coming-backend',
    },
  ];

  // Full-bleed page: fixed, symmetric horizontal padding (PAGE_PAD = 32px at md)
  // that does NOT grow on zoom-out, so the left-edge→TOC distance stays constant
  // and equals the content→right-edge distance.
  return (
    <Container
      maxWidth={false}
      disableGutters
      sx={{ pt: 4, pb: 6, px: { xs: 2, md: 4 } }}
    >
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate(backTarget)}
        sx={{ mb: 3 }}
      >
        {backLabel}
      </Button>

      {/* SMA-178 — full-bleed two-column shell: a narrow sticky TOC rail pinned to
          the page's left padding and the content filling all remaining width to the
          right padding (no empty gutter, no centring drift on zoom-out). GAP = 64px
          (md) between rail and content (~2x the previous spacing). Below md it
          stacks into a single column (rail above content; PlantDetailToc pill bar). */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          gap: { xs: 2, md: 8 },
          alignItems: { md: 'flex-start' },
          width: '100%',
        }}
      >
        {/* SMA-178 — left column: the unit toggle card above the TOC. The wrapper
            is the single sticky element (desktop top 80 / mobile top 56); the
            inner TOC renders static via its own `disableSticky` prop (SMA-183).
            At md+ the wrapper is a height-capped flex column (calc(100vh - 96px)):
            the toggle stays pinned (flexShrink 0) and the TOC list flex-grows with
            its own internal scroll, so a rail taller than a short viewport never
            pushes its lower entries below the fold. The wrapper is transparent so
            the toggle's own white card sits cleanly on the page. */}
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
          <Box sx={{ mb: 2, flexShrink: 0 }}>
            <UnitSystemToggle />
          </Box>
          <PlantDetailToc sections={tocSections} disableSticky />
        </Box>
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
            <CardContent>
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: { xs: 'column', md: 'row' },
                  gap: '28px',
                  alignItems: 'flex-start',
                }}
              >
                {/* ── Left column: hero photo ─────────────────────────────── */}
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
                  {/* The hero is a focusable button so keyboard users can open the
              lightbox; when no STABLE gallery exists we render a plain img instead
              (a disabled button would be a confusing focus target). Gated on the
              filtered gallery (SMA-118) so a Perenual-only plant — whose hero is
              the placeholder — never opens an empty lightbox. */}
                  {galleryImages.length > 0 ? (
                    <Box
                      component="button"
                      type="button"
                      onClick={() => openLightbox(galleryImages, 0)}
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
                  {/* SMA-39: hero overlays — gallery cue (bottom-left, when the
              gallery has photos) and licence attribution (bottom-right, when the
              hero is a real catalogued image). Decorative: pointer-events off so
              the whole image stays a single click target for the lightbox. */}
                  {galleryImages.length > 0 && (
                    <Box
                      sx={{
                        position: 'absolute',
                        left: '12px',
                        bottom: '12px',
                        bgcolor: 'rgba(27,94,58,0.92)',
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 600,
                        padding: '7px 12px',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        pointerEvents: 'none',
                      }}
                    >
                      <Sym name="collections" size={16} color="#fff" />
                      {t('plantDetail.gallery.seeGallery')}
                    </Box>
                  )}
                  {heroAttribution && (
                    <Box
                      sx={{
                        position: 'absolute',
                        right: '12px',
                        bottom: '12px',
                        bgcolor: 'rgba(255,255,255,0.92)',
                        color: '#5a665c',
                        fontSize: 10,
                        fontFamily: 'ui-monospace, monospace',
                        padding: '5px 9px',
                        borderRadius: '6px',
                        pointerEvents: 'none',
                      }}
                    >
                      {heroAttribution}
                    </Box>
                  )}
                </Box>
                {/* ── Right column: title, taxonomy, badges, CTA ──────────── */}
                <Box
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    {heroEyebrow && (
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
                    )}
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
                          <Box
                            component="span"
                            sx={{ color: 'text.secondary', fontWeight: 500 }}
                          >
                            {t('plantDetail.labels.family')}
                          </Box>
                          {plant.family}
                        </Box>
                      )}
                      {plant.genus && (
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
                          <Box
                            component="span"
                            sx={{ color: 'text.secondary', fontWeight: 500 }}
                          >
                            {t('plantDetail.labels.genus')}
                          </Box>
                          {plant.genus}
                        </Box>
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
                          clickable
                          icon={<OpenInNewIcon sx={{ fontSize: 15 }} />}
                          sx={{
                            height: 'auto',
                            bgcolor: 'background.paper',
                            color: 'secondary.main',
                            border: '1px solid',
                            borderColor: 'borderSubtle',
                            borderRadius: '999px',
                            fontSize: 13,
                            fontWeight: 700,
                            py: '6px',
                            '& .MuiChip-label': { px: '12px' },
                            '& .MuiChip-icon': {
                              color: 'secondary.main',
                              fontSize: 15,
                              ml: '8px',
                              mr: '-4px',
                            },
                          }}
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
                        {heroChips.map((c) => {
                          const b = adaptBadge(
                            { bg: c.bgcolor, fg: c.color, border: c.border },
                            mode
                          );
                          return (
                            <Box
                              key={c.key}
                              sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                bgcolor: b.bg,
                                color: b.fg,
                                border: '1px solid',
                                borderColor: b.border,
                                borderRadius: '8px',
                                padding: '7px 12px',
                                fontSize: 13,
                                fontWeight: 700,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {c.icon && (
                                <Sym name={c.icon} size={18} color={b.fg} />
                              )}
                              {c.label}
                            </Box>
                          );
                        })}
                      </Stack>
                    )}
                  </Box>
                  <Box sx={{ mt: 'auto' }}>
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      sx={{ mt: 2.5 }}
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
              <PlantHeroGauges plant={plant} />
              {(longDescription || shortDescription) && (
                <AboutSection key={plant.id} plant={plant} />
              )}
            </CardContent>
          </Card>

          {/* ── Section B: Photo gallery (SMA-154, inline). No card wrapper —
              the design has header + chips + filmstrip directly on the page
              background (global section-header pattern). ───────────────────── */}
          <Box id="gallery" sx={{ mb: 3, scrollMarginTop: '80px' }}>
            <SectionHeader title={t('plantDetail.sections.gallery')} />
            <PlantGallerySection
              key={plant.id}
              images={galleryImages}
              onSelect={openLightbox}
            />
          </Box>

          {/* ── Section 03: Distribution map teaser (SMA-78). Decorative blob
              map, always mounted; TOC entry stays coming-data (non-clickable). */}
          <DistributionSection />

          {/* ── SMA-178: lifecycle + scientific data hoisted to mockup order
              (after the gallery, before characteristics). The "about" content is
              folded into the Overview card above. ─────────────────────────── */}
          {showLifecycleSection && <LifecycleSection plant={plant} />}
          {showScientificData && <ScientificDataSection plant={plant} />}

          {/* ── Scientific data (coming soon) placeholder ──────────────────── */}
          {/* Always rendered — a promise about what's next, not a graceful-
          degradation fallback. Kept adjacent to the live scientific section
          (slot 05) after the SMA-178 reorder. */}
          <Card
            variant="outlined"
            sx={{ mb: 3, borderRadius: 3, bgcolor: 'surfaceSubtle' }}
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
                      {ediblePartsList.map((part) => {
                        const b = adaptBadge(
                          { bg: '#E8F5E9', fg: '#1B5E20' },
                          mode
                        );
                        return (
                          <Chip
                            key={part}
                            label={t(
                              `plantDetail.enumValues.ediblePart.${part.toLowerCase()}`,
                              part
                            )}
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
                    const pestColors = adaptBadge(
                      pestTypeColors(pest.type),
                      mode
                    );
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
                            border: '1px solid',
                            borderColor: pestColors.border,
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

          {/* ── Section 09: Common names (SMA-223). Language-card carousel with
              search + pin; mounted only when >1 name (gating preserved). */}
          {plant.commonNames.length > 1 && (
            <CommonNamesSection
              key={`common-names-${plant.id}`}
              commonNames={plant.commonNames}
            />
          )}

          {/* ── Section 10: Botanical synonyms (SMA-223). Italic synonym chips
              with authority tooltip + "+N more" toggle; mounted only when >0
              synonyms (gating preserved). */}
          {plant.synonyms.length > 0 && (
            <BotanicalSynonymsSection
              key={`botanical-synonyms-${plant.id}`}
              synonyms={plant.synonyms}
            />
          )}

          {/* ── Section 11: Observations & phenology teaser (SMA-78). Decorative
              sample data; always mounted; TOC entry (plantnet) stays coming-data. */}
          <ObservationsSection />

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
                    {plant.enrichmentSources.map((src) => {
                      const b = adaptBadge(sourceTypeColors(src), mode);
                      return (
                        <Chip
                          key={src}
                          label={t(
                            `plantDetail.enumValues.sourceType.${src}`,
                            src
                          )}
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

          {/* ── Section 13: Similar plants teaser (SMA-78). Decorative sample
              recommendations; always mounted; TOC entry (similar) stays
              coming-backend. */}
          <SimilarPlantsSection />

          {faqItems.length > 0 && <FaqSection plant={plant} />}
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
        images={lightboxImages}
        index={lightboxIndex}
        onClose={closeLightbox}
        onPrev={prevLightbox}
        onNext={nextLightbox}
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
): {
  key: string;
  label: string;
  bgcolor: string;
  color: string;
  border?: string;
  icon?: string;
}[] {
  const chips: {
    key: string;
    label: string;
    bgcolor: string;
    color: string;
    border?: string;
    icon?: string;
  }[] = [];
  // SMA-39: edibility and the two toxicity flags are independent semantic
  // badges (no mutual exclusion) with Material-Symbols icons. The edible badge
  // names the fruit explicitly when `edibleParts` lists one.
  const edibleParts = parseStringArray(plant.edibleParts);
  if (plant.isEdible || edibleParts.length > 0)
    chips.push({
      key: 'edible',
      label: edibleParts.some((p) => p.toLowerCase().includes('fruit'))
        ? t('plantDetail.flags.edibleFruit')
        : t('plantDetail.flags.edible'),
      bgcolor: '#E6F4EC',
      color: '#1B5E3A',
      border: '#BCE2CC',
      icon: 'restaurant',
    });
  if (plant.isMedicinal)
    chips.push({
      key: 'medicinal',
      label: t('plantDetail.flags.medicinal'),
      bgcolor: '#E0F7FA',
      color: '#006064',
    });
  if (plant.isToxicToHumans)
    chips.push({
      key: 'toxic-humans',
      label: t('plantDetail.flags.toxic'),
      bgcolor: '#FCE9E7',
      color: '#B23A2E',
      border: '#F3C9C3',
      icon: 'warning',
    });
  if (plant.isToxicToPets)
    chips.push({
      key: 'toxic-pets',
      label: t('plantDetail.flags.toxicToPets'),
      bgcolor: '#FCE9E7',
      color: '#B23A2E',
      border: '#F3C9C3',
      icon: 'pets',
    });
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
/**
 * Full-screen photo viewer with prev/next/close controls and a credit /
 * license caption. Rendered only while `index` is non-null, so callers can
 * mount/unmount it via a single state variable.
 */
// Zoom bounds for the lightbox (1× → 3× in 0.5 steps), shared by the +/- buttons.
const LIGHTBOX_ZOOM_MIN = 1;
const LIGHTBOX_ZOOM_MAX = 3;
const LIGHTBOX_ZOOM_STEP = 0.5;

// Translucent-light circular control used for every lightbox overlay button
// (close, prev/next, zoom) so they stay legible over a dark photo.
const lightboxControlSx = {
  color: 'white',
  bgcolor: 'rgba(255,255,255,0.15)',
  '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' },
  '&.Mui-disabled': { color: 'rgba(255,255,255,0.35)' },
} as const;

/**
 * Full-screen photo viewer matching the Plant Detail v2 design: a dark overlay
 * with the photo centred (contain), a localized type badge top-left, a close
 * button top-right, circular prev/next arrows on the edges, the composed
 * attribution bottom-left, and the counter + zoom controls bottom-right. Zoom is
 * stepped (1×–3×) and resets whenever the shown image changes or the viewer
 * (re)opens. Keyboard: ← previous, → next (Escape close + focus-trap come from
 * the MUI Dialog). Descriptive per-photo captions are deferred (SMA-177).
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
  const [zoom, setZoom] = useState(LIGHTBOX_ZOOM_MIN);

  // Reset zoom when the shown image changes (prev/next) or the viewer reopens.
  // Adjust-during-render (the React-recommended "reset on prop change" pattern)
  // rather than an effect, so it never trips `react-hooks/set-state-in-effect`.
  const [zoomedIndex, setZoomedIndex] = useState(index);
  if (index !== zoomedIndex) {
    setZoomedIndex(index);
    setZoom(LIGHTBOX_ZOOM_MIN);
  }

  // Arrow keys navigate; the MUI Dialog already wires Escape → onClose. Only
  // listen while the viewer is open so a closed lightbox never intercepts keys.
  useEffect(() => {
    if (index == null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') onPrev();
      else if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [index, onPrev, onNext]);

  if (index == null) return null;
  const img = images[index];
  if (!img) return null;

  const attribution = composeImageAttribution(img);
  // Localized type label — reused for the image alt text, the badge, and the
  // dialog so screen readers never hear the raw enum (e.g. "Habit").
  const imageTypeLabel = t(
    `plantDetail.gallery.types.${img.imageType}`,
    img.imageType
  );
  const zoomIn = () =>
    setZoom((z) => Math.min(LIGHTBOX_ZOOM_MAX, z + LIGHTBOX_ZOOM_STEP));
  const zoomOut = () =>
    setZoom((z) => Math.max(LIGHTBOX_ZOOM_MIN, z - LIGHTBOX_ZOOM_STEP));

  return (
    <Dialog
      open
      onClose={onClose}
      disableScrollLock
      aria-label={t('plantDetail.sections.gallery')}
      maxWidth="lg"
      fullWidth
      slotProps={{
        paper: { sx: { bgcolor: 'black', backgroundImage: 'none' } },
      }}
    >
      <Box sx={{ position: 'relative', bgcolor: 'black' }}>
        {/* Image viewport — overflow hidden so a zoomed photo is clipped to the
            frame rather than overflowing the dialog. */}
        <Box
          sx={{
            position: 'relative',
            width: '100%',
            height: '80vh',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Box
            component="img"
            src={img.url}
            alt={imageTypeLabel}
            sx={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              display: 'block',
              transform: `scale(${zoom})`,
              transition: 'transform 0.2s ease',
            }}
          />
          {/* Screen-reader-only zoom announcement (E4) — visual is unchanged. */}
          <Box
            role="status"
            aria-live="polite"
            aria-atomic="true"
            sx={visuallyHidden}
          >
            {t('plantDetail.gallery.zoomLevel', {
              percent: Math.round(zoom * 100),
            })}
          </Box>
        </Box>

        {/* Type badge — top-left, solid brand-green pill (same as the tiles). */}
        <Box
          sx={{
            position: 'absolute',
            top: 12,
            left: 12,
            px: 1,
            py: 0.5,
            borderRadius: 1.5,
            bgcolor: NAV_BG,
            color: '#fff',
            fontSize: 12,
            fontWeight: 600,
            pointerEvents: 'none',
          }}
        >
          {imageTypeLabel}
        </Box>

        {/* Close — top-right. */}
        <IconButton
          onClick={onClose}
          aria-label={t('plantDetail.gallery.lightboxClose')}
          sx={{ position: 'absolute', top: 8, right: 8, ...lightboxControlSx }}
        >
          <CloseIcon />
        </IconButton>

        {/* Prev / next — circular edge arrows (only when there's more than one). */}
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
                ...lightboxControlSx,
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
                ...lightboxControlSx,
              }}
            >
              <ChevronRightIcon />
            </IconButton>
          </>
        )}

        {/* Attribution — bottom-left, monospace, legible over the dark photo. */}
        {attribution && (
          <Typography
            variant="body2"
            sx={{
              position: 'absolute',
              bottom: 12,
              left: 12,
              maxWidth: '55%',
              color: 'rgba(255,255,255,0.92)',
              fontFamily: 'monospace',
              textShadow: '0 1px 3px rgba(0,0,0,0.9)',
              pointerEvents: 'none',
            }}
          >
            {attribution}
          </Typography>
        )}

        {/* Counter + zoom controls — bottom-right. */}
        <Stack
          direction="row"
          spacing={0.5}
          alignItems="center"
          sx={{
            position: 'absolute',
            bottom: 12,
            right: 12,
            bgcolor: 'rgba(0,0,0,0.45)',
            borderRadius: 2,
            px: 1,
            py: 0.25,
          }}
        >
          <Typography
            variant="body2"
            sx={{ color: 'white', mr: 0.5, fontVariantNumeric: 'tabular-nums' }}
          >
            {`${index + 1} / ${images.length}`}
          </Typography>
          <IconButton
            size="small"
            onClick={zoomOut}
            disabled={zoom <= LIGHTBOX_ZOOM_MIN}
            aria-label={t('plantDetail.gallery.zoomOut')}
            sx={lightboxControlSx}
          >
            <ZoomOutIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={zoomIn}
            disabled={zoom >= LIGHTBOX_ZOOM_MAX}
            aria-label={t('plantDetail.gallery.zoomIn')}
            sx={lightboxControlSx}
          >
            <ZoomInIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Box>
    </Dialog>
  );
}
