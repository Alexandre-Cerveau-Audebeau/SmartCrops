import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import { useDashboardTokens } from '../../theme/useDashboardTokens';

interface Props {
  /** The disc's diameter in px — 34 in an invitation panel, 30 in a list row (the artboards' own two sizes). */
  size?: number;
  /** The glyph's `font-size` in px. */
  iconSize?: number;
  children: ReactNode;
}

/**
 * SMA-336 PR 4a/5 (pre-flight T12) — the soft disc the artboards put before a
 * row or an invitation: `.inv-ic { width: 34px; height: 34px; border-radius:
 * 50%; background: var(--inv-ic-bg); color: var(--prim); display: inline-flex;
 * align-items: center; justify-content: center; flex-shrink: 0 }`, with the
 * 30 px override the list rows carry inline.
 *
 * Three surfaces draw it today — a To-do task, the To-do invitation and a
 * « Ce mois-ci » row — and each had transcribed the same nine declarations.
 * It never shrinks: the sentence beside it wraps instead, which is what the
 * artboard's own `flex-shrink: 0` says.
 *
 * DECORATIVE by construction: the glyph repeats what the sentence beside it
 * already states, so the disc is hidden from assistive technology here rather
 * than at each call site, where forgetting it once would read the icon out a
 * second time.
 */
export default function IconDisc({ size = 30, iconSize = 16, children }: Props) {
  const tk = useDashboardTokens();
  return (
    <Box
      aria-hidden
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tk.invIcBg,
        color: 'primary.main',
        '& .MuiSvgIcon-root': { fontSize: iconSize },
      }}
    >
      {children}
    </Box>
  );
}
