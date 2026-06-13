import Box from '@mui/material/Box';

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
  return (
    <Box
      component="span"
      sx={{
        display: 'inline',
        px: 0.75,
        py: 0.25,
        mx: 0.25,
        borderRadius: 1,
        bgcolor: '#FDF0E7',
        border: '1px solid #F0CDB0',
        color: '#A14E2A',
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
