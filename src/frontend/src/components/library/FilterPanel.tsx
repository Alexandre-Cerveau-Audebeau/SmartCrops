import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import ComingSoonChip from '../ComingSoonChip';
import type {
  BooleanFacetConfig,
  EnumFacetConfig,
} from '../../constants/facetVocabularies';
import type {
  ArrayFilterKey,
  BooleanFilterKey,
  PlantFinderFilters,
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
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 1.25 }}>
      <Checkbox
        id={id}
        size="small"
        checked={checked}
        onChange={onChange}
        // Zero padding so the caption can align flush under the label text
        // with a plain margin (no theme-dependent ripple-padding math).
        sx={{ p: 0, mr: 1 }}
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
          <Typography variant="caption" component="p" color="text.secondary">
            {caption}
          </Typography>
        )}
      </Box>
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

export default function FilterPanel({
  open,
  onClose,
  plantTypes,
  vocabularies,
  booleanFacets,
  facetCounts,
  catalogFacetCounts,
  catalogTotal,
  filters,
  onToggleValues,
  onToggleBoolean,
  onReset,
  found,
  variant,
}: FilterPanelProps) {
  const { t } = useTranslation();

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

      <GroupHeader label={t('library.filters.groupCare')} />
      {vocabularies.filter((f) => f.group === 'care').map(renderFacet)}
      <Box sx={{ mb: 2.5 }}>
        {booleanFacets.filter((b) => b.group === 'care').map(renderBooleanRow)}
      </Box>

      <GroupHeader label={t('library.filters.groupSafety')} />
      {booleanFacets.filter((b) => b.group === 'safety').map(renderBooleanRow)}
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
