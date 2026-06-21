import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import type { SxProps, Theme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { Sym } from '../Sym';
import { adaptBadge } from '../../utils/badgeColors';

export type StatusVariant = 'build' | 'data' | 'backend';

interface VariantDef {
  bg: string;
  fg: string;
  labelKey:
    | 'plantDetail.buildNowBadge'
    | 'plantDetail.comingSoonDataBadge'
    | 'plantDetail.comingSoonBackendBadge';
}

// Light-tuned palettes per status, matching the Claude Design HTML. Dark is
// derived from `fg` by adaptBadge (SMA-184), so no dark hex is hand-picked.
// 'build' shows a brand-green dot (primary.main, mode-aware); 'data' and
// 'backend' show a Material `schedule` glyph in the badge's own foreground.
const VARIANTS = {
  build: {
    bg: '#E6F4EC',
    fg: '#1B5E3A',
    labelKey: 'plantDetail.buildNowBadge',
  },
  data: {
    bg: '#FBEEE6',
    fg: '#A0522D',
    labelKey: 'plantDetail.comingSoonDataBadge',
  },
  backend: {
    bg: '#EAF0FA',
    fg: '#2C3E6B',
    labelKey: 'plantDetail.comingSoonBackendBadge',
  },
} satisfies Record<StatusVariant, VariantDef>;

interface StatusBadgeProps {
  variant: StatusVariant;
  sx?: SxProps<Theme>;
}

/**
 * Unified Plant Detail v2 status badge (SMA-199), pixel-matched to the Claude
 * Design HTML. Replaces the copy-pasted inline "COMING SOON · DATA" boxes and
 * adds the "BUILD NOW" and "COMING SOON · BACKEND" variants. All three route
 * their {bg, fg} through adaptBadge so light is the flat pastel pill from the
 * design and dark is a tinted, bordered pill that reads on the navy canvas.
 */
export default function StatusBadge({ variant, sx }: StatusBadgeProps) {
  const { t } = useTranslation();
  const mode = useTheme().palette.mode;
  const def = VARIANTS[variant];
  const c = adaptBadge({ bg: def.bg, fg: def.fg }, mode);
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        px: '9px',
        py: '4px',
        bgcolor: c.bg,
        color: c.fg,
        border: '1px solid',
        borderColor: c.border,
        borderRadius: '6px',
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: '0.04em',
        whiteSpace: 'nowrap',
        ...sx,
      }}
    >
      {variant === 'build' ? (
        <Box
          component="span"
          sx={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            bgcolor: 'primary.main',
            flexShrink: 0,
          }}
        />
      ) : (
        <Sym name="schedule" size={13} color={c.fg} />
      )}
      {t(def.labelKey)}
    </Box>
  );
}
