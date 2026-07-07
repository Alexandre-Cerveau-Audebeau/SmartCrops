import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Slider from '@mui/material/Slider';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import ComingSoonChip from '../ComingSoonChip';
import {
  formatRangeValue,
  rangeLabelParts,
  rangeToSlider,
  sliderDomain,
  sliderToFilterValue,
  sliderToRange,
} from '../../constants/facetVocabularies';
import type {
  BooleanFacetConfig,
  EnumFacetConfig,
  RangeFacetConfig,
} from '../../constants/facetVocabularies';
import { useUnitSystem } from '../../hooks/useUnitSystem';
import type {
  ArrayFilterKey,
  BooleanFilterKey,
  PlantFinderFilters,
  RangeBounds,
  RangeFilterKey,
} from '../../hooks/usePlantFinder';
import type { FacetFieldCounts } from '../../services/plantApi';
import type { PlantType } from '../../types/PlantType';

// SMA-9 T2 — the Library filter panel, per the validated mockups: a ~300px
// left rail on desktop, a full-screen drawer on mobile. Pure presentation —
// all state (filters, open) and fetching live in the caller; filters apply
// LIVE on every toggle (no Apply step), the drawer's footer button only
// closes.

/** Rail width from the mockups (~300px). */
const RAIL_WIDTH = 300;

export interface FilterPanelProps {
  open: boolean;
  /** Closes the panel (header X in both variants; also the drawer footer). */
  onClose: () => void;
  plantTypes: PlantType[];
  /** Enum facet configs in display order (ENUM_FACETS; injected for testability). */
  vocabularies: EnumFacetConfig[];
  /** Boolean facet configs in display order (BOOLEAN_FACETS; injected like
   * `vocabularies`). */
  booleanFacets: BooleanFacetConfig[];
  /** Range slider configs in display order (RANGE_FACETS; injected like
   * `vocabularies`). */
  rangeFacets: RangeFacetConfig[];
  facetCounts: FacetFieldCounts[];
  /**
   * Unfiltered-catalogue distribution (usePlantFinder.catalogFacetCounts) —
   * a value's count here is the largest it can ever show, so chip ghost
   * widths derive from it and live count swaps cause zero layout shift.
   */
  catalogFacetCounts: FacetFieldCounts[];
  /** Whole-catalogue total — the header pill's ghost width. */
  catalogTotal: number;
  filters: PlantFinderFilters;
  /**
   * Toggles a chip's wire values ATOMICALLY: all added, or all removed when
   * every one is already selected (grouped chips like "Vivace" carry several).
   */
  onToggleValues: (
    field: ArrayFilterKey,
    wireValues: Array<string | number>
  ) => void;
  /** Flips one boolean (checkbox) filter. */
  onToggleBoolean: (field: BooleanFilterKey) => void;
  /** Commits one slider selection (null = back to the full track). */
  onSetRange: (field: RangeFilterKey, range: RangeBounds | null) => void;
  onReset: () => void;
  /** Live result total — header pill and the drawer's "See the N plants". */
  found: number;
  variant: 'rail' | 'drawer';
}

/**
 * Two-layer label that freezes its width at the widest text it can ever
 * show: a hidden ghost reserves the geometry, the visible layer swaps
 * freely on top (live counts shrink under filters — 173 → 89 → gone — and
 * must not re-wrap the rail). tabular-nums keeps digit widths uniform.
 */
