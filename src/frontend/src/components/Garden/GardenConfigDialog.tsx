import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import SettingsIcon from '@mui/icons-material/Settings';
import BalconyIcon from '@mui/icons-material/Balcony';
import DeckIcon from '@mui/icons-material/Deck';
import GrassIcon from '@mui/icons-material/Grass';
import CabinIcon from '@mui/icons-material/Cabin';
import HomeIcon from '@mui/icons-material/Home';
import type { SvgIconComponent } from '@mui/icons-material';
import type { GardenConfig, LightSlot } from '../../types/Garden';
import { getPlannerTokens, type PlannerTokens } from '../../theme/plannerTokens';
import {
  formatHours,
  isInvalidSlot,
  slotHours,
} from '../../utils/lightSchedule';
import { CompassRose } from './CompassRose';

// Dimensions produced by the dialog alongside the config block — the planner
// turns these into the right reducer action (SETUP_CONFIRMED vs RESIZED).
export interface DialogDimensions {
  cols: number;
  rows: number;
  cellSize: string;
}

interface Props {
  open: boolean;
  /** First setup (no layout yet) vs editing an existing garden — the planner
   * uses it to pick SETUP_CONFIRMED vs RESIZED; the dialog only reports it back. */
  isFirstSetup: boolean;
  initialWidth: number;
  initialHeight: number;
  initialCellSize: string;
  initialConfig: GardenConfig;
  /** True while the parent persists the config — disables Save and blocks a
   * second submission until the request settles (SMA-17 R2). */
  busy?: boolean;
  /** Config-save error to surface inline; the parent keeps the dialog OPEN on
   * failure so the entered values survive for a retry (SMA-17 R2). */
  errorText?: string | null;
  onConfirm: (dimensions: DialogDimensions, config: GardenConfig) => void;
  onCancel: () => void;
}

const CELL_SIZES = ['25cm', '50cm', '1m'];
const MAX_LIGHT_SLOTS = 6;
const ORIENTATIONS = ['N', 'E', 'S', 'W'] as const;

const GARDEN_TYPES: Array<{ value: string; Icon: SvgIconComponent }> = [
  { value: 'balcony', Icon: BalconyIcon },
  { value: 'terrace', Icon: DeckIcon },
  { value: 'inground', Icon: GrassIcon },
  { value: 'greenhouse', Icon: CabinIcon },
  { value: 'indoor', Icon: HomeIcon },
];

function cellSizeToMeters(cellSize: string): number {
  if (cellSize === '1m') return 1;
  if (cellSize === '50cm') return 0.5;
  return 0.25;
}

// ── Small segmented control (tokens §10) ─────────────────────────────────────
interface SegmentedOption {
  value: string;
  label: ReactNode;
  ariaLabel?: string;
}

function Segmented({
  options,
  value,
  onChange,
  tk,
  ariaLabel,
}: {
  options: SegmentedOption[];
  value: string | null;
  onChange: (value: string) => void;
  tk: PlannerTokens;
  ariaLabel: string;
}) {
  return (
    <Box
      role="radiogroup"
      aria-label={ariaLabel}
      sx={{
        display: 'inline-flex',
        gap: '2px',
        bgcolor: tk.segBg,
        borderRadius: '9px',
        p: '3px',
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Box
            key={opt.value}
            component="button"
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.ariaLabel}
            onClick={() => onChange(opt.value)}
            sx={{
              border: 'none',
              cursor: 'pointer',
              px: '14px',
              py: '8px',
              borderRadius: '7px',
              fontFamily: 'inherit',
              fontSize: 13,
              fontWeight: 700,
              lineHeight: 1.2,
              bgcolor: active ? tk.segOnBg : 'transparent',
              color: active ? tk.segOnTx : tk.tMeta,
              boxShadow: active ? tk.segShadow : 'none',
              transition: 'background-color .15s, color .15s',
            }}
          >
            {opt.label}
          </Box>
        );
      })}
    </Box>
  );
}

