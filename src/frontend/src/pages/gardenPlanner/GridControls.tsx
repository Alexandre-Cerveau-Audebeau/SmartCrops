import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import UndoIcon from '@mui/icons-material/Undo';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import {
  footprintBadgeSx,
  iosSwitchSx,
  type PlannerTokens,
} from '../../theme/plannerTokens';
import { usePlannerTokens } from '../../theme/usePlannerTokens';
import type { Moment, Season } from '../../utils/exposure';
import { Sym } from '../../components/Sym';
import { ModeIconInfra } from './icons/ModeIconInfra';
import { ModeIconPlace } from './icons/ModeIconPlace';
import { ModeIconSelect } from './icons/ModeIconSelect';
import { ZOOM_MAX, ZOOM_MIN } from './plannerReducer';

const MOMENTS: Moment[] = ['morning', 'noon', 'evening'];
const SEASONS: Season[] = ['summer', 'winter'];

/**
 * Toolbar row-2 segmented control (tokens §10): `--seg-bg` container radius 9
 * padding 3; items radius 7, padding 8×14 (6×9 mobile), fs 13 (11.5) w700;
 * active = `--seg-on-bg`/`--seg-on-tx` + shadow. Options are toggle buttons
 * (visible text = accessible name, state via aria-pressed); the whole set is
 * disabled while the exposure layer is hidden.
 */
function PresetSegmented<T extends string>({
  options,
  labels,
  value,
  disabled,
  onChange,
  tk,
}: {
  options: T[];
  labels: Record<T, string>;
  value: T;
  disabled: boolean;
  onChange: (value: T) => void;
  tk: PlannerTokens;
}) {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        gap: '2px',
        bgcolor: tk.segBg,
        borderRadius: '9px',
        p: '3px',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Box
            key={opt}
            component="button"
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(opt)}
            sx={{
              border: 'none',
              cursor: disabled ? 'default' : 'pointer',
              px: { xs: '9px', sm: '14px' },
              py: { xs: '6px', sm: '8px' },
              borderRadius: '7px',
              fontFamily: 'inherit',
              fontSize: { xs: 11.5, sm: 13 },
              fontWeight: 700,
              lineHeight: 1.2,
              bgcolor: active ? tk.segOnBg : 'transparent',
              color: active ? tk.segOnTx : tk.tMeta,
              boxShadow: active ? tk.segShadow : 'none',
              transition: 'background-color .15s, color .15s',
            }}
          >
            {labels[opt]}
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * §10 mode button (SMA-15 5.4): h 38 (34 mobile) · padding-x 14 (10) ·
 * fs 13.5 (12) ; active = `--prim` fill, white text. §10's mobile icon-only
 * variant ships with SMA-18: below sm the LABEL is hidden and the glyph
 * carries the button alone (the historical deviation — "the doc names no
 * icons" — expired once every mode button gained one). The accessible name
 * is an explicit `aria-label` present at EVERY breakpoint, never
 * conditionally: no assistive technology and no test may depend on the
 * viewport for the button's name (§10 aria contract). The inactive face
 * reuses the outlined-button tokens (obtnBd/tMeta — nearest existing, no
 * invented hex).
 */
function ModeButton({
  label,
  active,
  disabled,
  icon,
  onClick,
  tk,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  /** SMA-18: the mockup mode glyph (Etats L1014) — decorative, before the label. */
  icon?: React.ReactNode;
  onClick: () => void;
  tk: PlannerTokens;
}) {
  return (
    <Box
      component="button"
      type="button"
      aria-pressed={active}
      // SMA-18: the name lives here unconditionally — the visible label is
      // display-gated below sm, and an accessible name must not be.
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Mockup template (Etats): 18px icon, 7px gap inside the h38/r8 chip.
        gap: '7px',
        height: { xs: 34, sm: 38 },
        px: { xs: '10px', sm: '14px' },
        fontSize: { xs: 12, sm: 13.5 },
        fontWeight: 700,
        fontFamily: 'inherit',
        lineHeight: 1.2,
        borderRadius: '8px',
        cursor: disabled ? 'default' : 'pointer',
        border: active ? '1px solid transparent' : `1px solid ${tk.obtnBd}`,
        bgcolor: active ? tk.prim : 'transparent',
        color: active ? '#fff' : tk.tMeta,
        opacity: disabled ? 0.5 : 1,
        transition: 'background-color .15s, color .15s',
      }}
    >
      {icon && (
        // 18px em-box; the svg inherits it (1em) and paints currentColor,
        // so the icon follows the existing active/inactive colors.
        <Box
          component="span"
          aria-hidden
          sx={{ display: 'inline-flex', fontSize: 18, lineHeight: 0 }}
        >
          {icon}
        </Box>
      )}
      {/* §10 "labels masqués sur mobile (icône seule)" — hidden BELOW sm;
          the aria-label above keeps the name at every breakpoint. */}
      <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
        {label}
      </Box>
    </Box>
  );
}

