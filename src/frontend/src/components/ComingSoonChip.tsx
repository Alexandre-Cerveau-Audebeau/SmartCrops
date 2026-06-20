import Chip from '@mui/material/Chip';
import { alpha, useTheme } from '@mui/material/styles';
import type { SxProps, Theme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { TERRACOTTA } from '../constants/colors';
import { adaptBadge } from '../utils/badgeColors';

interface ComingSoonChipProps {
  /** i18n key for the label; defaults to the shared "coming soon" string. */
  labelKey?: string;
  size?: 'small' | 'medium';
  sx?: SxProps<Theme>;
}

/**
 * SMA-36: terracotta "Coming Soon" badge used on About (Intelligence pillar)
 * and Contact (API card, FAQ/Help links). Distinct terracotta (#A0522D) per the
 * design tokens — separate from the amber `color="warning"` chips on Home.
 */
export default function ComingSoonChip({
  labelKey = 'common.comingSoon',
  size = 'small',
  sx,
}: ComingSoonChipProps) {
  const { t } = useTranslation();
  const b = adaptBadge(
    {
      bg: alpha(TERRACOTTA, 0.12),
      fg: TERRACOTTA,
      border: alpha(TERRACOTTA, 0.35),
    },
    useTheme().palette.mode
  );
  return (
    <Chip
      label={t(labelKey)}
      size={size}
      sx={{
        bgcolor: b.bg,
        color: b.fg,
        fontWeight: 600,
        border: `1px solid ${b.border}`,
        ...sx,
      }}
    />
  );
}
