import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useAuth } from '../hooks/useAuth';
import { EMAIL_NOT_CONFIRMED, resendConfirmation } from '../services/authApi';

const API_BASE = import.meta.env.VITE_AUTH_API_URL || 'http://localhost:5000';

export default function Login() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setUnconfirmed(false);
    setResendSent(false);
    setLoading(true);
    try {
      await login(email, password);
      navigate('/library');
    } catch (err) {
      // SMA-320: the gate's 403 (correct password, unconfirmed address) gets a
      // dedicated message with a resend action; everything else stays generic.
      if (err instanceof Error && err.message === EMAIL_NOT_CONFIRMED) {
        setUnconfirmed(true);
      } else {
        setError(t('auth.loginError'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      await resendConfirmation(email);
    } catch {
      // The endpoint discloses nothing and neither may the UI: an error outcome
      // is indistinguishable from success (same contract as ForgotPassword).
    } finally {
      setResendSent(true);
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
            {t('auth.login')}
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {unconfirmed && !resendSent && (
            <Alert
              severity="warning"
              sx={{ mb: 2 }}
              action={
                <Button color="inherit" size="small" onClick={handleResend}>
                  {t('auth.resendConfirmation')}
                </Button>
              }
            >
              {t('auth.emailNotConfirmed')}
            </Alert>
          )}

          {unconfirmed && resendSent && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {t('auth.resendConfirmationSent')}
            </Alert>
          )}

          <Box
            component="form"
            onSubmit={handleSubmit}
            aria-label={t('auth.login')}
            sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
          >
            <TextField
              label={t('auth.email')}
              type="email"
              required
              fullWidth
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <TextField
              label={t('auth.password')}
              type="password"
              required
              fullWidth
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
              {t('auth.loginButton')}
            </Button>
            <Typography variant="body2" sx={{ textAlign: 'center' }}>
              <Link component={RouterLink} to="/forgot-password">
                {t('auth.forgotPasswordLink')}
              </Link>
            </Typography>
          </Box>

          <Divider sx={{ my: 3 }}>
            <Typography variant="caption" color="text.secondary">
              {t('auth.orDivider')}
            </Typography>
          </Divider>

          <Button
            variant="outlined"
            fullWidth
            aria-label={t('auth.googleLogin')}
            onClick={() => {
              window.location.href = `${API_BASE}/api/auth/google-login`;
            }}
            sx={{
              bgcolor: 'background.paper',
              color: 'text.primary',
              borderColor: 'borderSubtle',
              textTransform: 'none',
              fontWeight: 500,
              '&:hover': {
                bgcolor: 'surfaceSubtle',
                borderColor: 'borderSubtle',
              },
            }}
          >
            {t('auth.googleLogin')}
          </Button>

          <Typography variant="body2" sx={{ mt: 2, textAlign: 'center' }}>
            {t('auth.noAccount')}{' '}
            <Link component={RouterLink} to="/register">
              {t('auth.signUpLink')}
            </Link>
          </Typography>
        </CardContent>
      </Card>
    </Container>
  );
}
