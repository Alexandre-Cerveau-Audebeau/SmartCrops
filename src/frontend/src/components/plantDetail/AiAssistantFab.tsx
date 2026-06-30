import { memo } from 'react';
import { createPortal } from 'react-dom';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTranslation } from 'react-i18next';
import { Sym } from '../Sym';

const A = 'plantDetail.aiAssistant';

/**
 * Floating AI-assistant button for Plant Detail (SMA-247) — mobile only. A pinned
 * pill that previews an upcoming AI feature: non-interactive (aria-disabled, click
 * prevented) and tagged with a "soon" badge. Rendered only below `md`; returns
 * null on desktop. All colours come from theme tokens — `secondary` is the page's
 * "coming-backend" blue, `warning` the amber badge — so dark mode is automatic. It
 * sits at `zIndex.fab`, below the navbar / drawer / lightbox overlays.
 */
export const AiAssistantFab = memo(function AiAssistantFab() {
  const { t } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  if (!isMobile) return null;

  // Portalled to <body> so it escapes the `overflow: clip` on <main> (SMA-247):
  // clip on an ancestor breaks a fixed element's paint in Chrome, so the FAB must
  // not live inside the clipped page content.
  return createPortal(
    <Box
      component="button"
      type="button"
      aria-disabled={true}
      aria-label={t(`${A}.ariaLabel`)}
      onClick={(e) => e.preventDefault()}
      sx={{
        position: 'fixed',
        // Stacked in the same column as the global back-to-top FAB (BackToTop:
        // right/bottom {xs:16, sm:24}, 40px tall) but 12px above it, so the two
        // never overlap and both stay tappable.
        right: { xs: 16, sm: 24 },
        bottom: { xs: 68, sm: 76 },
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
