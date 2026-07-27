import { useState } from 'react';
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
import { resetPassword } from '../services/authApi';

/**
 * SMA-323: the target of the reset link mailed by forgot-password. Modelled on
 * Login's form template. A truncated link (missing userId or token) renders the
 * invalid-link state without ever calling the API. On a refused password the
 * page surfaces the SERVER's IdentityError descriptions (authApi joins them) so
 * the user learns why, falling back to the generic message only when no
 * description is available (sentinel) or the rejection is not a server answer
 * (timeout DOMException). Success links onward to /login.
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
      // Only a plain Error thrown by authApi carries server descriptions; the
      // no-description sentinel and DOMException rejections (name !== 'Error',
      // e.g. TimeoutError) fall back to the generic message.
      const serverMessage =
        err instanceof Error &&
        err.name === 'Error' &&
        err.message !== 'RESET_FAILED'
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

          {!userId || !token ? (
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
