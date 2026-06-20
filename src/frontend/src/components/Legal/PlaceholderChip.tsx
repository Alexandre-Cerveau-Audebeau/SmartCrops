import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import { adaptBadge } from '../../utils/badgeColors';

interface PlaceholderChipProps {
  text: string;
}

/**
 * SMA-35: renders a legal-content placeholder marker ([À REMPLIR : …],
 * [À CONFIRMER : …], [OPTION…], [À ACTIVER…]) as an inline monospace chip.
 * Placeholders are visible by design in pre-production; their completion is
 * tracked by SMA-157 (blocking deployment, SMA-41). Markers stay in French on
 * the EN pages — they are internal annotations, not user-facing content.
 */
export default function PlaceholderChip({ text }: PlaceholderChipProps) {
  const b = adaptBadge(
    { bg: '#FDF0E7', fg: '#A14E2A', border: '#F0CDB0' },
    useTheme().palette.mode
  );
  return (
    <Box
      component="span"
      sx={{
        display: 'inline',
        px: 0.75,
        py: 0.25,
        mx: 0.25,
        borderRadius: 1,
        bgcolor: b.bg,
        border: '1px solid',
        borderColor: b.border,
        color: b.fg,
        fontFamily: '"Roboto Mono", Consolas, monospace',
        fontSize: '0.8em',
        fontWeight: 500,
        // Keeps the background/border on every fragment when the chip wraps.
        boxDecorationBreak: 'clone',
        WebkitBoxDecorationBreak: 'clone',
      }}
    >
      {text}
    </Box>
  );
}
