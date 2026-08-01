import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import { useAuth } from '../hooks/useAuth';
import DeleteAccountDialog from '../components/Profile/DeleteAccountDialog';
import { fetchProfile, updateProfile, changePassword, exportAccountData } from '../services/profileApi';

export default function Profile() {
  const { t } = useTranslation();
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const mountedRef = useRef(true);

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [city, setCity] = useState('');
  const [hasPassword, setHasPassword] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // SMA-341 danger zone: export needs no confirmation (not destructive);
  // deletion is armed through the typing dialog.
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

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
        setProfileLoaded(true);
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
      await logout();
      setPasswordMsg({ type: 'success', text: t('profile.passwordSuccess') });
      setTimeout(() => navigate('/login', { replace: true }), 2000);
    } catch (err) {
      setPasswordMsg({ type: 'error', text: err instanceof Error ? err.message : t('profile.passwordError') });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleExport = async () => {
    setExportError(false);
    setExporting(true);
    try {
      const { blob, filename } = await exportAccountData();
      // First download path in the codebase (SMA-341): a transient anchor with
      // the `download` attribute — the fetch already carried the auth cookie,
      // and the blob URL keeps the dated filename the backend chose.
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Deferred a tick (R2): some engines historically start consuming the
      // blob URL only after the click settles; revoking synchronously could
      // kill the download it just triggered.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setExportError(true);
    } finally {
      setExporting(false);
    }
  };

  // The backend already destroyed the account and its cookie; logout() just
  // clears the cookie again and resets the client auth state. Guarded HERE, at
  // the source, rather than with a catch at the dialog's call site: the dialog
  // fires onDeleted() without awaiting it, so a rejection escaping this
  // function would surface nowhere — the dialog would sit frozen at
  // deleting=true over an account that no longer exists. Completion is
  // BOUNDED, not merely non-rejecting (R3): authApi.logout carries its own
  // 10 s AbortSignal.timeout, so this await cannot hang — a stalled relay
  // becomes a rejection, the catch swallows it, and navigation ALWAYS runs.
  const handleDeleted = async () => {
    try {
      await logout();
    } catch {
      // The account is already gone server-side; a client-side logout failure
      // must not block navigation away from a dead account page.
    } finally {
      navigate('/', { replace: true });
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3, flexWrap: 'wrap' }}>
        <Typography variant="h4" fontWeight={700} color="primary">
          {t('profile.title')}
        </Typography>
        {/* SMA-83: admin role badge — shown only for admins (data from /me.isAdmin). */}
        {user?.isAdmin && (
          <Chip
            icon={<AdminPanelSettingsIcon />}
            label={t('profile.adminBadge')}
            color="primary"
            size="small"
          />
        )}
      </Box>

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
              disabled={!profileLoaded || saving}
              inputProps={{ maxLength: 100 }}
            />
            <TextField
              label={t('profile.firstName')}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              fullWidth
              disabled={!profileLoaded || saving}
              inputProps={{ maxLength: 50 }}
            />
            <TextField
              label={t('profile.lastName')}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              fullWidth
              disabled={!profileLoaded || saving}
              inputProps={{ maxLength: 50 }}
            />
            <TextField
              label={t('profile.city')}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              fullWidth
              disabled={!profileLoaded || saving}
              inputProps={{ maxLength: 100 }}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={!profileLoaded || saving}
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

      {/* ── Danger zone (SMA-341) ── deliberately LAST and visually set apart:
          one does not delete an account next to the language picker. */}
      <Card
        variant="outlined"
        sx={{ borderRadius: 3, mt: 3, borderColor: 'error.main' }}
      >
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h6" color="error" sx={{ mb: 2 }}>
            {t('profile.dangerZone')}
          </Typography>

          <Typography variant="subtitle1" fontWeight={600}>
            {t('profile.exportTitle')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t('profile.exportBody')}
          </Typography>
          {exportError && (
            <Alert severity="error" sx={{ mb: 1.5 }}>
              {t('profile.exportError')}
            </Alert>
          )}
          <Button
            variant="outlined"
            onClick={handleExport}
            disabled={exporting}
            startIcon={exporting ? <CircularProgress size={18} color="inherit" aria-hidden="true" /> : undefined}
          >
            {t('profile.exportButton')}
          </Button>

          <Typography variant="subtitle1" fontWeight={600} sx={{ mt: 3 }}>
            {t('profile.deleteTitle')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t('profile.deleteBody')}
          </Typography>
          <Button
            variant="outlined"
            color="error"
            onClick={() => setDeleteOpen(true)}
            disabled={!profileLoaded}
          >
            {t('profile.deleteButton')}
          </Button>
        </CardContent>
      </Card>

      <DeleteAccountDialog
        open={deleteOpen}
        email={email}
        onClose={() => setDeleteOpen(false)}
        onDeleted={handleDeleted}
      />
    </Container>
  );
}
