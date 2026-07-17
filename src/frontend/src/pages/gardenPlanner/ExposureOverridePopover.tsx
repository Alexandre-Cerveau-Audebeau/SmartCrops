import { memo, useId } from 'react';
import { useTranslation } from 'react-i18next';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import Popover from '@mui/material/Popover';
import Typography from '@mui/material/Typography';
import { usePlannerTokens } from '../../theme/usePlannerTokens';
import type { ExposureCategory } from '../../utils/exposure';

// Auto (null) first, then the four categories — the engine's aggregate wins
// again once the override is cleared.
const OPTIONS: Array<ExposureCategory | null> = [
  null,
  'full',
  'morning',
  'afternoon',
  'shade',
];

interface ExposureOverridePopoverProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  /** The cell's current override; null = Auto (computed). */
  current: ExposureCategory | null;
  onSelect: (value: ExposureCategory | null) => void;
  onClose: () => void;
}

/**
 * Per-cell exposure override picker (SMA-17 5.3-D): anchored to the clicked
 * cell while the layer is visible in selection mode. Choosing an option
 * dispatches the sparse override (null clears it); Esc / click-away close
 * (Popover's own behavior). Labelled for a11y via the title element.
 */
export const ExposureOverridePopover = memo(function ExposureOverridePopover({
  open,
  anchorEl,
  current,
  onSelect,
  onClose,
}: ExposureOverridePopoverProps) {
  const { t } = useTranslation();
  const tk = usePlannerTokens();
  const titleId = useId();

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      transformOrigin={{ vertical: 'top', horizontal: 'center' }}
      aria-labelledby={titleId}
      slotProps={{
        paper: {
          sx: {
            // backgroundImage: none kills MUI's dark-mode elevation overlay so
            // the §2 card hex renders exactly (same fix as the config dialog).
            bgcolor: tk.card,
            backgroundImage: 'none',
            border: `1px solid ${tk.cardBd}`,
            borderRadius: '10px',
            boxShadow: tk.shadow,
            minWidth: 200,
          },
        },
      }}
    >
      <Typography
        id={titleId}
        component="h3"
        sx={{
          px: '14px',
          pt: '10px',
          pb: '4px',
          fontSize: 13,
          fontWeight: 800,
          color: tk.tTitle,
        }}
      >
        {t('planner.exposure.override.title')}
      </Typography>
      <MenuList dense autoFocusItem={open}>
        {OPTIONS.map((option) => {
          const selected = option === current;
          return (
            <MenuItem
              key={option ?? 'auto'}
              selected={selected}
              onClick={() => onSelect(option)}
              sx={{
                fontSize: 13,
                color: selected ? tk.prim : tk.tMeta,
                fontWeight: selected ? 700 : 500,
              }}
            >
              {option === null
                ? t('planner.exposure.override.auto')
                : t(`planner.exposure.categories.${option}`)}
            </MenuItem>
          );
        })}
      </MenuList>
    </Popover>
  );
});
