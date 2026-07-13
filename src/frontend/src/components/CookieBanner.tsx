import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import CookieIcon from '@mui/icons-material/Cookie';
import LegalText from './Legal/LegalText';

export const COOKIE_NOTICE_STORAGE_KEY = 'sc_cookie_notice_ack';
// Bumped so the updated wording shows once to users who dismissed v1.
export const COOKIE_NOTICE_ACK_VALUE = 'v2';

function hasAcknowledged(): boolean {
  try {
    return (
      localStorage.getItem(COOKIE_NOTICE_STORAGE_KEY) ===
      COOKIE_NOTICE_ACK_VALUE
    );
  } catch {
    return false;
  }
}

/**
 * SMA-35: variant-A cookie information banner. SmartCrops only uses strictly
 * necessary trackers (CNIL: exempt from consent), so this is a non-blocking,
 * non-modal notice with a single OK button — not a consent banner (variant B
 * stays out of scope until non-essential trackers exist).
 */
export default function CookieBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(() => !hasAcknowledged());

  if (!visible) {
    return null;
  }

  const acknowledge = () => {
    try {
      localStorage.setItem(COOKIE_NOTICE_STORAGE_KEY, COOKIE_NOTICE_ACK_VALUE);
    } catch {
      // localStorage unavailable — the banner will simply show again next load.
    }
    setVisible(false);
  };

  return (
    <Paper
      component="section"
      aria-label={t('cookies.ariaLabel')}
      elevation={6}
      sx={{
        position: 'fixed',
        // 1199 — strictly below MUI drawers (1200) and modals (1300): an
        // informative banner never covers a modal surface (SMA-272: it used
        // to sit at snackbar/1400 and masked the mobile filters Drawer's
        // sticky footer).
        zIndex: (theme) => theme.zIndex.drawer - 1,
        // Below md the banner spans nearly the full width, so it sits above the
        // BackToTop FAB zone (bottom 16/24 + 40px small Fab); from md up the
        // centered 720px banner leaves the bottom-right corner clear.
        bottom: { xs: 72, md: 24 },
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 32px)',
        maxWidth: 720,
        p: { xs: 2, sm: 2.5 },
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 1.5,
      }}
    >
      <CookieIcon
        sx={{ color: 'primary.main', fontSize: 28, flexShrink: 0 }}
        aria-hidden="true"
      />
      <Typography variant="body2" sx={{ flex: '1 1 240px', lineHeight: 1.6 }}>
        <LegalText text={t('cookies.message')} />{' '}
        <Link
          component={RouterLink}
          to="/privacy"
          underline="always"
          sx={{ fontWeight: 600 }}
        >
          {t('cookies.learnMore')}
        </Link>
      </Typography>
      <Button
        variant="contained"
        color="primary"
        onClick={acknowledge}
        sx={{ ml: 'auto', flexShrink: 0 }}
      >
        {t('cookies.ok')}
      </Button>
    </Paper>
  );
}
