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
 * Routed OUTSIDE GuestRoute: registration leaves the visitor signed in, so a
 * GuestRoute child would bounce the very user who just received the mail.
 */
export default function ConfirmEmail() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const processed = useRef(false);

  const userId = searchParams.get('userId');
  const token = searchParams.get('token');

  // A truncated link is decided at render time, not in the effect: setting state
  // synchronously inside an effect body trips react-hooks/set-state-in-effect.
  const [state, setState] = useState<ConfirmState>(
    userId && token ? 'processing' : 'error'
  );

  useEffect(() => {
    if (processed.current) return;
    if (!userId || !token) return;
    processed.current = true;

    confirmEmail(userId, token)
      .then(() => setState('success'))
      .catch(() => setState('error'));
  }, [userId, token]);

  return (
    <Container maxWidth="xs" sx={{ pt: 8 }}>
      <Box
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
