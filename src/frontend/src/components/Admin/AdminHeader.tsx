import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import type { AdminDashboardStats } from '../../types/Admin';
import { formatDateTimeMeta } from '../../utils/formatRelativeDate';

interface AdminHeaderProps {
  stats: AdminDashboardStats | null;
  /** Reception time of the data — the « données du … » instant. */
  receivedAt: Date | null;
  loading: boolean;
  /** Hidden in the error state (A3 shows title + chips only). */
  showMeta: boolean;
  mobile: boolean;
  language: string;
  /** Display name, or e-mail as a fallback, of the signed-in admin. */
  adminName: string;
}

/**
 * SMA-414 — page header: « Administration » in primary, the meta line
 * (« N utilisateurs · N jardins · N placements — données du … », no date part
 * on mobile) and the two chips « Rôle Admin · nom » / « Lecture seule ».
 */
export const AdminHeader = memo(function AdminHeader({
  stats,
  receivedAt,
  loading,
  showMeta,
  mobile,
  language,
  adminName,
}: AdminHeaderProps) {
  const { t } = useTranslation();

  let meta: string | null = null;
  if (stats && receivedAt) {
    const parts = {
      users: t('admin.meta.users', { count: stats.totalUsers }),
      gardens: t('admin.meta.gardens', { count: stats.gardensCount }),
      placements: t('admin.meta.placements', { count: stats.placementsCount }),
    };
    meta = mobile
      ? t('admin.meta.lineMobile', parts)
      : t('admin.meta.line', {
          ...parts,
          date: formatDateTimeMeta(receivedAt, language),
        });
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        justifyContent: 'space-between',
        alignItems: { xs: 'flex-start', md: 'flex-start' },
        gap: { xs: 1.5, md: 2 },
        mb: { xs: 2, md: 3 },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="h4"
          component="h1"
          fontWeight={700}
          color="primary"
          sx={{ fontSize: { xs: 25, md: 32 } }}
        >
          {t('admin.title')}
        </Typography>
        {showMeta &&
          (loading || !meta ? (
            <Skeleton
              variant="rounded"
              width={mobile ? 220 : 340}
              height={14}
              sx={{ mt: 1 }}
            />
          ) : (
            <Typography
              color="text.secondary"
              sx={{ mt: 0.5, fontSize: { xs: 12.5, md: 14.5 } }}
            >
              {meta}
            </Typography>
          ))}
      </Box>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Chip
          icon={<AdminPanelSettingsOutlinedIcon />}
          label={
            mobile || !adminName
              ? t('admin.chips.roleShort')
              : t('admin.chips.role', { name: adminName })
          }
          variant="outlined"
          size={mobile ? 'small' : 'medium'}
          sx={{ fontWeight: 600, borderColor: 'borderSubtle' }}
        />
        <Chip
          icon={<VisibilityOutlinedIcon />}
          label={t('admin.chips.readOnly')}
          variant="outlined"
          size={mobile ? 'small' : 'medium'}
          sx={{
            fontWeight: 600,
            color: 'primary.main',
            bgcolor: 'brandTintBg',
            borderColor: 'borderSubtle',
            '& .MuiChip-icon': { color: 'inherit' },
          }}
        />
      </Stack>
    </Box>
  );
});