function GhostSizedLabel({
  ghost,
  visible,
  align = 'center',
}: {
  ghost: string;
  visible: string;
  /** 'center' inside a pill/chip; 'left' in a flow-text spot (checkbox rows). */
  align?: 'center' | 'left';
}) {
  return (
    <Box
      component="span"
      sx={{
        position: 'relative',
        display: 'inline-block',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <Box component="span" aria-hidden="true" sx={{ visibility: 'hidden' }}>
        {ghost}
      </Box>
      <Box
        component="span"
        sx={{ position: 'absolute', inset: 0, textAlign: align }}
      >
        {visible}
      </Box>
    </Box>
  );
}

/**
 * A facet value pill. Count comes from facetCounts when at least one of the
 * chip's wire values is present in the current distribution (grouped chips
 * sum theirs); a value with no count keeps its label and STAYS clickable —
 * the brief's "everything shown" rule (never hide, never disable). Selected =
 * filled primary, unselected = outlined. The width is ghost-frozen on
 * maxCount (the value's unfiltered-catalogue count — its natural maximum) so
 * live count changes never shift the layout.
 */
function FacetChip({
  label,
  count,
  maxCount,
  selected,
  onClick,
}: {
  label: string;
  count: number | undefined;
  maxCount: number | undefined;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <Chip
      label={
        <GhostSizedLabel
          ghost={maxCount === undefined ? label : `${label} (${maxCount})`}
          visible={count === undefined ? label : `${label} (${count})`}
        />
      }
      color={selected ? 'primary' : 'default'}
      variant={selected ? 'filled' : 'outlined'}
      onClick={onClick}
      aria-pressed={selected}
      sx={{ borderRadius: 999 }}
    />
  );
}

/**
 * A hero boolean checkbox row (SMA-9 T3): checkbox + counted label +
 * optional caption. Same count rules as FacetChip — live count from
 * facetCounts, ghost width frozen on the catalogue maximum, count-less
 * stays clickable — but left-aligned (flow text, not a pill). The caption
 * sits OUTSIDE the label element so the checkbox's accessible name stays
 * "Label (N)"; label association is native (htmlFor/id).
 */
function BooleanFacetRow({
  id,
  label,
  caption,
  count,
  maxCount,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  caption?: string;
  count: number | undefined;
  maxCount: number | undefined;
  checked: boolean;
  onChange: () => void;
}) {
  const captionId = caption ? `${id}-caption` : undefined;
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 1.25 }}>
      <Checkbox
        id={id}
        size="small"
        checked={checked}
        onChange={onChange}
        // The caption is real semantics for AT, not just adjacent text.
        // slotProps.input: the description must sit on the <input> (the
        // element carrying the checkbox role) — a root-level prop lands on
        // MUI's wrapper span, invisible to the accessibility tree.
        slotProps={{ input: { 'aria-describedby': captionId } }}
        // Padding buys back a tappable hit area; the negative margin cancels
        // it out of the layout so the caption still aligns flush under the
        // label text with a plain margin.
        sx={{ p: 0.5, m: -0.5, mr: 0.5 }}
      />
      <Box>
        <Typography
          component="label"
          htmlFor={id}
          variant="body2"
          sx={{ cursor: 'pointer', display: 'inline-block' }}
        >
          <GhostSizedLabel
            align="left"
            ghost={maxCount === undefined ? label : `${label} (${maxCount})`}
            visible={count === undefined ? label : `${label} (${count})`}
          />
        </Typography>
        {caption && (
          <Typography
            id={captionId}
            variant="caption"
            component="p"
            color="text.secondary"
          >
            {caption}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

/**
 * A dual-thumb range slider row (SMA-9 T4): title left, dynamic range label
 * right (rest = the full track, live selection during a drag), slider with
 * per-facet marks, optional caption under. The thumbs track a local draft
 * while dragging — the label follows live — but the selection only COMMITS
 * on release (onChangeCommitted): zero requests mid-drag, then the standard
 * live pipeline (counter, counts, chips) takes over. No ghost sizing: the
 * label has no live count, tabular-nums + nowrap keep it steady.
 */
function RangeFacetRow({
  id,
  title,
  caption,
  domain,
  marks,
  value,
  formatLabel,
  ariaValueText,
  onCommit,
}: {
  id: string;
  title: string;
  caption?: string;
  domain: { min: number; max: number; step: number };
  marks?: Array<{ value: number; label: string }>;
  value: [number, number];
  formatLabel: (value: [number, number]) => string;
  ariaValueText: (position: number) => string;
  onCommit: (value: [number, number]) => void;
}) {
  // Draft = the thumbs during a drag; null between drags so an external
  // reset (chips, Reset) snaps the slider back through the `value` prop.
  const [draft, setDraft] = useState<[number, number] | null>(null);
  const shown = draft ?? value;
  const titleId = `${id}-title`;
  return (
    <Box sx={{ mb: 2.5 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 1,
        }}
      >
        <Typography
          variant="subtitle2"
          component="p"
          id={titleId}
          sx={{ fontWeight: 600 }}
        >
          {title}
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
        >
          {formatLabel(shown)}
        </Typography>
      </Box>
      {/* px buys the outermost mark labels room — they center on the track
          ends and would otherwise clip on the rail edge. */}
      <Box sx={{ px: 1 }}>
        <Slider
          size="small"
          min={domain.min}
          max={domain.max}
          step={domain.step}
          marks={marks}
          value={shown}
          onChange={(_, next) => setDraft(next as [number, number])}
          onChangeCommitted={(_, next) => {
            setDraft(null);
            onCommit(next as [number, number]);
          }}
          valueLabelDisplay="off"
          disableSwap
          aria-labelledby={titleId}
          getAriaValueText={ariaValueText}
          sx={{ '& .MuiSlider-markLabel': { fontSize: 12 } }}
        />
      </Box>
      {caption && (
        <Typography
          variant="caption"
          component="p"
          color="text.secondary"
          sx={{ mt: marks ? 1.5 : 0 }}
        >
          {caption}
        </Typography>
      )}
    </Box>
  );
}

function FacetSection({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: ReactNode;
}) {
  return (
    <Box sx={{ mb: 2.5 }}>
      {/* component="p": MUI maps subtitle2 to <h6> by default, which would
          both skip the page's heading hierarchy and collide with the card
          titles (the suites count h6 as "cards"). */}
      <Typography
        variant="subtitle2"
        component="p"
        sx={{ fontWeight: 600, mb: caption ? 0.25 : 1 }}
      >
        {title}
      </Typography>
      {caption && (
        <Typography
          variant="caption"
          component="p"
          color="text.secondary"
          sx={{ mb: 1 }}
        >
          {caption}
        </Typography>
      )}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>{children}</Box>
    </Box>
  );
}

/** Overline group header ("LA PLANTE" / "CULTURE & ENTRETIEN"). */
function GroupHeader({ label }: { label: string }) {
  return (
    <Typography
      variant="overline"
      component="p"
      color="text.secondary"
      sx={{ mb: 1 }}
    >
      {label}
    </Typography>
  );
}

/**
 * Shared rail/drawer header (mockup): title + live count pill + Reset link +
 * close X. The bottom Reset of the first T2 cut is gone — Reset lives here.
 */
function PanelHeader({
  found,
  catalogTotal,
  onReset,
  onClose,
  titleComponent,
}: {
  found: number;
  catalogTotal: number;
  onReset: () => void;
  onClose: () => void;
  /** 'h2' in the drawer (its modal needs a heading); 'p' in the labeled aside. */
  titleComponent: 'h2' | 'p';
}) {
  const { t } = useTranslation();
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography
        variant="subtitle1"
        component={titleComponent}
        // Stable label target for the drawer's aria-labelledby (unique: only
        // one panel variant renders at a time).
        id="library-filter-panel-title"
        sx={{ fontWeight: 600 }}
      >
        {t('library.filters.title')}
      </Typography>
      <Chip
        size="small"
        color="primary"
        // Ghost-frozen on the catalogue total: shrinking to "6 plants" must
        // not slide the Reset link and the X.
        label={
          <GhostSizedLabel
            ghost={t('library.filters.resultCount', { count: catalogTotal })}
            visible={t('library.filters.resultCount', { count: found })}
          />
        }
      />
      <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Button
          variant="text"
          size="small"
          onClick={onReset}
          sx={{
            textTransform: 'none',
            textDecoration: 'underline',
            '&:hover': { textDecoration: 'underline' },
          }}
        >
          {t('library.filters.reset')}
        </Button>
        <IconButton
          size="small"
          onClick={onClose}
          aria-label={t('common.close')}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
    </Box>
  );
}

/**
 * "Pour moi" block (mockup): tinted container with the future personal
 * filters, disabled until their features land (gardens SMA-256, location /
 * climate SMA-257) — visible as a promise, never interactive.
 */
function ForMeBlock() {
  const { t } = useTranslation();
  return (
    <Box
      sx={{
        bgcolor: (theme) =>
          alpha(
            theme.palette.primary.main,
            theme.palette.mode === 'dark' ? 0.15 : 0.06
          ),
        borderRadius: 2,
        p: 1.5,
        mb: 2.5,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
        <PersonOutlineIcon fontSize="small" />
        <Typography variant="subtitle2" component="p" sx={{ fontWeight: 600 }}>
          {t('library.filters.forMe')}
        </Typography>
      </Box>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 0.5,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          {t('library.filters.myGardens')}
        </Typography>
        <ComingSoonChip labelKey="library.filters.soon" size="small" />
      </Box>
      <TextField
        select
        fullWidth
        size="small"
        disabled
        value="all"
        slotProps={{
          select: { MenuProps: { disableScrollLock: true } },
          htmlInput: { 'aria-label': t('library.filters.myGardens') },
        }}
        sx={{ mb: 1.5 }}
      >
        <MenuItem value="all">{t('library.filters.allMyGardens')}</MenuItem>
      </TextField>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 0.5,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          {t('library.filters.location')}
        </Typography>
        <ComingSoonChip labelKey="library.filters.soon" size="small" />
      </Box>
      <TextField
        fullWidth
        size="small"
        disabled
        placeholder={t('library.filters.locationPlaceholder')}
        slotProps={{
          htmlInput: { 'aria-label': t('library.filters.location') },
        }}
      />
      <Typography
        variant="caption"
        component="p"
        color="text.secondary"
        sx={{ mt: 0.75 }}
      >
        {t('library.filters.locationHint')}
      </Typography>
    </Box>
  );
}

// Representative flower-color swatches for the Coming-soon preview dots —
// pure decoration on a disabled block, not a data vocabulary.
const FLOWER_DOT_COLORS = [
  '#FFFFFF',
  '#F6E05E',
  '#F687B3',
  '#E53E3E',
  '#805AD5',
  '#4299E1',
];

// Month initials of the season preview — identical in French and English
// (J F M A M J J A S O N D), so no i18n key.
const MONTH_INITIALS = [...'JFMAMJJASOND'];

/** One labelled preview row of the Coming-soon block. */
function ComingSoonRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
        {label}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.75 }}>
        {children}
      </Box>
    </Box>
  );
}

