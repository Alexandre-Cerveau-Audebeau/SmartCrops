import { memo, useId } from 'react';
import { createPortal } from 'react-dom';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { visuallyHidden } from '@mui/utils';
import { useTranslation } from 'react-i18next';
import { Sym } from '../Sym';

const A = 'plantDetail.aiAssistant';

/**
 * Floating AI-assistant teaser for Plant Detail (SMA-247) — mobile only. A pinned
 * pill that previews an upcoming AI feature: a purely informative `role="note"`
 * (NOT a button — a native button with `aria-disabled` stays focusable/activatable,
 * a dead control for keyboard users) tagged with a "soon" badge. Rendered only
 * below `md`; returns null on desktop. All colours come from theme tokens —
 * `secondary` is the page's "coming-backend" blue, `warning` the amber badge — so
 * dark mode is automatic. It sits at `zIndex.fab`, below the navbar / drawer /
 * lightbox overlays.
 */
export const AiAssistantFab = memo(function AiAssistantFab() {
  const { t } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const labelId = useId();
  if (!isMobile) return null;

  // Portalled to <body> so it escapes the `overflow: clip` on <main> (SMA-247):
  // clip on an ancestor breaks a fixed element's paint in Chrome, so the FAB must
  // not live inside the clipped page content.
  return createPortal(
    <Box
      role="note"
      // aria-labelledby (referencing real DOM text) is announced more reliably on
      // role="note" than aria-label across JAWS/NVDA (SMA-247 CR round 2).
      aria-labelledby={labelId}
      sx={{
        position: 'fixed',
        // SMA-248 — bottom slot of the FAB column; the global back-to-top arrow
        // sits above it (BackToTop bottom {xs:76}). Same right edge, so the two
        // stack cleanly without overlapping. zIndex.fab (< drawer 1200) keeps it
        // under the open navigation drawer.
        right: { xs: 16, sm: 24 },
        bottom: { xs: 16, sm: 24 },
        zIndex: theme.zIndex.fab,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        px: '16px',
        py: '10px',
        border: 'none',
        borderRadius: '999px',
        bgcolor: 'secondary.main',
        color: 'secondary.contrastText',
        boxShadow: 3,
        cursor: 'default',
        opacity: 0.92,
        fontFamily: 'inherit',
        fontSize: 14,
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      {/* Accessible name for the note, kept in the DOM (visually hidden) so
          aria-labelledby resolves to real text rather than an attribute. */}
      <Box component="span" id={labelId} sx={visuallyHidden}>
        {t(`${A}.ariaLabel`)}
      </Box>
      <Sym name="auto_awesome" size={20} color="inherit" />
      {t(`${A}.label`)}
      <Box
        component="span"
        sx={{
          ml: '2px',
          px: '7px',
          py: '3px',
          borderRadius: '999px',
          bgcolor: 'warning.main',
          color: 'warning.contrastText',
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          lineHeight: 1,
        }}
      >
        {t(`${A}.comingSoon`)}
      </Box>
    </Box>,
    document.body
  );
});
