import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import type { SxProps, Theme } from '@mui/material/styles';

interface SectionHeaderProps {
  /** Section title, rendered as the h2 (token `heading`, 23px/800). */
  title: ReactNode;
  /** Optional status badge shown on the same line, right of the title. */
  badge?: ReactNode;
  /**
   * Bottom margin of the header row: '16px' when the section body follows
   * directly (e.g. the gallery filmstrip), '4px' when a caption follows.
   */
  mb?: number | string;
  sx?: SxProps<Theme>;
}

/**
 * Shared Plant Detail v2 section header (SMA-198): the h2 title (token-based,
 * so dark-safe) plus an optional trailing StatusBadge on one wrapping flex
 * row, pixel-matched to the Claude Design HTML. Captions and section bodies
 * stay in the owning section; the section's `id`/`scrollMarginTop` stay on
 * its wrapper, not here.
 */
export default function SectionHeader({
  title,
  badge,
  mb = '16px',
  sx,
}: SectionHeaderProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexWrap: 'wrap',
        mb,
        ...sx,
      }}
    >
      <Typography
        component="h2"
        sx={{
          m: 0,
          fontSize: '23px',
          fontWeight: 800,
          color: 'heading',
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </Typography>
      {badge}
    </Box>
  );
}
