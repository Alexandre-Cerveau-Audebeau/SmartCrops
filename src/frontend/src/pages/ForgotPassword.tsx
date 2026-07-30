import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { forgotPassword } from '../services/authApi';

/**
 * SMA-323: requests a password-reset email. Modelled on Login's form template.
 * The endpoint answers 202 whether or not the address exists, and this page
 * mirrors that silence: ANY outcome — success, server error, even a network
 * failure — lands on the same neutral confirmation, because differentiating
 * would leak exactly what the backend refuses to disclose.
 */
export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await forgotPassword(email);
    } catch {
      // Deliberately swallowed — see the component docstring.
    } finally {
      setLoading(false);
      setSubmitted(true);
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
            {t('auth.forgotPasswordTitle')}
          </Typography>

          {submitted ? (
            <Alert severity="success" role="status">
              {t('auth.forgotPasswordConfirmation')}
            </Alert>
          ) : (
            <>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mb: 2, textAlign: 'center' }}
              >
                {t('auth.forgotPasswordIntro')}
              </Typography>

              <Box
                component="form"
                onSubmit={handleSubmit}
                aria-label={t('auth.forgotPasswordTitle')}
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
                  {t('auth.forgotPasswordSubmit')}
                </Button>
              </Box>
            </>
          )}
        </CardContent>
      </Card>
    </Container>
  );
}
