import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '@mui/material/Button';
import CloudOffOutlinedIcon from '@mui/icons-material/CloudOffOutlined';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import { AdminStateCard } from './AdminStateCard';

interface AdminErrorStateProps {
  /** Re-runs BOTH dashboard calls (stats, then users). */
  onRetry: () => void;
}

/**
 * SMA-414 — the load-error state (A3): the server did not answer; the admin
 * rights did not change. One action: retry.
 */
export const AdminErrorState = memo(function AdminErrorState({
  onRetry,
}: AdminErrorStateProps) {
  const { t } = useTranslation();
  return (
    <AdminStateCard
      tone="error"
      icon={<CloudOffOutlinedIcon />}
      title={t('admin.error.title')}
      text={t('admin.error.text')}
      action={
        <Button
          variant="contained"
          startIcon={<RefreshOutlinedIcon />}
          onClick={onRetry}
        >
          {t('admin.error.retry')}
        </Button>
      }
    />
  );
});