function SectionLabel({ children, tk }: { children: ReactNode; tk: PlannerTokens }) {
  return (
    <Typography
      component="h3"
      sx={{ fontSize: 13, fontWeight: 800, color: tk.tTitle, mb: '10px' }}
    >
      {children}
    </Typography>
  );
}

function FieldLabel({ children, tk }: { children: ReactNode; tk: PlannerTokens }) {
  return (
    <Typography
      sx={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '.06em',
        textTransform: 'uppercase',
        color: tk.muted,
        mb: '6px',
      }}
    >
      {children}
    </Typography>
  );
}

function GardenConfigDialogInner({
  initialWidth,
  initialHeight,
  initialCellSize,
  initialConfig,
  busy = false,
  errorText,
  onConfirm,
  onCancel,
}: Omit<Props, 'open'>) {
  const { t } = useTranslation();
  const theme = useTheme();
  const tk = getPlannerTokens(theme.palette.mode);

  // Inputs/steppers use the token surface (searchBg) + border (inputBd) so
  // they read dark at night (#0F2038) instead of the default paper (SMA-17 R3).
  const inputSx = {
    '& .MuiOutlinedInput-root': {
      backgroundColor: tk.searchBg,
      '& fieldset': { borderColor: tk.inputBd },
      '&:hover fieldset': { borderColor: tk.inputBd },
    },
  } as const;

  const [cols, setCols] = useState(initialWidth || 10);
  const [rows, setRows] = useState(initialHeight || 8);
  const [cellSize, setCellSize] = useState(initialCellSize || '50cm');
  const [orientation, setOrientation] = useState<string | null>(
    initialConfig.orientation
  );
  const [gardenType, setGardenType] = useState<string | null>(
    initialConfig.gardenType
  );
  const [lightSlots, setLightSlots] = useState<LightSlot[]>(
    initialConfig.lightSchedule ?? []
  );
  const [hemisphere, setHemisphere] = useState<string>(
    initialConfig.hemisphere ?? 'N'
  );
  const [latitudeBand, setLatitudeBand] = useState<string>(
    initialConfig.latitudeBand ?? 'mid'
  );

  const realDimensions = useMemo(() => {
    const m = cellSizeToMeters(cellSize);
    return `${(cols * m).toFixed(1)}m × ${(rows * m).toFixed(1)}m`;
  }, [cols, rows, cellSize]);

  const totalLightHours = useMemo(
    () => lightSlots.reduce((sum, slot) => sum + slotHours(slot), 0),
    [lightSlots]
  );

  const isIndoor = gardenType === 'indoor';

  const westLabel = t('planner.config.west');
  const orientationOptions: SegmentedOption[] = ORIENTATIONS.map((o) => ({
    value: o,
    // N/E/S are identical across locales; only West localizes (O in FR).
    label: o === 'W' ? westLabel : o,
  }));

  // Block Save when any indoor slot is empty or has end <= start (CR b16df5ac):
  // the backend would only reject such a payload on submit.
  const hasInvalidLightSlot = isIndoor && lightSlots.some(isInvalidSlot);

  // The compass announces the current orientation for its accessible name
  // (CR a1b3c8f2); '—' when no orientation is chosen yet.
  const orientationDisplay = orientation
    ? orientation === 'W'
      ? westLabel
      : orientation
    : '—';
  const compassAria = t('planner.config.compassLabel', {
    orientation: orientationDisplay,
  });

  const updateSlot = (index: number, patch: Partial<LightSlot>) => {
    setLightSlots((prev) =>
      prev.map((slot, i) => (i === index ? { ...slot, ...patch } : slot))
    );
  };

  const addSlot = () => {
    setLightSlots((prev) =>
      prev.length >= MAX_LIGHT_SLOTS
        ? prev
        : [...prev, { start: '08:00', end: '12:00' }]
    );
  };

  const removeSlot = (index: number) => {
    setLightSlots((prev) => prev.filter((_, i) => i !== index));
  };

  const handleConfirm = () => {
    if (hasInvalidLightSlot) return;
    const config: GardenConfig = {
      orientation,
      gardenType,
      // lightSchedule only rides along for indoor gardens (backend rejects it
      // otherwise); an empty list serializes to null.
      lightSchedule: isIndoor && lightSlots.length > 0 ? lightSlots : null,
      hemisphere,
      latitudeBand,
    };
    onConfirm({ cols, rows, cellSize }, config);
  };

  return (
    <Box sx={{ p: '24px', color: tk.tMeta }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 3 }}>
        <SettingsIcon sx={{ color: tk.prim, mt: '2px' }} />
        <Box sx={{ flex: 1 }}>
          <Typography
            component="h2"
            sx={{ fontSize: 20, fontWeight: 800, color: tk.tTitle, lineHeight: 1.2 }}
          >
            {t('planner.config.title')}
          </Typography>
          <Typography sx={{ fontSize: 13.5, color: tk.muted, mt: '2px' }}>
            {t('planner.config.subtitle')}
          </Typography>
        </Box>
        <IconButton
          aria-label={t('planner.config.close')}
          onClick={onCancel}
          size="small"
          sx={{ color: tk.muted }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* DIMENSIONS */}
      <Box sx={{ mb: 3 }}>
        <SectionLabel tk={tk}>{t('planner.config.sectionDimensions')}</SectionLabel>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-end' }}>
          <Box>
            <FieldLabel tk={tk}>{t('planner.setup.columns')}</FieldLabel>
            <TextField
              type="number"
              size="small"
              value={cols}
              onChange={(e) =>
                setCols(Math.max(2, Math.min(50, Number(e.target.value) || 2)))
              }
              inputProps={{ min: 2, max: 50, 'aria-label': t('planner.setup.columns') }}
              sx={{ width: 110, ...inputSx }}
            />
          </Box>
          <Box>
            <FieldLabel tk={tk}>{t('planner.setup.rows')}</FieldLabel>
            <TextField
              type="number"
              size="small"
              value={rows}
              onChange={(e) =>
                setRows(Math.max(2, Math.min(50, Number(e.target.value) || 2)))
              }
              inputProps={{ min: 2, max: 50, 'aria-label': t('planner.setup.rows') }}
              sx={{ width: 110, ...inputSx }}
            />
          </Box>
          <Box>
            <FieldLabel tk={tk}>{t('planner.setup.cellSize')}</FieldLabel>
            <Segmented
              tk={tk}
              ariaLabel={t('planner.setup.cellSize')}
              value={cellSize}
              onChange={setCellSize}
              options={CELL_SIZES.map((s) => ({ value: s, label: s }))}
            />
          </Box>
        </Box>
        <Typography sx={{ fontSize: 12.5, color: tk.muted, mt: 1 }}>
          {t('planner.setup.dimensions')}: {realDimensions}
        </Typography>
      </Box>

      {/* ORIENTATION — label + prompt + segmented + note in the LEFT column,
          the compass at the TOP-RIGHT aligned with the label (mockup layout). */}
      <Box sx={{ mb: 3 }}>
        <Box
          sx={{
            display: 'flex',
            gap: '20px',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
          }}
        >
          <Box sx={{ flex: 1, minWidth: 240 }}>
            <SectionLabel tk={tk}>
              {t('planner.config.sectionOrientation')}
            </SectionLabel>
            <Typography sx={{ fontSize: 13.5, color: tk.tMeta, mb: '10px' }}>
              {t('planner.config.orientationPrompt')}
            </Typography>
            <Segmented
              tk={tk}
              ariaLabel={t('planner.config.sectionOrientation')}
              value={orientation}
              onChange={setOrientation}
              options={orientationOptions}
            />
            <Typography sx={{ fontSize: 12, color: tk.muted, mt: '10px', lineHeight: 1.4 }}>
              {t('planner.config.orientationNote')}
            </Typography>
          </Box>
          <Box
            sx={{
              width: 104,
              height: 104,
              borderRadius: '50%',
              bgcolor: tk.searchBg,
              border: `1px solid ${tk.inputBd}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <CompassRose
              size={84}
              mode={theme.palette.mode}
              sunArc
              ariaLabel={compassAria}
              labels={{ n: 'N', e: 'E', s: 'S', w: westLabel }}
            />
          </Box>
        </Box>
      </Box>

      {/* Full-width divider — separates the mockup ORIENTATION section from the
          code-only hemisphere/latitude controls (SMA-17 R3 layout). */}
      <Box sx={{ height: '1px', bgcolor: tk.divider, mb: 3 }} />

      {/* Hemisphere + latitude band (engraved SMA-17 amendment, not in the
          mockup): its OWN section below the divider, so it never pushes the
          compass down. MANUAL, OVERRIDABLE estimate — like the future per-cell
          exposure override; the Phase-6 geolocation/weather API will PRE-FILL
          both from the user's real latitude WITHOUT changing the stored contract
          or the downstream engine (an "auto-filled from my location" mode slots
          in later with no refactor). */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <Box>
            <FieldLabel tk={tk}>{t('planner.config.hemisphere')}</FieldLabel>
            <Segmented
              tk={tk}
              ariaLabel={t('planner.config.hemisphere')}
              value={hemisphere}
              onChange={setHemisphere}
              options={[
                { value: 'N', label: 'N', ariaLabel: t('planner.config.hemisphereNorth') },
                { value: 'S', label: 'S', ariaLabel: t('planner.config.hemisphereSouth') },
              ]}
            />
            <Typography sx={{ fontSize: 11.5, color: tk.muted, mt: '6px', maxWidth: 240 }}>
              {t('planner.config.hemisphereHelp')}
            </Typography>
          </Box>
          <Box>
            <FieldLabel tk={tk}>{t('planner.config.latitudeBand')}</FieldLabel>
            <Segmented
              tk={tk}
              ariaLabel={t('planner.config.latitudeBand')}
              value={latitudeBand}
              onChange={setLatitudeBand}
              options={[
                { value: 'low', label: t('planner.config.latitudeLow') },
                { value: 'mid', label: t('planner.config.latitudeMid') },
                { value: 'high', label: t('planner.config.latitudeHigh') },
              ]}
            />
            <Typography sx={{ fontSize: 11.5, color: tk.muted, mt: '6px', maxWidth: 240 }}>
              {t('planner.config.latitudeBandHelp')}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* GARDEN TYPE */}
      <Box sx={{ mb: isIndoor ? 2 : 3 }}>
        <SectionLabel tk={tk}>{t('planner.config.sectionGardenType')}</SectionLabel>
        <Box
          role="radiogroup"
          aria-label={t('planner.config.sectionGardenType')}
          sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}
        >
          {GARDEN_TYPES.map(({ value, Icon }) => {
            const active = gardenType === value;
            return (
              <Box
                key={value}
                component="button"
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setGardenType(value)}
                sx={{
                  cursor: 'pointer',
                  width: 104,
                  py: 1.5,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 0.5,
                  borderRadius: '10px',
                  bgcolor: active ? tk.typeSelBg : 'transparent',
                  border: active
                    ? `2px solid ${tk.prim}`
                    : `1px solid ${tk.inputBd}`,
                  // Keep the box size stable between the 1px and 2px borders.
                  p: active ? '11px 0' : '12px 1px',
                  color: active ? tk.prim : tk.tMeta,
                  fontFamily: 'inherit',
                  transition: 'background-color .15s, border-color .15s, color .15s',
                }}
              >
                <Icon sx={{ color: active ? tk.prim : tk.muted }} />
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'inherit' }}>
                  {t(`planner.config.type.${value}`)}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* lightSchedule (indoor only) */}
      {isIndoor && (
        <Box
          sx={{
            mb: 3,
            p: 2,
            borderRadius: '10px',
            bgcolor: tk.zoneABg,
            border: `1px solid ${tk.zoneABd}`,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <LightbulbOutlinedIcon sx={{ color: tk.expoIcc, fontSize: 20 }} />
            <Typography sx={{ fontSize: 14, fontWeight: 700, color: tk.tTitle }}>
              {t('planner.config.lightTitle')}
            </Typography>
          </Box>
          <Typography sx={{ fontSize: 12.5, color: tk.muted, mb: 1.5 }}>
            {t('planner.config.lightSubtitle')}
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {lightSlots.map((slot, index) => (
              <Box
                key={index}
                sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}
              >
                <TextField
                  type="time"
                  size="small"
                  value={slot.start}
                  onChange={(e) => updateSlot(index, { start: e.target.value })}
                  inputProps={{ 'aria-label': `${t('planner.config.slotStart')} ${index + 1}` }}
                  sx={{ width: 120, ...inputSx }}
                />
                <Box component="span" sx={{ color: tk.muted }}>
                  →
                </Box>
                <TextField
                  type="time"
                  size="small"
                  value={slot.end}
                  onChange={(e) => updateSlot(index, { end: e.target.value })}
                  inputProps={{ 'aria-label': `${t('planner.config.slotEnd')} ${index + 1}` }}
                  sx={{ width: 120, ...inputSx }}
                />
                <Box
                  sx={{
                    px: 1,
                    py: '2px',
                    borderRadius: '999px',
                    bgcolor: tk.segBg,
                    color: tk.tMeta,
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {t('planner.config.slotDuration', {
                    hours: formatHours(slotHours(slot)),
                  })}
                </Box>
                <IconButton
                  size="small"
                  aria-label={`${t('planner.config.removeSlot')} ${index + 1}`}
                  onClick={() => removeSlot(index)}
                  sx={{ color: tk.muted }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
          </Box>

          <Button
            startIcon={<AddCircleOutlineIcon />}
            onClick={addSlot}
            disabled={lightSlots.length >= MAX_LIGHT_SLOTS}
            sx={{ mt: 1, color: tk.prim, textTransform: 'none' }}
          >
            {t('planner.config.addSlot')}
          </Button>

          <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: tk.tMeta, mt: 1 }}>
            {t('planner.config.lightTotal', { hours: formatHours(totalLightHours) })}
          </Typography>
        </Box>
      )}

      {/* Persist failure (parent keeps the dialog open with values intact) */}
      {errorText && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {errorText}
        </Alert>
      )}

      {/* Footer */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, mt: 1 }}>
        <Button
          variant="outlined"
          onClick={onCancel}
          disabled={busy}
          sx={{
            textTransform: 'none',
            color: tk.obtnTx,
            borderColor: tk.obtnBd,
            '&:hover': { borderColor: tk.obtnBd },
          }}
        >
          {t('planner.config.cancel')}
        </Button>
        <Button
          variant="contained"
          startIcon={
            busy ? <CircularProgress size={18} color="inherit" /> : <CheckIcon />
          }
          onClick={handleConfirm}
          disabled={busy || hasInvalidLightSlot}
          sx={{ textTransform: 'none', bgcolor: tk.prim, '&:hover': { bgcolor: tk.prim } }}
        >
          {t('planner.config.save')}
        </Button>
      </Box>
    </Box>
  );
}

/**
 * "Configurer le jardin" dialog (SMA-17, tokens §12). 620px, both themes,
 * carrying dimensions AND the exposure config in one save. The inner component
 * remounts on every open so its local state re-seeds from the loaded garden —
 * config is garden-resource state, not reducer grid geometry (#170).
 */
export default function GardenConfigDialog({ open, ...rest }: Props) {
  const theme = useTheme();
  const tk = getPlannerTokens(theme.palette.mode);
  return (
    <Dialog
      open={open}
      onClose={rest.onCancel}
      maxWidth={false}
      slotProps={{
        backdrop: { sx: { bgcolor: tk.scrim } },
        paper: {
          sx: {
            width: '620px',
            maxWidth: '100%',
            m: 2,
            mt: '64px',
            borderRadius: '14px',
            boxShadow: '0 30px 80px rgba(0,0,0,0.4)',
            bgcolor: tk.card,
            // Kill MUI's dark-mode elevation overlay (a lightening gradient on
            // Paper) so the box is EXACTLY tk.card (#16294A at night) instead of
            // washed-out (SMA-17 R3 fidelity).
            backgroundImage: 'none',
          },
        },
      }}
      sx={{ '& .MuiDialog-container': { alignItems: 'flex-start' } }}
    >
      {open && <GardenConfigDialogInner {...rest} />}
    </Dialog>
  );
}
