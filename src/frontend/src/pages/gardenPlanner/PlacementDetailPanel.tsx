import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import CloseIcon from '@mui/icons-material/Close';
import GridOnIcon from '@mui/icons-material/GridOn';
import SpaIcon from '@mui/icons-material/Spa';
import TuneIcon from '@mui/icons-material/Tune';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import { FootprintBadge } from '../../components/Garden/FootprintBadge';
import { usePlannerTokens } from '../../theme/usePlannerTokens';
import type { Plant } from '../../types/Plant';
import { getPlantDisplayName } from '../../utils/getPlantDisplayName';
import { getPlantColor } from '../../utils/plantColor';
import type { SoilType } from '../../utils/soil';
import { PLANT_HERO_PLACEHOLDER } from '../../utils/plantDetail';
import type {
  ExposureCategory,
  MomentsLit,
  Moment,
} from '../../utils/exposure';
import { cellRef } from '../../utils/cellRef';
import { ExposureOverridePopover } from './ExposureOverridePopover';
import {
  cellSizeToMeters,
  spacingToFootprintCells,
  type FootprintFitResult,
} from './placementGeometry';
import { NOTES_MAX_LENGTH, type PlannerPlacement } from './plannerReducer';

interface PlacementDetailPanelProps {
  placement: PlannerPlacement;
  plant: Plant | null;
  /** SMA-14: narrowed at the JSON boundary — no raw string reaches here. */
  soil: SoilType | undefined;
  language: string;
  // SMA-288: while the active-language catalog is pending, a missing plant is
  // indistinguishable from a not-yet-loaded one — the name slot stays empty
  // instead of flashing the unknown-plant fallback.
  catalogReady: boolean;
  /** Cell-size wire value — sizes the meters line and the source line. */
  cellSize: string;
  /** Grid dimensions — the steppers' hard upper bounds. */
  gridRows: number;
  gridCols: number;
  /**
   * SMA-309 — the anchor cell's computed exposure category, available whether
   * or not the exposure LAYER is on (the page decoupled the computation from
   * layer visibility). `null` when there is no grid data for the cell.
   */
  exposure?: ExposureCategory | null;
  /**
   * The triplet that category came from, when it came from the sun path. Lets
   * the label state WHEN the cell is lit exactly; `null` (indoor, override,
   * inactive) renders the category alone rather than a guess.
   */
  momentsLit?: MomentsLit | null;
  /** The anchor cell's manual override, for the panel's exposure control. */
  exposureOverride?: ExposureCategory | null;
  onSetExposureOverride?: (value: ExposureCategory | null) => void;
  /**
   * Fit verdict for a draft span pair at the placement's own anchor with the
   * placement excluded — the page closes over grid/placements so the panel
   * and the reducer guard can never disagree (single-predicate principle).
   */
  checkFit: (spanRows: number, spanCols: number) => FootprintFitResult;
  /** Resolve an overlap verdict's placement id to warn-copy fields. */
  describeOverlap: (placementId: string) => { plant: string; cell: string };
  onSetFootprint: (spanRows: number, spanCols: number) => void;
  onSetNotes?: (notes: string | null) => void;
  onMove: () => void;
  onRemove: () => void;
  /** Clears the selection — the header's X (SMA-309). */
  onClose?: () => void;
  /**
   * Origin carried to the plant detail page through router state — the SAME
   * mechanism the PlantsInGardenSection chips use, so the detail page offers
   * its back-to-garden affordance from the panel link too (SMA-309 R2).
   */
  gardenId?: string;
  gardenName?: string;
  /**
   * SMA-18 lot 2: where the panel lives. 'lane' (default) = the ≥lg 330px
   * card with its own chrome and header. 'sheet' = inside the bottom
   * Drawer: the card chrome is STRIPPED (the sheet Paper owns radius and
   * elevation), the header row too (the Drawer's title row is the sheet
   * chrome, PlantSidebar convention), and the root becomes the scroll
   * surface filling the Paper's bounded height.
   */
  variant?: 'lane' | 'sheet';
}

const MOMENT_ORDER: Moment[] = ['morning', 'noon', 'evening'];

