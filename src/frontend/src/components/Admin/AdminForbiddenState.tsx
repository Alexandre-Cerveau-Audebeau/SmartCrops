import { Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Button from '@mui/material/Button';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import AdminStateCard from './AdminStateCard';

/**
 * SMA-414 — the 403 state (A4): lock ring, « Accès réservé », the HTTP 403
 * pill and a single way out, home. Rendered in place by AdminRoute for a
 * signed-in non-admin (D3) and by the page when the API itself answers 403.
 * No page header around it: a non-admin never sees the admin chrome.
 */
export default function AdminForbiddenState() {
  const { t } = useTranslation();
  return (
    <AdminStateCard
      tone="neutral"
      icon={<LockOutlinedIcon />}
      title={t('admin.forbidden.title')}
      text={t('admin.forbidden.text')}
      code={t('admin.forbidden.code')}
      action={
        <Button
          variant="contained"
          component={RouterLink}
          to="/"
          startIcon={<HomeOutlinedIcon />}
        >
          {t('admin.forbidden.home')}
        </Button>
      }
    />
  );
}
