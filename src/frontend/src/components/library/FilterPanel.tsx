import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import ComingSoonChip from '../ComingSoonChip';
import type { EnumFacetConfig } from '../../constants/facetVocabularies';
import type { PlantFinderFilters } from '../../hooks/usePlantFinder';
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
  /** Closes the mobile drawer (header X and footer button; no-op for the rail). */
  onClose: () => void;
  plantTypes: PlantType[];
  /** Enum facet configs in display order (ENUM_FACETS; injected for testability). */
  vocabularies: EnumFacetConfig[];
  facetCounts: FacetFieldCounts[];
  filters: PlantFinderFilters;
  onToggleValue: (field: keyof PlantFinderFilters, value: string | number) => void;
  onReset: () => void;
  /** Live result total — drives the drawer's "See the N plants" button. */
  found: number;
  variant: 'rail' | 'drawer';
}

/**
 * A facet value pill. Count comes from facetCounts when the value is present
 * in the current distribution; a value with no count keeps its label and
 * STAYS clickable — the brief's "everything shown" rule (never hide, never
 * disable). Selected = filled primary, unselected = outlined.
 */
function FacetChip({
  label,
  count,
  selected,
  onClick,
}: {
  label: string;
  count: number | undefined;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <Chip
      label={count === undefined ? label : `${label} (${count})`}
      color={selected ? 'primary' : 'default'}
      variant={selected ? 'filled' : 'outlined'}
      onClick={onClick}
      sx={{ borderRadius: 999 }}
    />
  );
}

function FacetSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box sx={{ mb: 2.5 }}>
      {/* component="p": MUI maps subtitle2 to <h6> by default, which would
          both skip the page's heading hierarchy and collide with the card
          titles (the suites count h6 as "cards"). */}
      <Typography variant="subtitle2" component="p" sx={{ fontWeight: 600, mb: 1 }}>
        {title}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>{children}</Box>
    </Box>
  );
}

/** A greyed-out, non-interactive "For me" row with the terracotta Soon pill. */
function SoonRow({ label }: { label: string }) {
  return (
    <Box
      aria-disabled="true"
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        py: 0.75,
        color: 'text.disabled',
      }}
    >
      <Typography variant="body2">{label}</Typography>
      <ComingSoonChip labelKey="library.filters.soon" size="small" />
    </Box>
  );
}

export default function FilterPanel({
  open,
  onClose,
  plantTypes,
  vocabularies,
  facetCounts,
  filters,
  onToggleValue,
  onReset,
  found,
  variant,
}: FilterPanelProps) {
  const { t } = useTranslation();

  const countFor = (field: string, value: string): number | undefined =>
    facetCounts
      .find((f) => f.field === field)
      ?.counts.find((c) => c.value === value)?.count;

  const content = (
    <>
      <Box sx={{ mb: 2 }}>
        <Typography
          variant="subtitle2"
          component="p"
          sx={{ fontWeight: 600, mb: 0.5 }}
        >
          {t('library.filters.forMe')}
        </Typography>
        <SoonRow label={t('library.filters.myGardens')} />
        <SoonRow label={t('library.filters.location')} />
      </Box>

      <Divider sx={{ mb: 2.5 }} />

      <FacetSection title={t('library.filters.plantType')}>
        {plantTypes.map((pt) => (
          <FacetChip
            key={pt.id}
            label={t(`plantTypes.${pt.name}`, pt.name)}
            // Typesense facet values arrive as strings, ids included.
            count={countFor('plantTypeId', String(pt.id))}
            selected={filters.plantTypeIds.includes(pt.id)}
            onClick={() => onToggleValue('plantTypeIds', pt.id)}
          />
        ))}
      </FacetSection>

      {vocabularies.map((facet) => (
        <FacetSection key={facet.facetField} title={t(facet.titleKey)}>
          {facet.values.map((value) => (
            <FacetChip
              key={value}
              label={t(`library.filters.values.${facet.facetField}.${value}`)}
              count={countFor(facet.facetField, value)}
              selected={filters[facet.filterKey].includes(value)}
              onClick={() => onToggleValue(facet.filterKey, value)}
            />
          ))}
        </FacetSection>
      ))}
    </>
  );

  if (variant === 'rail') {
    if (!open) return null;
    return (
      <Box
        component="aside"
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
        {content}
        <Button variant="text" onClick={onReset} sx={{ mt: 1 }}>
          {t('library.filters.reset')}
        </Button>
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
      PaperProps={{ sx: { width: '100%' } }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2.5,
          py: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography variant="h6" component="h2">
          {t('library.filters.title')}
        </Typography>
        <IconButton onClick={onClose} aria-label={t('common.close')}>
          <CloseIcon />
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, overflowY: 'auto', p: 2.5 }}>{content}</Box>
      {/* Sticky apply-less footer: filters are already live while the drawer
          is open — the primary button only closes. */}
      <Box
        sx={{
          p: 2,
          borderTop: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
        }}
      >
        <Button fullWidth variant="contained" onClick={onClose}>
          {t('library.filters.seeResults', { count: found })}
        </Button>
        <Button fullWidth variant="text" onClick={onReset}>
          {t('library.filters.reset')}
        </Button>
      </Box>
    </Drawer>
  );
}