// Intl constructors are among the costlier stdlib objects to instantiate and
// the only variable input here is the language — one formatter per locale,
// cached at module scope instead of rebuilt on every render (SMA-309 R3).
const listFormatCache = new Map<string, Intl.ListFormat>();
function getListFormat(language: string): Intl.ListFormat {
  let fmt = listFormatCache.get(language);
  if (!fmt) {
    fmt = new Intl.ListFormat(language, { style: 'long', type: 'conjunction' });
    listFormatCache.set(language, fmt);
  }
  return fmt;
}

/**
 * SMA-309 — the placement panel leads with the PLANT, not the grid: identity
 * header (photo, name, scientific name, footprint badge), a brief summary of
 * the facts a planner acts on (the anchor cell's exposure, watering, care
 * level, life cycle), the notes that round-tripped for months without ever
 * reaching a user, and only THEN the geometry it used to open with.
 *
 * The footprint block keeps every mechanic it had (local draft, resync by
 * adjust-during-render, live apply-on-fit, bounded steppers, aria-live value,
 * inline warn) — it is demoted in the layout, not weakened.
 */
export const PlacementDetailPanel = memo(function PlacementDetailPanel({
  placement,
  plant,
  soil,
  language,
  catalogReady,
  cellSize,
  gridRows,
  gridCols,
  exposure = null,
  momentsLit = null,
  exposureOverride = null,
  onSetExposureOverride,
  checkFit,
  describeOverlap,
  onSetFootprint,
  onSetNotes,
  onMove,
  onRemove,
  onClose,
  gardenId,
  gardenName,
  variant = 'lane',
}: PlacementDetailPanelProps) {
  const { t } = useTranslation();
  const tk = usePlannerTokens();

  // Footprint section (5.5 lot 3, mockup Etats): the suggestion is a
  // SUGGESTION — the user owns the size (product ruling 2026-07-21). The
  // panel steps a LOCAL DRAFT: a fitting draft applies immediately; a misfit
  // stays DISPLAYED with the inline warn (mockup: the warn shows WITH the
  // out-of-range value) and dispatches nothing.
  const [draft, setDraft] = useState({
    rows: placement.spanRows,
    cols: placement.spanCols,
  });
  // Resync when the selection (or its committed spans) changes — the React
  // render-phase adjust pattern (no effect, no extra paint); a misfit draft
  // on the SAME placement survives, per the mockup.
  const [synced, setSynced] = useState(placement);
  // Notes draft (SMA-309, R3): the draft is the LIVE UI value; the reducer is
  // committed on BLUR — one undoable step per editing session, one pushHistory
  // per edit instead of one grid deep-copy per keystroke. The page's ONE
  // dirty/Save cycle still owns persistence (no auto-save). Because nothing
  // moves `placement.notes` while the user types, the gate below resyncs the
  // draft exactly when the committed note changes UNDERNEATH the panel (Undo,
  // Cancel/restore, the reducer's own trim) and can never fight the user.
  const [notesDraft, setNotesDraft] = useState(placement.notes ?? '');
  const spansChanged =
    synced.spanRows !== placement.spanRows ||
    synced.spanCols !== placement.spanCols;
  if (
    synced.id !== placement.id ||
    spansChanged ||
    synced.notes !== placement.notes
  ) {
    setSynced(placement);
    // A misfit footprint draft on the SAME placement still survives (mockup):
    // a notes-only change must not reset the steppers.
    if (synced.id !== placement.id || spansChanged) {
      setDraft({ rows: placement.spanRows, cols: placement.spanCols });
    }
    if (synced.id !== placement.id || synced.notes !== placement.notes) {
      setNotesDraft(placement.notes ?? '');
    }
  }

  // NO unmount flush, deliberately (R3). Every persistence path blurs the
  // field before it acts (Save/Cancel/X are pointer interactions — mousedown
  // blurs first), so a commit is never missed there. The one blur-less
  // teardown is Escape, and Escape ABANDONS the uncommitted draft by design:
  // a flush was tried and rejected, because the same unmount also fires when
  // Cancel clears the selection — where flushing would re-commit the just-
  // discarded text onto the restored state, the exact resurrection the
  // resync gate above exists to kill.

  // Exposure override picker: anchored on the panel's own control, so opening
  // it can never disturb the selection that renders this panel (the cell-click
  // path clears the selection before opening — see GardenPlanner).
  const [overrideAnchor, setOverrideAnchor] = useState<HTMLElement | null>(null);

  const fit = checkFit(draft.rows, draft.cols);
  let warn: string | null = null;
  if (!fit.ok) {
    if (fit.reason === 'overlap') {
      const hit = describeOverlap(fit.overlapWith);
      warn = t('planner.place.footprintOverlapWarn', {
        plant: hit.plant,
        cell: hit.cell,
      });
    } else {
      warn = t('planner.place.footprintBlockedWarn');
    }
  }

  const step = (axis: 'rows' | 'cols', delta: 1 | -1) => {
    const next = {
      rows: axis === 'rows' ? draft.rows + delta : draft.rows,
      cols: axis === 'cols' ? draft.cols + delta : draft.cols,
    };
    setDraft(next);
    // Live apply-on-fit: the reducer re-guards with the same predicate, so a
    // dispatched value can never half-happen.
    if (checkFit(next.rows, next.cols).ok) {
      onSetFootprint(next.rows, next.cols);
    }
  };

  // Source line: the SINGLE cached Perenual value (lot-1 ruling — the data
  // corrects the mockup's decorative range); unknown reuses the lot-1 key.
  const spacing = spacingToFootprintCells(
    plant?.xPlantSpacingValue ?? null,
    plant?.xPlantSpacingUnit ?? null,
    cellSize
  );

  // Cells + meters line, from the DRAFT (the mockup shows the live value):
  // refs via the lot-1 cellRef util, meters = spans × cellSize, one decimal
  // with the locale separator (FR comma).
  const meters = cellSizeToMeters(cellSize);
  const fmtMeters = (v: number) =>
    v.toLocaleString(language, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  const footprintLine = t('planner.place.footprintLine', {
    from: cellRef(placement.startRow, placement.startCol),
    to: cellRef(
      placement.startRow + draft.rows - 1,
      placement.startCol + draft.cols - 1
    ),
    r: draft.rows,
    c: draft.cols,
    w: fmtMeters(draft.cols * meters),
    h: fmtMeters(draft.rows * meters),
  });

  const displayName = plant
    ? getPlantDisplayName(plant, language)
    : catalogReady
      ? t('planner.unknownPlant')
      : '';

  /**
   * Exposure label. EXACT or nothing: with the triplet we can enumerate the
   * lit moments; without it (indoor, manual override) the category stands
   * alone — `aggregateExposure` collapses {morning,noon,evening} and the
   * ratified noon-only case into 'full', so an enumeration guessed from the
   * category could be false.
   */
  const exposureText = (() => {
    if (!exposure) return null;
    const category = t(`planner.exposure.categories.${exposure}`);
    if (!momentsLit) return category;
    const lit = MOMENT_ORDER.filter((m) => momentsLit[m]).map((m) =>
      t(`planner.exposure.moments.${m}`).toLocaleLowerCase(language)
    );
    if (lit.length === 0) return category;
    return t('planner.placement.exposureValue', {
      category,
      moments: getListFormat(language).format(lit),
    });
  })();

  // Watering mirrors PlantCard's preference order: the broad Perenual enum
  // (95.7% filled) first, the legacy free-text scalar (5.6%) only as fallback.
  const wateringText = plant?.wateringNeedLevel
    ? t(
        `plantDetail.enumValues.wateringNeed.${plant.wateringNeedLevel}`,
        plant.wateringNeedLevel
      )
    : plant?.waterNeeds
      ? t(`plantValues.${plant.waterNeeds}`, plant.waterNeeds)
      : null;
  const careText = plant?.careLevel
    ? t(`plantDetail.enumValues.careLevel.${plant.careLevel}`, plant.careLevel)
    : null;
  // Third data point per the SMA-309 gate: LifeCycle at 95.3% fill beat the
  // dropped sowing/harvest period (5.6%) — for a planner it answers the more
  // actionable question, does this come back next year.
  const lifeCycleText = plant?.lifeCycle
    ? t(`plantDetail.enumValues.lifeCycle.${plant.lifeCycle}`, plant.lifeCycle)
    : null;

  /** One icon-prefixed summary row; hidden entirely when the value is null. */
  const summaryRow = (
    key: string,
    icon: React.ReactNode,
    label: string,
    value: string | null
  ) =>
    value === null ? null : (
      <Box
        key={key}
        data-testid={`summary-${key}`}
        sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}
      >
        <Box sx={{ display: 'flex', color: tk.muted, flexShrink: 0 }}>
          {icon}
        </Box>
        <Typography
          component="span"
          sx={{ fontSize: 12, color: tk.muted, flexShrink: 0 }}
        >
          {label}
        </Typography>
        <Typography
          component="span"
          sx={{
            fontSize: 12.5,
            fontWeight: 600,
            color: tk.tMeta,
            textAlign: 'right',
            ml: 'auto',
          }}
        >
          {value}
        </Typography>
      </Box>
    );

  return (
    // R4 (item F, owner preference): the panel is a plain card filling the
    // ALWAYS-reserved 330px right lane — the LANE (in GardenPlanner) owns
    // stickiness and scrolling; the panel no longer positions itself.
    // R5 (CR accept): planner-token surface (mode-aware, no theme drift).
    // SMA-18 lot 2: in the SHEET the card chrome goes away (the Drawer
    // Paper owns radius/elevation/bgcolor) and the root IS the scroll
    // surface — flex:1/minHeight:0 takes the Paper's bounded height, the
    // PlantSidebar sheet-variant contract.
    <Box
      sx={
        variant === 'sheet'
          ? { width: '100%', p: 2, flex: 1, minHeight: 0, overflowY: 'auto' }
          : {
              width: '100%',
              p: 2,
              border: `1px solid ${tk.cardBd}`,
              borderRadius: '12px',
              bgcolor: tk.card,
              boxShadow: tk.shadow,
            }
      }
    >
      {/* Header (SMA-309): the panel says what it is, and offers the way
          out. Sheet variant: the Drawer's title row already does both — a
          second title and a second X would fight it (PlantSidebar keeps its
          switch row but never its own header, same rule). */}
      {variant !== 'sheet' && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            mb: 1.5,
          }}
        >
          <Typography
            component="h2"
            sx={{
              fontSize: 11.5,
              fontWeight: 800,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: tk.muted,
            }}
          >
            {t('planner.placement.title')}
          </Typography>
          {onClose && (
            <IconButton
              size="small"
              aria-label={t('planner.placement.close')}
              onClick={onClose}
              sx={{ ml: 'auto', p: '2px', color: tk.muted }}
            >
              <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>
          )}
        </Box>
      )}

      {/* Identity: the photo takes the slot the sidebar gives its initial. */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {plant?.imageUrl ? (
          <Box
            component="img"
            src={plant.imageUrl}
            alt={displayName}
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              // Filet (SMA-118/5a): a "stable" URL that still fails swaps to
              // the brand placeholder. The dataset flag prevents an error loop
              // (the placeholder is a data: URI that always loads).
              const img = e.currentTarget;
              if (!img.dataset.fallback) {
                img.dataset.fallback = '1';
                img.src = PLANT_HERO_PLACEHOLDER;
              }
            }}
            sx={{
              width: 56,
              height: 56,
              flexShrink: 0,
              borderRadius: '10px',
              objectFit: 'cover',
              border: `1px solid ${tk.cardBd}`,
            }}
          />
        ) : (
          // 31.5% of the catalogue has NO stable image (SMA-118: Perenual's
          // signed URLs expire, so only Trefle counts) — this is a COMMON
          // case, so it wears the plant's own identity colour, the same one
          // the sidebar row and the grid block use, instead of a broken-image
          // slot or a generic brand square.
          <Avatar
            variant="rounded"
            sx={{
              width: 56,
              height: 56,
              flexShrink: 0,
              borderRadius: '10px',
              fontSize: 24,
              fontWeight: 800,
              bgcolor: getPlantColor(placement.plantId),
            }}
          >
            {displayName.charAt(0).toUpperCase()}
          </Avatar>
        )}
        <Box sx={{ minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: 15,
              fontWeight: 700,
              lineHeight: 1.25,
              color: tk.tTitle,
            }}
          >
            {/* Shared Library resolver (SMA-194); localized unknown fallback
                (F4), reserved for plants missing from a READY catalog
                (SMA-288). */}
            {displayName}
          </Typography>
          {plant && (
            <Typography
              sx={{
                fontSize: 12,
                fontStyle: 'italic',
                color: tk.tSci,
                mt: '2px',
              }}
            >
              {plant.scientificName}
            </Typography>
          )}
          <Box sx={{ mt: '6px', display: 'flex' }}>
            {/* Shared badge (SMA-18, extracted SMA-309): the SAME component
                the sidebar rows and the armed chip render. */}
            <FootprintBadge fp={spacing} />
          </Box>
        </Box>
      </Box>

      {/* Brief summary — each row hides when its value is unknown. */}
      <Box
        sx={{
          mt: 1.5,
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        {summaryRow(
          'exposure',
          <WbSunnyIcon sx={{ fontSize: 15, color: tk.expoIcc }} />,
          t('planner.placement.exposure'),
          exposureText
        )}
        {summaryRow(
          'watering',
          <WaterDropIcon sx={{ fontSize: 15 }} />,
          t('planner.placement.watering'),
          wateringText
        )}
        {summaryRow(
          'care',
          <SpaIcon sx={{ fontSize: 15 }} />,
          t('planner.placement.careLevel'),
          careText
        )}
        {summaryRow(
          'lifeCycle',
          <AutorenewIcon sx={{ fontSize: 15 }} />,
          t('planner.placement.lifeCycle'),
          lifeCycleText
        )}
        {soil &&
          summaryRow(
            'soil',
            <GridOnIcon sx={{ fontSize: 15 }} />,
            t('planner.placement.soilLabel'),
            // SMA-14 / SMA-317: the vocabulary exists now — render the
            // translated label, never the stored key.
            t(`planner.soil.types.${soil}`)
          )}
      </Box>

      {plant && (
        <Typography sx={{ mt: 1, fontSize: 12 }}>
          <Link
            component={RouterLink}
            to={`/library/${plant.id}`}
            state={{
              from: 'planner',
              gardenId,
              gardenName,
            }}
          >
            {t('planner.placement.details')}
          </Link>
        </Typography>
      )}

      {/* The cell's exposure override, reachable from the panel (SMA-309) —
          including under a placement, which the cell-click trigger excludes. */}
      {onSetExposureOverride && (
        <Box sx={{ mt: 1.5 }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<TuneIcon sx={{ fontSize: 16 }} />}
            onClick={(e) => setOverrideAnchor(e.currentTarget)}
            sx={{
              fontSize: 12,
              textTransform: 'none',
              borderColor: tk.obtnBd,
              color: tk.obtnTx,
            }}
          >
            {t('planner.placement.adjustExposure')}
          </Button>
          <ExposureOverridePopover
            open={overrideAnchor !== null}
            anchorEl={overrideAnchor}
            current={exposureOverride}
            onSelect={(value) => {
              onSetExposureOverride(value);
              setOverrideAnchor(null);
            }}
            onClose={() => setOverrideAnchor(null)}
          />
        </Box>
      )}

      {/* Notes (SMA-309): edits ride the page's existing dirty/Save cycle —
          the cap mirrors GardenPlacement.Notes through the reducer's exported
          constant. R3: TextField's OWN label (programmatic association for
          free — htmlFor, click-to-focus, consistent AT behaviour — where the
          old detached Typography + aria-label had none of it), and the commit
          happens on blur: buttons fire blur before click, so Save right after
          typing still commits first. */}
      {onSetNotes && (
        <Box sx={{ mt: 2 }}>
          <TextField
            fullWidth
            multiline
            rows={3}
            size="small"
            label={t('planner.placement.notes')}
            placeholder={t('planner.placement.notesPlaceholder')}
            slotProps={{ htmlInput: { maxLength: NOTES_MAX_LENGTH } }}
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            // No-edit blurs dispatch nothing: a legacy note stored UNTRIMMED
            // by the pre-R3 per-keystroke path would otherwise round-trip
            // through the reducer's trim on a mere focus-then-blur — a
            // phantom undo entry and a dirty bar the user never caused.
            onBlur={() => {
              if (notesDraft !== (placement.notes ?? '')) {
                onSetNotes(notesDraft);
              }
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                fontSize: 12.5,
                bgcolor: tk.searchBg,
                '& fieldset': { borderColor: tk.inputBd },
              },
            }}
          />
        </Box>
      )}

      {/* Geometry, demoted (SMA-309): a titled box below the identity, with
          every lot-3 mechanic intact. */}
      <Box
        sx={{
          mt: 2,
          p: '10px 12px',
          borderRadius: '10px',
          border: `1px solid ${tk.cardBd}`,
          bgcolor: tk.segBg,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <GridOnIcon sx={{ fontSize: 15, color: tk.muted }} />
          <Typography
            component="h3"
            sx={{ fontSize: 12, fontWeight: 800, color: tk.tMeta }}
          >
            {t('planner.placement.footprintTitle')}
          </Typography>
        </Box>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 0.5 }}
        >
          {spacing.known
            ? t('planner.place.footprintSource', {
                value: plant?.xPlantSpacingValue,
                unit: plant?.xPlantSpacingUnit,
              })
            : t('planner.place.footprintUnknown')}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', mt: 1 }}>
          <FootprintStepper
            axis="rows"
            value={draft.rows}
            max={gridRows}
            onStep={step}
            tk={tk}
          />
          <Typography component="span" sx={{ fontSize: 13, color: tk.tMeta }}>
            ×
          </Typography>
          <FootprintStepper
            axis="cols"
            value={draft.cols}
            max={gridCols}
            onStep={step}
            tk={tk}
          />
          <Typography component="span" sx={{ fontSize: 13, color: tk.tMeta }}>
            {t('planner.place.cellsUnit')}
          </Typography>
        </Box>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 0.75 }}
        >
          {footprintLine}
        </Typography>
        {warn && (
          <Box
            role="alert"
            sx={{
              mt: 1,
              p: '8px 10px',
              borderRadius: '8px',
              border: `1px solid ${tk.dangTx}`,
              backgroundImage: tk.redHatch,
              color: tk.dangTx,
              fontSize: 12.5,
              fontWeight: 600,
            }}
          >
            {warn}
          </Box>
        )}
      </Box>

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mt: 1.5, fontStyle: 'italic' }}
      >
        {t('planner.placement.replaceHint')}
      </Typography>
      <Box sx={{ display: 'flex', gap: '8px', mt: 1.5 }}>
        {/* Move (mockup Etats): re-arms the placement's own plant — Place
            mode + the lot-2 drag take over from there. */}
        <Button size="small" variant="outlined" onClick={onMove}>
          {t('planner.place.move')}
        </Button>
        <Button color="error" size="small" onClick={onRemove}>
          {t('planner.placement.remove')}
        </Button>
      </Box>
    </Box>
  );
});

