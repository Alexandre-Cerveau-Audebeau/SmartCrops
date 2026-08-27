import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
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
import PasswordField from '../components/PasswordField';
import { useAuth } from '../hooks/useAuth';
import { RegisterFailedError } from '../services/authApi';

const API_BASE = import.meta.env.VITE_AUTH_API_URL || 'http://localhost:5000';

/**
 * SMA-350: the Identity codes that name a violated password rule, mapped to the
 * criterion the user has to fix. Listed in the order the bubble states them so
 * a refusal reads in the same order as the promise, whatever order the server
 * happened to return.
 */
const PASSWORD_RULE_KEYS: readonly (readonly [string, string])[] = [
  ['PasswordTooShort', 'auth.passwordRuleLength'],
  ['PasswordRequiresDigit', 'auth.passwordRuleDigit'],
  ['PasswordRequiresLower', 'auth.passwordRuleLower'],
  ['PasswordRequiresUpper', 'auth.passwordRuleUpper'],
  ['PasswordRequiresNonAlphanumeric', 'auth.passwordRuleSpecial'],
];

/** The codes that are about the ADDRESS rather than the password. */
const ACCOUNT_ERROR_KEYS: Record<string, string> = {
  DuplicateUserName: 'auth.registerErrorEmailTaken',
  DuplicateEmail: 'auth.registerErrorEmailTaken',
  InvalidEmail: 'auth.registerErrorInvalidEmail',
  InvalidUserName: 'auth.registerErrorInvalidEmail',
};

/** The account-creation page: email, password with rules bubble, and the Google alternative. */
export default function Register() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  // SMA-350: `rules` is empty for every single-sentence failure — the criteria
  // list is the one case where the Alert carries a heading plus its items.
  const [error, setError] = useState<{
    message: string;
    rules: string[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);

  /**
   * SMA-350: turns the refusal into something the user can act on. The API
   * already named every violated rule; the codes are read here because the
   * descriptions arrive in English and the backend has no localization.
   * Password criteria win over an address complaint when both are present:
   * the password is what the user just composed and can fix in place.
   */
  const describeFailure = (err: unknown): { message: string; rules: string[] } => {
    const codes = err instanceof RegisterFailedError ? err.codes : [];

    const rules = PASSWORD_RULE_KEYS.filter(([code]) => codes.includes(code)).map(
      ([, key]) => t(key)
    );
    if (rules.length > 0) {
      return { message: t('auth.passwordRulesTitle'), rules };
    }

    const accountKey = codes
      .map((code) => ACCOUNT_ERROR_KEYS[code])
      .find((key) => key !== undefined);
    if (accountKey) {
      return { message: t(accountKey), rules: [] };
    }

    // An unrecognised code, an empty list, a network failure: unchanged.
    return { message: t('auth.registerError'), rules: [] };
  };

  /** Checks the two passwords match, then registers and routes the outcome to the Alert. */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError({ message: t('auth.passwordMismatch'), rules: [] });
      return;
    }

    setLoading(true);
    try {
      await register(email, password);
      // SMA-320 R1: no session exists after registration — the account must
      // be confirmed first, so the page shows the notice and routes toward
      // Login instead of navigating into the app.
      setRegistered(true);
    } catch (err) {
      setError(describeFailure(err));
    } finally {
      setLoading(false);
    }
  };

  if (registered) {
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
              {t('auth.register')}
            </Typography>
            <Alert severity="success" sx={{ mb: 2 }}>
              {t('auth.registerSuccessNotice')}
            </Alert>
            <Typography variant="body2" sx={{ textAlign: 'center' }}>
              <Link component={RouterLink} to="/login">
                {t('auth.backToLogin')}
              </Link>
            </Typography>
          </CardContent>
        </Card>
      </Container>
    );
  }

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
            {t('auth.register')}
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error.message}
              {error.rules.length > 0 && (
                <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
                  {error.rules.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </Box>
              )}
            </Alert>
          )}

          <Box
            component="form"
            onSubmit={handleSubmit}
            aria-label={t('auth.register')}
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
            <PasswordField
              label={t('auth.password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              showRules
            />
            <PasswordField
              label={t('auth.confirmPassword')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
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
              {t('auth.registerButton')}
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
            startIcon={<img src="/google-g.svg" alt="" width={20} height={20} />}
            aria-label={t('auth.googleRegister')}
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