/**
 * "Bientôt dans le Finder" (SMA-9 T4 mockup): previews of the facets whose
 * data is not complete enough to filter honestly yet — flower color, habit,
 * bloom/harvest season, ACTUAL soil pH (the shipped slider is watering pH)
 * and light level. Entirely NON-interactive: disabled controls, dimmed,
 * pointer-events off — a promise like the For-me block, never a filter.
 */
function ComingSoonSection() {
  const { t } = useTranslation();
  const base = 'library.filters.comingSoon';
  return (
    <>
      <Divider sx={{ my: 2 }} />
      <Box aria-disabled="true" sx={{ opacity: 0.55, pointerEvents: 'none' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Typography variant="subtitle2" component="p" sx={{ fontWeight: 600 }}>
            {t(`${base}.title`)}
          </Typography>
          <ComingSoonChip labelKey="library.filters.soon" size="small" />
        </Box>
        <Typography
          variant="caption"
          component="p"
          color="text.secondary"
          sx={{ mb: 1.5 }}
        >
          {t(`${base}.caption`)}
        </Typography>

        <ComingSoonRow label={t(`${base}.flowerColor`)}>
          {FLOWER_DOT_COLORS.map((color) => (
            <Box
              key={color}
              sx={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                bgcolor: color,
                border: '1px solid',
                borderColor: 'divider',
              }}
            />
          ))}
        </ComingSoonRow>

        <ComingSoonRow label={t(`${base}.habit`)}>
          {(['habitTree', 'habitShrub', 'habitClimber', 'habitHerbaceous'] as const).map(
            (key) => (
              <Chip
                key={key}
                size="small"
                variant="outlined"
                disabled
                label={t(`${base}.${key}`)}
              />
            )
          )}
        </ComingSoonRow>

        <ComingSoonRow label={t(`${base}.season`)}>
          {MONTH_INITIALS.map((initial, index) => (
            <Button
              // Months repeat their initials (J ×3, M ×2, A ×2) — index keys.
              key={index}
              size="small"
              variant="outlined"
              disabled
              sx={{ minWidth: 26, px: 0, py: 0.25 }}
            >
              {initial}
            </Button>
          ))}
        </ComingSoonRow>

        <Box sx={{ mb: 1.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
            {t(`${base}.soilPh`)}
          </Typography>
          <Box sx={{ px: 1 }}>
            <Slider
              size="small"
              disabled
              value={[5.5, 7.5]}
              min={4}
              max={9}
              step={0.5}
              aria-label={t(`${base}.soilPh`)}
            />
          </Box>
        </Box>

        <ComingSoonRow label={t(`${base}.lightLevel`)}>
          {(['lightLow', 'lightMedium', 'lightHigh'] as const).map((key) => (
            <Chip
              key={key}
              size="small"
              variant="outlined"
              disabled
              label={t(`${base}.${key}`)}
            />
          ))}
        </ComingSoonRow>
      </Box>
    </>
  );
}

export default function FilterPanel({
  open,
  onClose,
  plantTypes,
  vocabularies,
  booleanFacets,
  rangeFacets,
  facetCounts,
  catalogFacetCounts,
  catalogTotal,
  filters,
  onToggleValues,
  onToggleBoolean,
  onSetRange,
  onReset,
  found,
  variant,
}: FilterPanelProps) {
  const { t, i18n } = useTranslation();
  const { system } = useUnitSystem();
  // "Plus de filtres" starts collapsed on every panel open (the rail
  // unmounts on close) — the secondary facets stay out of the first read.
  const [moreOpen, setMoreOpen] = useState(false);

  const countIn = (
    source: FacetFieldCounts[],
    field: string,
    value: string
  ): number | undefined =>
    source
      .find((f) => f.field === field)
      ?.counts.find((c) => c.value === value)?.count;

  // Grouped chips SUM their wire values' counts; all-absent stays count-less.
  const sumIn = (
    source: FacetFieldCounts[],
    field: string,
    wireValues: string[]
  ): number | undefined => {
    const present = wireValues
      .map((v) => countIn(source, field, v))
      .filter((c): c is number => c !== undefined);
    if (present.length === 0) return undefined;
    return present.reduce((a, b) => a + b, 0);
  };

  const renderFacet = (facet: EnumFacetConfig) => (
    <FacetSection
      key={facet.facetField}
      title={t(facet.titleKey)}
      caption={facet.captionKey ? t(facet.captionKey) : undefined}
    >
      {facet.chips.map((chip) => (
        <FacetChip
          key={chip.labelKeySuffix}
          label={t(
            `library.filters.values.${facet.facetField}.${chip.labelKeySuffix}`
          )}
          count={sumIn(facetCounts, facet.facetField, chip.wireValues)}
          maxCount={sumIn(
            catalogFacetCounts,
            facet.facetField,
            chip.wireValues
          )}
          selected={chip.wireValues.every((v) =>
            filters[facet.filterKey].includes(v)
          )}
          onClick={() => onToggleValues(facet.filterKey, chip.wireValues)}
        />
      ))}
    </FacetSection>
  );

  // Live count = the countedValue bucket of the current distribution; ghost
  // width = the same bucket of the unfiltered catalogue. For the inverted
  // safety traits countedValue is 'false' — the count of plants KNOWN safe
  // (the unknown bucket is never counted or rendered).
  const renderBooleanRow = (facet: BooleanFacetConfig) => (
    <BooleanFacetRow
      key={facet.filterKey}
      id={`library-filter-boolean-${facet.filterKey}`}
      label={t(facet.labelKey)}
      caption={facet.captionKey ? t(facet.captionKey) : undefined}
      count={countIn(facetCounts, facet.facetField, facet.countedValue)}
      maxCount={countIn(
        catalogFacetCounts,
        facet.facetField,
        facet.countedValue
      )}
      checked={filters[facet.filterKey]}
      onChange={() => onToggleBoolean(facet.filterKey)}
    />
  );

  // Per-facet slider marks (T4 mockup): the compressed height scale marks
  // every selectable value, hardiness anchors 1/7/13, spacing anchors the cm
  // quarters with the open top; pH and temperature ship bare — their rest
  // label already spells the bounds.
  const marksFor = (facet: RangeFacetConfig) => {
    switch (facet.filterKey) {
      case 'heightCm':
        return (facet.scale ?? []).map((cm, index, scale) => ({
          value: index,
          label:
            index === 0
              ? '0'
              : index === scale.length - 1
                ? t(`${facet.labelKeyBase}.markOpen`)
                : `${formatRangeValue(facet, cm, i18n.language, system)} m`,
        }));
      case 'hardinessZone':
        return [
          { value: 1, label: t(`${facet.labelKeyBase}.markMin`) },
          { value: 7, label: '7' },
          { value: 13, label: t(`${facet.labelKeyBase}.markMax`) },
        ];
      case 'spacingCm':
        return [
          { value: 0, label: '0' },
          { value: 50, label: '50' },
          { value: 100, label: '100' },
          { value: 150, label: t(`${facet.labelKeyBase}.markOpen`) },
        ];
      default:
        return undefined;
    }
  };

  const renderRangeRow = (facet: RangeFacetConfig) => (
    <RangeFacetRow
      key={facet.filterKey}
      id={`library-filter-range-${facet.filterKey}`}
      title={t(facet.titleKey)}
      caption={facet.captionKey ? t(facet.captionKey) : undefined}
      domain={sliderDomain(facet)}
      marks={marksFor(facet)}
      value={rangeToSlider(facet, filters[facet.filterKey])}
      formatLabel={(value) => {
        const parts = rangeLabelParts(facet, value, i18n.language, system);
        return t(
          `${facet.labelKeyBase}.${parts.open ? 'labelOpen' : 'label'}`,
          { ...parts }
        );
      }}
      ariaValueText={(position) =>
        formatRangeValue(
          facet,
          sliderToFilterValue(facet, position),
          i18n.language,
          system
        )
      }
      onCommit={(value) => onSetRange(facet.filterKey, sliderToRange(facet, value))}
    />
  );

  const traitFacets = booleanFacets.filter((b) => b.group === 'traits');
  const moreRangeFacets = rangeFacets.filter((f) => f.group === 'more');
  // N = the number of controls inside the collapsed section (mockup).
  const moreFiltersCount = moreRangeFacets.length + traitFacets.length;

  const content = (
    <>
      <ForMeBlock />

      <Divider sx={{ mb: 2 }} />

      <GroupHeader label={t('library.filters.groupPlant')} />
      <FacetSection title={t('library.filters.plantType')}>
        {plantTypes.map((pt) => (
          <FacetChip
            key={pt.id}
            label={t(`plantTypes.${pt.name}`, pt.name)}
            // Typesense facet values arrive as strings, ids included.
            count={countIn(facetCounts, 'plantTypeId', String(pt.id))}
            maxCount={countIn(
              catalogFacetCounts,
              'plantTypeId',
              String(pt.id)
            )}
            selected={filters.plantTypeIds.includes(pt.id)}
            onClick={() => onToggleValues('plantTypeIds', [pt.id])}
          />
        ))}
      </FacetSection>
      {vocabularies.filter((f) => f.group === 'plant').map(renderFacet)}
      {/* Hauteur — right after Vitesse de croissance (mockup). */}
      {rangeFacets.filter((f) => f.group === 'plant').map(renderRangeRow)}

      <GroupHeader label={t('library.filters.groupCare')} />
      {vocabularies.filter((f) => f.group === 'care').map(renderFacet)}
      <Box sx={{ mb: 2.5 }}>
        {booleanFacets.filter((b) => b.group === 'care').map(renderBooleanRow)}
      </Box>
      {/* Résiste au froid — after the two care checkboxes, before SÉCURITÉ
          & USAGE (mockup). */}
      {rangeFacets.filter((f) => f.group === 'care').map(renderRangeRow)}

      <GroupHeader label={t('library.filters.groupSafety')} />
      {booleanFacets.filter((b) => b.group === 'safety').map(renderBooleanRow)}

      {/* ── Plus de filtres (T4): collapsible tail for the secondary sliders
          and the bonus traits — collapsed by default, the hint line lists
          what's inside while closed. */}
      <Divider sx={{ mb: 0.5 }} />
      <Button
        fullWidth
        variant="text"
        onClick={() => setMoreOpen((wasOpen) => !wasOpen)}
        aria-expanded={moreOpen}
        aria-controls="library-filter-more"
        endIcon={
          <ExpandMoreIcon
            sx={{
              transform: moreOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform 150ms',
            }}
          />
        }
        sx={{
          justifyContent: 'space-between',
          textTransform: 'none',
          px: 0,
          color: 'text.primary',
        }}
      >
        <Typography variant="overline" component="span" sx={{ fontWeight: 600 }}>
          {t('library.filters.moreFilters', { count: moreFiltersCount })}
        </Typography>
      </Button>
      {!moreOpen && (
        <Typography variant="caption" component="p" color="text.secondary">
          {t('library.filters.moreFiltersHint')}
        </Typography>
      )}
      {/* unmountOnExit: the collapsed controls leave the tree entirely —
          nothing focusable or queryable while closed. */}
      <Collapse in={moreOpen} id="library-filter-more" unmountOnExit>
        <Box sx={{ pt: 1.5 }}>
          {moreRangeFacets.map(renderRangeRow)}
          <Typography
            variant="subtitle2"
            component="p"
            sx={{ fontWeight: 600, mb: 1 }}
          >
            {t('library.filters.otherTraits')}
          </Typography>
          {traitFacets.map(renderBooleanRow)}
        </Box>
      </Collapse>

      <ComingSoonSection />
    </>
  );

  if (variant === 'rail') {
    if (!open) return null;
    return (
      <Box
        component="aside"
        id="library-filter-panel"
        aria-label={t('library.filters.title')}
        sx={{
          width: RAIL_WIDTH,
          flexShrink: 0,
          alignSelf: 'flex-start',
          // Same-surface card styling as PlantCard (outlined, 12px radius).
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 3,
          bgcolor: 'background.paper',
          p: 2.5,
        }}
      >
        <Box sx={{ mb: 2 }}>
          <PanelHeader
            found={found}
            catalogTotal={catalogTotal}
            onReset={onReset}
            onClose={onClose}
            titleComponent="p"
          />
        </Box>
        {content}
      </Box>
    );
  }

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      // Scroll lock opt-out per the project overlay rule (stable gutter).
      ModalProps={{ disableScrollLock: true }}
      // The id the Filters toggle button's aria-controls points at (the rail
      // aside carries the same id — only one variant renders at a time).
      // role/aria-modal/aria-labelledby live on the Paper: MUI's Modal root
      // is role="presentation", so the Paper is the drawer's dialog surface
      // and the title is its accessible name.
      slotProps={{
        paper: {
          id: 'library-filter-panel',
          role: 'dialog',
          'aria-modal': true,
          'aria-labelledby': 'library-filter-panel-title',
          sx: { width: '100%' },
        },
      }}
    >
      <Box
        sx={{
          px: 2.5,
          py: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <PanelHeader
          found={found}
          catalogTotal={catalogTotal}
          onReset={onReset}
          onClose={onClose}
          titleComponent="h2"
        />
      </Box>
      <Box sx={{ flex: 1, overflowY: 'auto', p: 2.5 }}>{content}</Box>
      {/* Sticky apply-less footer: filters are already live while the drawer
          is open — the primary button only closes (Reset lives in the header,
          matching the mockup). */}
      <Box
        sx={{
          p: 2,
          borderTop: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Button fullWidth variant="contained" onClick={onClose}>
          {t('library.filters.seeResults', { count: found })}
        </Button>
      </Box>
    </Drawer>
  );
}