/**
 * SMA-18 (R2; extracted R3 per the file's PresetSegmented/ModeButton
 * precedent): armed-plant indicator — right of the mode group, before
 * undo/zoom, visible on EVERY sidebar tab. Same tinted-prim chip pair as
 * the sidebar (§1/§2 cntChipBg + prim). The danger X (owner accept, R2) is
 * a SIBLING of the role="status" block so status announcements never
 * include the button.
 */
function ArmedPlantIndicator({
  armedPlant,
  onDisarm,
  tk,
  t,
}: {
  armedPlant: {
    name: string;
    footprint: string;
    footprintKnown: boolean;
    footprintMulti?: boolean;
  };
  onDisarm?: () => void;
  tk: PlannerTokens;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  return (
    <Box
      data-testid="armed-plant-indicator"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '7px',
        height: 32,
        px: '10px',
        minWidth: 0,
        borderRadius: '8px',
        bgcolor: tk.cntChipBg,
        border: `2px solid ${tk.prim}`,
      }}
    >
      <Box
        role="status"
        aria-label={t('planner.place.armedIndicator', {
          plant: armedPlant.name,
          footprint: armedPlant.footprint,
        })}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          minWidth: 0,
        }}
      >
        {/* Same glyph as the Placer button — the coherent cue. */}
        <Box
          component="span"
          aria-hidden
          sx={{
            display: 'inline-flex',
            fontSize: 17,
            lineHeight: 0,
            color: tk.prim,
          }}
        >
          <ModeIconPlace />
        </Box>
        {/* R2 (owner accept): the meaning is VISIBLE, not aria-only. */}
        <Typography
          component="span"
          noWrap
          sx={{
            flexShrink: 0,
            fontSize: 11.5,
            fontWeight: 600,
            color: tk.tMeta,
          }}
        >
          {t('planner.place.armedIndicatorPrefix')}
        </Typography>
        <Typography
          component="span"
          noWrap
          sx={{
            // 220 → 180 (R2): the prefix + X joined the chip — the
            // name yields the width so undo/zoom never move.
            maxWidth: 180,
            fontSize: 13,
            fontWeight: 700,
            color: tk.tTitle,
          }}
        >
          {armedPlant.name}
        </Typography>
        <Box
          component="span"
          sx={footprintBadgeSx(
            tk,
            armedPlant.footprintKnown,
            armedPlant.footprintMulti
          )}
        >
          {armedPlant.footprint}
        </Box>
      </Box>
      {onDisarm && (
        <IconButton
          size="small"
          aria-label={t('planner.place.disarmLabel', {
            plant: armedPlant.name,
          })}
          onClick={onDisarm}
          sx={{ p: '2px', color: tk.dangTx }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      )}
    </Box>
  );
}