/**
 * One stepper leg ("− N +"): buttons carry the aria contract; the value is
 * announced via its live region. Extracted from the panel body in SMA-309 so
 * the demoted geometry box stays readable — behaviour is unchanged.
 */
function FootprintStepper({
  axis,
  value,
  max,
  onStep,
  tk,
}: {
  axis: 'rows' | 'cols';
  value: number;
  max: number;
  onStep: (axis: 'rows' | 'cols', delta: 1 | -1) => void;
  tk: ReturnType<typeof usePlannerTokens>;
}) {
  const { t } = useTranslation();
  const decKey = axis === 'rows' ? 'decreaseRows' : 'decreaseCols';
  const incKey = axis === 'rows' ? 'increaseRows' : 'increaseCols';
  const btnSx = {
    border: `1px solid ${tk.cardBd}`,
    borderRadius: '6px',
    width: 26,
    height: 26,
    fontSize: 15,
    bgcolor: tk.card,
  };
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
      <IconButton
        size="small"
        aria-label={t(`planner.place.${decKey}`)}
        disabled={value <= 1}
        onClick={() => onStep(axis, -1)}
        sx={btnSx}
      >
        −
      </IconButton>
      <Box
        component="span"
        aria-live="polite"
        sx={{
          minWidth: 20,
          textAlign: 'center',
          fontWeight: 700,
          fontSize: 14,
        }}
      >
        {value}
      </Box>
      <IconButton
        size="small"
        aria-label={t(`planner.place.${incKey}`)}
        disabled={value >= max}
        onClick={() => onStep(axis, 1)}
        sx={btnSx}
      >
        +
      </IconButton>
    </Box>
  );
}
