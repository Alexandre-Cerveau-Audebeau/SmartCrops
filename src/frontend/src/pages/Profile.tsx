import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { useAuth } from '../hooks/useAuth';
import { fetchProfile, updateProfile, changePassword } from '../services/profileApi';

export default function Profile() {
  const { t } = useTranslation();
  const { refreshUser } = useAuth();
  const navigate = useNavigate();
  const mountedRef = useRef(true);

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [city, setCity] = useState('');
  const [hasPassword, setHasPassword] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    fetchProfile()
      .then((p) => {
        if (!mountedRef.current) return;
        setEmail(p.email);
        setDisplayName(p.displayName ?? '');
        setFirstName(p.firstName ?? '');
        setLastName(p.lastName ?? '');
        setCity(p.city ?? '');
        setHasPassword(p.hasPassword);
      })
      .catch(() => {
        if (mountedRef.current) setProfileMsg({ type: 'error', text: t('profile.loadError') });
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
    return () => { mountedRef.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    setSaving(true);
    try {
      await updateProfile({
        displayName: displayName || null,
        firstName: firstName || null,
        lastName: lastName || null,
        city: city || null,
      });
      await refreshUser();
      setProfileMsg({ type: 'success', text: t('profile.saveSuccess') });
    } catch {
      setProfileMsg({ type: 'error', text: t('profile.saveError') });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);

    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: t('profile.passwordMismatch') });
      return;
    }

    setChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordMsg({ type: 'success', text: t('profile.passwordSuccess') });
      setTimeout(() => navigate('/login', { replace: true }), 2000);
    } catch (err) {
      setPasswordMsg({ type: 'error', text: err instanceof Error ? err.message : t('profile.passwordError') });
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <Container maxWidth="sm" sx={{ pt: 4, pb: 6 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ pt: 4, pb: 6 }}>
      <Typography variant="h4" fontWeight={700} color="primary" sx={{ mb: 3 }}>
        {t('profile.title')}
      </Typography>

      {/* ── Profile Information ── */}
      <Card variant="outlined" sx={{ borderRadius: 3, mb: 3 }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            {t('profile.profileInfo')}
          </Typography>

          {profileMsg && (
            <Alert severity={profileMsg.type} sx={{ mb: 2 }}>
              {profileMsg.text}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSaveProfile} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField label={t('profile.email')} value={email} disabled fullWidth />
            <TextField
              label={t('profile.displayName')}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              fullWidth
              inputProps={{ maxLength: 100 }}
            />
            <TextField
              label={t('profile.firstName')}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              fullWidth
              inputProps={{ maxLength: 50 }}
            />
            <TextField
              label={t('profile.lastName')}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              fullWidth
              inputProps={{ maxLength: 50 }}
            />
            <TextField
              label={t('profile.city')}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              fullWidth
              inputProps={{ maxLength: 100 }}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={saving}
              startIcon={saving ? <CircularProgress size={18} color="inherit" aria-hidden="true" /> : undefined}
              sx={{ mt: 1 }}
            >
              {t('profile.save')}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* ── Change Password ── */}
      {hasPassword ? (
      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            {t('profile.changePassword')}
          </Typography>

          {passwordMsg && (
            <Alert severity={passwordMsg.type} sx={{ mb: 2 }}>
              {passwordMsg.text}
            </Alert>
          )}

          <Box component="form" onSubmit={handleChangePassword} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label={t('profile.currentPassword')}
              type="password"
              required
              fullWidth
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <TextField
              label={t('profile.newPassword')}
              type="password"
              required
              fullWidth
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <TextField
              label={t('profile.confirmNewPassword')}
              type="password"
              required
              fullWidth
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <Button
              type="submit"
              variant="contained"
              color="warning"
              disabled={changingPassword}
              startIcon={changingPassword ? <CircularProgress size={18} color="inherit" aria-hidden="true" /> : undefined}
              sx={{ mt: 1 }}
            >
              {t('profile.changePasswordButton')}
            </Button>
          </Box>
        </CardContent>
      </Card>
      ) : (
        <Alert severity="info">{t('profile.googleAccount')}</Alert>
      )}
    </Container>
  );
}