/**
 * SMA-18 lot 2 R2 (Alexandre, phone pass): the undo/zoom cluster, ONE
 * definition for its two homes — the toolbar's right slot (≥sm, mockup R4
 * order: undo · − · % · +) and the in-grid anchored row (<sm, the dictated
 * order: undo · % · − · +, the percentage reading as a label for the
 * magnifiers that follow it). Same handlers, same ZOOM_MIN/ZOOM_MAX
 * disabled predicates, same accessible names — the two clusters can never
 * drift because there is only this one, and they are never MOUNTED at the
 * same breakpoint, so a name exists exactly once at any viewport.
 */
export function UndoZoomCluster({
  order,
  zoom,
  canUndo,
  onUndo,
  onZoomIn,
  onZoomOut,
}: {
  order: 'toolbar' | 'grid';
  zoom: number;
  canUndo: boolean;
  onUndo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  const { t } = useTranslation();
  const undoBtn = (
    <IconButton
      size="small"
      onClick={onUndo}
      disabled={!canUndo}
      aria-label={t('planner.toolbar.undo')}
    >
      <UndoIcon fontSize="small" />
    </IconButton>
  );
  const readout = (
    <Typography variant="caption" sx={{ minWidth: 40, textAlign: 'center' }}>
      {Math.round(zoom * 100)}%
    </Typography>
  );
  const zoomOutBtn = (
    <IconButton
      size="small"
      onClick={onZoomOut}
      disabled={zoom <= ZOOM_MIN}
      aria-label={t('planner.toolbar.zoomOut')}
    >
      <ZoomOutIcon fontSize="small" />
    </IconButton>
  );
  const zoomInBtn = (
    <IconButton
      size="small"
      onClick={onZoomIn}
      disabled={zoom >= ZOOM_MAX}
      aria-label={t('planner.toolbar.zoomIn')}
    >
      <ZoomInIcon fontSize="small" />
    </IconButton>
  );
  return order === 'toolbar' ? (
    <>
      {undoBtn}
      {zoomOutBtn}
      {readout}
      {zoomInBtn}
    </>
  ) : (
    <>
      {undoBtn}
      {readout}
      {zoomOutBtn}
      {zoomInBtn}
    </>
  );
}

interface GridControlsProps {
  hasGrid: boolean;
  shapeEditMode: boolean;
  /** Infrastructure paint mode + whether a type is armed (SMA-15 5.4). */
  infraMode?: boolean;
  infraArmed?: boolean;
  /** Place mode (SMA-193 5.5) — no armed gate since lot 3 R2 (move-only entry). */
  placeMode?: boolean;
  /** Soil paint mode + whether a type is armed (SMA-14) — the infra gate. */
  soilMode?: boolean;
  soilArmed?: boolean;
  /**
   * SMA-18: the armed plant, minimal display shape — the toolbar indicator
   * renders it whatever sidebar tab is active (the reported bug: arming then
   * switching tabs hid the armed state; duplication with the sidebar chip is
   * the product ruling, 22 Jul). Null/undefined = nothing armed.
   */
  armedPlant?: {
    name: string;
    footprint: string;
    footprintKnown: boolean;
    /** SMA-18 mobile: true for an N×N footprint with N > 1 — the badge's
     * mobile size steps up for multi-cell footprints (§11). Optional so the
     * shape stays backward-compatible; absent = single. */
    footprintMulti?: boolean;
  } | null;
  /** SMA-18 R2: explicit disarm from the indicator's X — same dispatch as
   * the sidebar chip's X (SET_PLACE_PLANT null on the page side). */
  onDisarm?: () => void;
  /**
   * SMA-18 lot 2 R3 (GitHub Major 7f61fafb): the below-sm decision is made
   * ONCE, by the page — GardenPlanner already derives this exact value at
   * the same breakpoint to mount the in-grid cluster, so re-deriving it
   * here meant two matchMedia subscriptions answering one question. The
   * prop is REQUIRED: the invariant "exactly one undo/zoom cluster mounts"
   * (which the Extension verified holds) now rests on a single source of
   * truth by construction.
   */
  isMobile: boolean;
  zoom: number;
  canUndo: boolean;
  exposureVisible: boolean;
  exposureMoment: Moment;
  exposureSeason: Season;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onUndo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleExposure: () => void;
  onSetExposureMoment: (moment: Moment) => void;
  onSetExposureSeason: (season: Season) => void;
  onSelectionMode?: () => void;
  onInfraMode?: () => void;
  onPlaceMode?: () => void;
  onSoilMode?: () => void;
}

/**
 * The planner TOOLBAR CARD (SMA-17 5.3-D R2, mockup É1 / tokens §10): lives
 * in the grid column, above the grid card. Row 1 = editing actions (undo +
 * zoom; the mode buttons land here with their chantiers); row 2 = the
 * exposure layer controls. The page header owns the garden title and the
 * Réglages/Annuler/Enregistrer actions (relocated in R2).
 */
export const GridControls = memo(function GridControls({
  hasGrid,
  shapeEditMode,
  infraMode = false,
  infraArmed = false,
  placeMode = false,
  soilMode = false,
  soilArmed = false,
  armedPlant = null,
  onDisarm,
  isMobile,
  zoom,
  canUndo,
  exposureVisible,
  exposureMoment,
  exposureSeason,
  onSelectAll,
  onDeselectAll,
  onUndo,
  onZoomIn,
  onZoomOut,
  onToggleExposure,
  onSetExposureMoment,
  onSetExposureSeason,
  onSelectionMode,
  onInfraMode,
  onPlaceMode,
  onSoilMode,
}: GridControlsProps) {
  const { t } = useTranslation();
  const tk = usePlannerTokens();

  const momentLabels: Record<Moment, string> = {
    morning: t('planner.exposure.moments.morning'),
    noon: t('planner.exposure.moments.noon'),
    evening: t('planner.exposure.moments.evening'),
  };
  const seasonLabels: Record<Season, string> = {
    summer: t('planner.exposure.seasons.summer'),
    winter: t('planner.exposure.seasons.winter'),
  };

  if (!hasGrid) return null;

  return (
    <Box
      sx={{
        bgcolor: tk.card,
        border: `1px solid ${tk.cardBd}`,
        borderRadius: '12px',
        boxShadow: tk.shadow,
        // §10: 12×16, 10×12 mobile (SMA-18 — the mobile pair was specified
        // but never implemented).
        p: { xs: '10px 12px', sm: '12px 16px' },
        mb: 1.5,
      }}
    >
      {/* Row 1 — editing actions. The LEFT slot hosts the mode buttons
          (§10): Sélection + Infrastructures shipped with 5.4 (SMA-15),
          Placer with 5.5 (SMA-193) — mockup order Sélection/Placer/Infras —
          and Sols appended with SMA-14 (the mockup stopped at three only
          because soils were never designed). Modes are mutually exclusive
          with shape-edit (the sidebar toggle) — no button reads active
          while shape-edit is on. */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 2,
        }}
      >
        {onSelectionMode && onInfraMode && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ModeButton
              label={t('planner.modes.selection')}
              active={!shapeEditMode && !infraMode && !placeMode && !soilMode}
              icon={<ModeIconSelect />}
              onClick={onSelectionMode}
              tk={tk}
            />
            {/* Lot 3 R2 (product ruling 22 Jul): Placer opens WITHOUT an armed
                plant — armless entry is the move-only mode (deliberate
                divergence from the Infrastructures gate below). */}
            {onPlaceMode && (
              <ModeButton
                label={t('planner.modes.place')}
                active={placeMode}
                icon={<ModeIconPlace />}
                onClick={onPlaceMode}
                tk={tk}
              />
            )}
            {/* Entering Infrastructures REQUIRES an armed type from the
                sidebar INFRAS. tab (the reducer guards it too). */}
            <ModeButton
              label={t('planner.modes.infrastructure')}
              active={infraMode}
              disabled={!infraMode && !infraArmed}
              icon={<ModeIconInfra />}
              onClick={onInfraMode}
              tk={tk}
            />
            {/* SMA-14: Sols mirrors the Infrastructures gate — entering
                REQUIRES an armed type from the sidebar SOLS tab. The mockup
                shows three buttons only because soils were never designed.
                Icon: Material Symbols `texture` via the self-hosted Sym
                font (the mode-icon SVG set carries no soil glyph and this
                session downloads nothing — declared deviation; the glyph
                inherits the button's currentColor like the SVGs do). */}
            {onSoilMode && (
              <ModeButton
                label={t('planner.modes.soils')}
                active={soilMode}
                disabled={!soilMode && !soilArmed}
                icon={<Sym name="texture" size={18} />}
                onClick={onSoilMode}
                tk={tk}
              />
            )}
          </Box>
        )}
        {shapeEditMode && (
          <>
            <Button variant="outlined" size="small" onClick={onSelectAll}>
              {t('planner.shape.selectAll')}
            </Button>
            <Button variant="outlined" size="small" onClick={onDeselectAll}>
              {t('planner.shape.deselectAll')}
            </Button>
          </>
        )}

        {armedPlant && (
          <ArmedPlantIndicator
            armedPlant={armedPlant}
            onDisarm={onDisarm}
            tk={tk}
            t={t}
          />
        )}

        {/* R4 (mockup arrangement): undo sits INSIDE the right cluster,
            immediately left of the zoom-out magnifier. SMA-18 lot 2 R2:
            ≥sm ONLY — below sm the same cluster (shared component above)
            mounts inside the grid card beside the compass instead, where
            the user is actually looking. */}
        {!isMobile && (
          <Box
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto' }}
          >
            <UndoZoomCluster
              order="toolbar"
              zoom={zoom}
              canUndo={canUndo}
              onUndo={onUndo}
              onZoomIn={onZoomIn}
              onZoomOut={onZoomOut}
            />
          </Box>
        )}
      </Box>

      {/* Full-width divider (§10: margin 12px -16px across the card padding;
          10px -12px mobile — SMA-18, tracking the card's own mobile pair) */}
      <Box
        sx={{
          borderTop: `1px solid ${tk.divider}`,
          my: { xs: '10px', sm: '12px' },
          mx: { xs: '-12px', sm: '-16px' },
        }}
      />

      {/* Row 2 (tokens §10): Exposition toggle + moment/season presets. The
          presets only drive the legend title until 5.4 ships cast shadows. */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WbSunnyIcon sx={{ color: tk.expoIcc, fontSize: 20 }} />
          {/* §10: switch 34×19, thumb 15, active --prim, inactive --track —
              the shared iosSwitchSx (R5), unchanged look. FormControlLabel
              (R3, CR accept): clicking the label toggles. */}
          <FormControlLabel
            control={
              <Switch
                checked={exposureVisible}
                onChange={onToggleExposure}
                slotProps={{
                  input: {
                    role: 'switch',
                    'aria-label': t('planner.exposure.toggle'),
                  },
                }}
                sx={iosSwitchSx(tk)}
              />
            }
            label={
              <Typography
                sx={{ fontSize: { xs: 12, sm: 13.5 }, fontWeight: 700, color: tk.tMeta }}
              >
                {t('planner.exposure.toggle')}
              </Typography>
            }
            sx={{ m: 0, gap: 1 }}
          />
        </Box>
        <PresetSegmented
          options={MOMENTS}
          labels={momentLabels}
          value={exposureMoment}
          disabled={!exposureVisible}
          onChange={onSetExposureMoment}
          tk={tk}
        />
        <PresetSegmented
          options={SEASONS}
          labels={seasonLabels}
          value={exposureSeason}
          disabled={!exposureVisible}
          onChange={onSetExposureSeason}
          tk={tk}
        />
      </Box>
    </Box>
  );
});
