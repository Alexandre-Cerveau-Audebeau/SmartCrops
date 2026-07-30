import { useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Link from '@mui/material/Link';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import {
  RESET_FAILED,
  RESET_RATE_LIMITED,
  resetPassword,
  validateResetToken,
} from '../services/authApi';

type LinkState = 'validating' | 'form' | 'invalid';

/**
 * SMA-323: the target of the reset link mailed by forgot-password. Modelled on
 * Login's form template. A truncated link (missing userId or token) renders the
 * invalid-link state without ever calling the API; a complete link is
 * pre-validated on mount (R1-bis) so an already-dead link — consumed, expired,
 * tampered — never shows the password fields at all. On a refused password the
 * page surfaces the SERVER's IdentityError descriptions (authApi joins them),
 * falling back to the generic message only when no description is available
 * (sentinel) or the rejection is not a server answer (timeout DOMException).
 * A throttled submit — 429, reachable since reset-password joined the
 * "passwordReset" policy (R2) — gets its own message: it is not a dead link.
 * Success links onward to /login.
 *
 * The pre-validation is keyed on the { userId, token } pair with an
 * effect-scoped subscription (the ConfirmEmail engine), so a stale verdict can
 * never overwrite a newer link's state.
 *
 * Routed OUTSIDE GuestRoute, next to /confirm-email: it is reached from an
 * email link, and a still-signed-in visitor must not be bounced to "/".
 */
export default function ResetPassword() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  const userId = searchParams.get('userId');
  const token = searchParams.get('token');
  const requestKey = userId && token ? `${userId}\n${token}` : null;

  // A truncated link is decided at render time, and a CHANGED pair resets the
  // machine during render (the adjust-during-render pattern) — the effect-body
  // setState alternative trips react-hooks/set-state-in-effect.
  const [renderedKey, setRenderedKey] = useState(requestKey);
  const [linkState, setLinkState] = useState<LinkState>(
    requestKey ? 'validating' : 'invalid'
  );
  if (renderedKey !== requestKey) {
    setRenderedKey(requestKey);
    setLinkState(requestKey ? 'validating' : 'invalid');
    setSucceeded(false);
    setError(null);
  }

  const inflight = useRef<{
    key: string;
    promise: Promise<'valid' | 'invalid'>;
  } | null>(null);

  useEffect(() => {
    if (!requestKey || !userId || !token) return;

    // One validation per key: an unchanged key (Strict Mode's double invoke, an
    // unrelated re-render) reuses the in-flight promise instead of re-issuing.
    let entry = inflight.current;
    if (!entry || entry.key !== requestKey) {
      entry = { key: requestKey, promise: validateResetToken(userId, token) };
      inflight.current = entry;
    }

    // Effect-scoped subscription: only the CURRENT effect's verdict may touch
    // state, so a stale validation cannot overwrite a newer link's state.
    let active = true;
    entry.promise
      .then((verdict) => {
        if (active) setLinkState(verdict === 'valid' ? 'form' : 'invalid');
      })
      .catch(() => {
        // Fall through to the form: a network blip or timeout is NOT a dead
        // link, and concluding "invalid" here would strand a user whose link
        // is perfectly good. Only a positive 400 hides the fields — the
        // submit path remains the authority either way.
        if (active) setLinkState('form');
      });

    return () => {
      active = false;
    };
  }, [requestKey, userId, token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmNewPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    if (!userId || !token) return;

    setLoading(true);
    try {
      await resetPassword(userId, token, newPassword);
      setSucceeded(true);
    } catch (err) {
      // A throttled attempt (R2) is classified before anything else: it is
      // neither a dead link nor a server description to surface.
      if (err instanceof Error && err.message === RESET_RATE_LIMITED) {
        setError(t('auth.resetPasswordRateLimited'));
        return;
      }
      // Only a plain Error thrown by authApi carries server descriptions; the
      // no-description sentinel and DOMException rejections (name !== 'Error',
      // e.g. TimeoutError) fall back to the generic message.
      const serverMessage =
        err instanceof Error &&
        err.name === 'Error' &&
        err.message !== RESET_FAILED
          ? err.message
          : null;
      setError(serverMessage ?? t('auth.resetPasswordError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="xs" sx={{ pt: 8 }}>
      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: 4 }}>
          <Typography
            variant="h5"
            fontWeight={700}
            color="primary"
            sx={{ mb: 3, textAlign: 'center' }}
          >
            {t('auth.resetPasswordTitle')}
          </Typography>

          {linkState === 'invalid' ? (
            <>
              <Alert severity="error" sx={{ mb: 3 }}>
                {t('auth.resetPasswordInvalidLink')}
              </Alert>
              <Typography variant="body2" sx={{ textAlign: 'center' }}>
                <Link component={RouterLink} to="/login">
                  {t('auth.backToLogin')}
                </Link>
              </Typography>
            </>
          ) : succeeded ? (
            <>
              <Alert severity="success" role="status" sx={{ mb: 3 }}>
                {t('auth.resetPasswordSuccess')}
              </Alert>
              <Typography variant="body2" sx={{ textAlign: 'center' }}>
                <Link component={RouterLink} to="/login">
                  {t('auth.backToLogin')}
                </Link>
              </Typography>
            </>
          ) : linkState === 'validating' ? (
            <Box
              role="status"
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                py: 4,
              }}
            >
              <CircularProgress />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                {t('auth.resetPasswordValidating')}
              </Typography>
            </Box>
          ) : (
            <>
              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}

              <Box
                component="form"
                onSubmit={handleSubmit}
                aria-label={t('auth.resetPasswordTitle')}
                sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
              >
                <TextField
                  label={t('auth.newPassword')}
                  type="password"
                  required
                  fullWidth
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  helperText={t('auth.passwordRules')}
                />
                <TextField
                  label={t('auth.confirmNewPassword')}
                  type="password"
                  required
                  fullWidth
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                />
                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  disabled={loading}
                  aria-busy={loading}
                  startIcon={
                    loading ? (
                      <CircularProgress
                        size={18}
                        color="inherit"
                        aria-hidden="true"
                      />
                    ) : undefined
                  }
                  sx={{ mt: 1 }}
                >
                  {t('auth.resetPasswordSubmit')}
                </Button>
              </Box>
            </>
          )}
        </CardContent>
      </Card>
    </Container>
  );
}
