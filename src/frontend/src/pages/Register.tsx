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

const API_BASE = import.meta.env.VITE_AUTH_API_URL || 'http://localhost:5000';

export default function Register() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }

    setLoading(true);
    try {
      await register(email, password);
      navigate('/library');
    } catch {
      setError(t('auth.registerError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="xs" sx={{ pt: 8 }}>
      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" fontWeight={700} color="primary" sx={{ mb: 3, textAlign: 'center' }}>
            {t('auth.register')}
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} aria-label={t('auth.register')} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
            <TextField
              label={t('auth.confirmPassword')}
              type="password"
              required
              fullWidth
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              disabled={loading}
              sx={{ mt: 1 }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : t('auth.registerButton')}
            </Button>
          </Box>

          <Divider sx={{ my: 3 }}>
            <Typography variant="caption" color="text.secondary">
              {t('auth.orDivider')}
            </Typography>
          </Divider>

          <Button
            variant="outlined"
            fullWidth
            aria-label={t('auth.googleRegister')}
            onClick={() => { window.location.href = `${API_BASE}/api/auth/google-login`; }}
            sx={{
              bgcolor: '#fff',
              color: '#444',
              borderColor: '#ddd',
              textTransform: 'none',
              fontWeight: 500,
              '&:hover': { bgcolor: '#f5f5f5', borderColor: '#ccc' },
            }}
          >
            {t('auth.googleRegister')}
          </Button>

          <Typography variant="body2" sx={{ mt: 2, textAlign: 'center' }}>
            {t('auth.hasAccount')}{' '}
            <Link component={RouterLink} to="/login">
              {t('auth.signInLink')}
            </Link>
          </Typography>
        </CardContent>
      </Card>
    </Container>
  );
}
