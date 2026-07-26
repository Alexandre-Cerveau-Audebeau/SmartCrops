import { useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { confirmEmail } from '../services/authApi';

type ConfirmState = 'processing' | 'success' | 'error';

/**
 * SMA-31: landing page for the confirmation link mailed at registration.
 * Modelled on AuthCallback — read the query string, guard against a double
 * exchange, POST the values back — but it renders its outcome instead of
 * redirecting, because the link is opened from an email client where a silent
 * bounce to /login would read as "nothing happened".
 *
 * The exchange guard is keyed on the { userId, token } pair, not a permanent
 * boolean: a NEW link opened in the same SPA session (the resend case) re-arms
 * the page and exchanges again, while completions from a superseded pair are
 * discarded. The result region is a polite live region so the processing →
 * success/error transition is announced to assistive tech.
 *
 * Routed OUTSIDE GuestRoute: registration leaves the visitor signed in, so a
 * GuestRoute child would bounce the very user who just received the mail.
 */
export default function ConfirmEmail() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();

  const userId = searchParams.get('userId');
  const token = searchParams.get('token');
  const requestKey = userId && token ? `${userId}\n${token}` : null;

  // A truncated link is decided at render time, and a CHANGED pair resets the
  // machine during render (the adjust-during-render pattern) — the effect-body
  // setState alternative trips react-hooks/set-state-in-effect.
  const [renderedKey, setRenderedKey] = useState(requestKey);
  const [state, setState] = useState<ConfirmState>(
    requestKey ? 'processing' : 'error'
  );
  if (renderedKey !== requestKey) {
    setRenderedKey(requestKey);
    setState(requestKey ? 'processing' : 'error');
  }

  const exchanged = useRef<string | null>(null);

  useEffect(() => {
    if (!requestKey || !userId || !token) return;
    if (exchanged.current === requestKey) return;
    exchanged.current = requestKey;

    // The ref comparison drops completions from a superseded pair: once a newer
    // link has re-armed the guard, a late settle from the old exchange must not
    // overwrite the newer pair's state.
    confirmEmail(userId, token)
      .then(() => {
        if (exchanged.current === requestKey) setState('success');
      })
      .catch(() => {
        if (exchanged.current === requestKey) setState('error');
      });
  }, [requestKey, userId, token]);

  return (
    <Container maxWidth="xs" sx={{ pt: 8 }}>
      <Box
        role="status"
        aria-live="polite"
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          py: 8,
        }}
      >
        {state === 'processing' && (
          <>
            <CircularProgress />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              {t('auth.confirmEmailProcessing')}
            </Typography>
          </>
        )}

        {state === 'success' && (
          <>
            <Typography variant="body1" sx={{ mb: 3, textAlign: 'center' }}>
              {t('auth.confirmEmailSuccess')}
            </Typography>
            <Button component={RouterLink} to="/library" variant="contained">
              {t('auth.confirmEmailContinue')}
            </Button>
          </>
        )}

        {state === 'error' && (
          <>
            <Typography
              variant="body1"
              color="error"
              sx={{ mb: 3, textAlign: 'center' }}
            >
              {t('auth.confirmEmailError')}
            </Typography>
            <Button component={RouterLink} to="/login" variant="outlined">
              {t('auth.backToLogin')}
            </Button>
          </>
        )}
      </Box>
    </Container>
  );
}
