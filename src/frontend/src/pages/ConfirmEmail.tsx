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
 * The exchange is tracked per { userId, token } pair (the resend case re-arms
 * and exchanges again; an unchanged pair reuses the in-flight promise, so
 * Strict Mode never double-POSTs), and each effect run subscribes with its own
 * cleanup-cleared flag, so a late completion from a superseded link — including
 * navigation to a truncated one — can never overwrite the current state. The
 * result region is a polite live region so the processing → success/error
 * transition is announced to assistive tech.
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

  const inflight = useRef<{ key: string; promise: Promise<void> } | null>(null);

  useEffect(() => {
    if (!requestKey || !userId || !token) return;

    // One POST per key: an unchanged key (Strict Mode's double invoke, an
    // unrelated re-render) reuses the in-flight promise instead of re-issuing.
    let entry = inflight.current;
    if (!entry || entry.key !== requestKey) {
      entry = { key: requestKey, promise: confirmEmail(userId, token) };
      inflight.current = entry;
    }

    // Effect-scoped subscription (R3): only the CURRENT effect's completion may
    // touch state. A key-in-ref comparison is not enough — navigating to a
    // truncated link bails out before ever writing the ref, so a late settle
    // from the previous link would still pass that guard and overwrite the
    // error screen. The cleanup flag closes that window.
    let active = true;
    entry.promise
      .then(() => {
        if (active) setState('success');
      })
      .catch(() => {
        if (active) setState('error');
      });

    return () => {
      active = false;
    };
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
