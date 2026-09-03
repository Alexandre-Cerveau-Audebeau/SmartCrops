import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import { USER_CREATED_AT_MIGRATION_DATE } from '../../constants/admin';
import type { AdminUserListItem, PagedResponse } from '../../types/Admin';
import {
  formatLongDate,
  formatRelativeDate,
  formatShortDate,
  isWithinRelativeWindow,
} from '../../utils/formatRelativeDate';
import AdminPagination from './AdminPagination';
import { AccessChip, ConfirmationChip, YouChip } from './AdminUserBadges';

interface AdminUsersCardProps {
  page: PagedResponse<AdminUserListItem> | null;
  loading: boolean;
  mobile: boolean;
  /** Reference instant for relative dates (the data reception time). */
  now: Date;
  language: string;
  /** Marks the signed-in admin's own row with « vous ». */
  currentUserId: string | null;
  /** D5 — true above the pagination threshold: the bar is shown. */
  paginated: boolean;
  onPageChange: (page: number) => void;
}

// D1 — noon UTC so the day never shifts whatever the viewer's offset.
const MIGRATION_DATE = new Date(`${USER_CREATED_AT_MIGRATION_DATE}T12:00:00Z`);
const SKELETON_ROWS = [0, 1, 2, 3];

const headCellSx = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'text.secondary',
  py: 1.25,
} as const;

const countChipSx = {
  fontWeight: 700,
  bgcolor: 'brandTintBg',
  color: (theme: { palette: { mode: string; primary: { light: string; dark: string } } }) =>
    theme.palette.mode === 'dark'
      ? theme.palette.primary.light
      : theme.palette.primary.dark,
} as const;

function displayNameOf(user: AdminUserListItem): string {
  return user.displayName?.trim() || user.email || user.id;
}

/**
 * SMA-414 — the « Utilisateurs » card: header (icon, title, count chip, sort
 * note), the desktop table UTILISATEUR / INSCRIPTION / CONFIRMATION / ACCÈS or
 * the mobile card list, then the pagination bar (D5). Loading keeps the
 * static labels and swaps the data for skeletons (A2).
 */
export default function AdminUsersCard({
  page,
  loading,
  mobile,
  now,
  language,
  currentUserId,
  paginated,
  onPageChange,
}: AdminUsersCardProps) {
  const { t } = useTranslation();
  const total = page?.total ?? 0;
  const items = page?.items ?? [];

  const registeredBefore = (short: boolean) =>
    t('admin.users.registeredBefore', {
      date: short
        ? formatShortDate(MIGRATION_DATE, language)
        : formatLongDate(MIGRATION_DATE, language),
    });

  const countChip = loading ? (
    <Skeleton
      variant="rounded"
      width={mobile ? 28 : 74}
      height={22}
      sx={{ borderRadius: 999 }}
    />
  ) : (
    <Chip
      size="small"
      label={
        mobile
          ? total.toLocaleString(language)
          : t('admin.users.count', { count: total })
      }
      sx={countChipSx}
    />
  );

  const pagination =
    paginated && page ? (
      <AdminPagination
        page={page.page}
        pageSize={page.pageSize}
        total={page.total}
        disabled={loading}
        onPageChange={onPageChange}
      />
    ) : null;

  if (mobile) {
    return (
      <Box
        component="section"
        aria-busy={loading}
        aria-labelledby="admin-users-title"
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            mx: 0.25,
            mt: 2,
            mb: 1.25,
          }}
        >
          <GroupOutlinedIcon color="primary" sx={{ fontSize: 18 }} />
          <Typography
            id="admin-users-title"
            component="h2"
            sx={{ fontSize: 14.5, fontWeight: 800 }}
          >
            {t('admin.users.title')}
          </Typography>
          {countChip}
          <Box sx={{ flex: 1 }} />
          <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
            {t('admin.users.sortNoteMobile')}
          </Typography>
        </Box>
        <Stack spacing={1.25}>
          {loading &&
            SKELETON_ROWS.map((i) => (
              <Card key={i} variant="outlined" sx={{ borderRadius: 3, p: 1.75 }}>
                <Skeleton width="55%" height={16} />
                <Skeleton width="75%" height={12} sx={{ mt: 0.75 }} />
                <Box sx={{ display: 'flex', gap: 0.75, mt: 1.25 }}>
                  <Skeleton variant="rounded" width={96} height={22} sx={{ borderRadius: 999 }} />
                  <Skeleton variant="rounded" width={88} height={22} sx={{ borderRadius: 999 }} />
                </Box>
              </Card>
            ))}
          {!loading && items.length === 0 && (
            <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
              {t('admin.users.empty')}
            </Typography>
          )}
          {!loading &&
            items.map((user) => {
              const created = user.createdAt ? new Date(user.createdAt) : null;
              return (
                <Card key={user.id} variant="outlined" sx={{ borderRadius: 3, p: 1.75 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography fontWeight={700} noWrap sx={{ minWidth: 0 }}>
                      {displayNameOf(user)}
                    </Typography>
                    {user.id === currentUserId && <YouChip />}
                    <Box sx={{ flex: 1 }} />
                    <Typography
                      sx={{
                        fontSize: 11.5,
                        fontWeight: 700,
                        color: 'text.secondary',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {created
                        ? formatRelativeDate(created, now, language, 'short')
                        : registeredBefore(true)}
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {user.email}
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1.1 }}>
                    <ConfirmationChip confirmed={user.emailConfirmed} />
                    <AccessChip hasGoogleLogin={user.hasGoogleLogin} />
                  </Box>
                </Card>
              );
            })}
        </Stack>
        {pagination && (
          <Card variant="outlined" sx={{ borderRadius: 3, mt: 1.25 }}>
            {pagination}
          </Card>
        )}
      </Box>
    );
  }

  return (
    <Card
      component="section"
      variant="outlined"
      aria-busy={loading}
      aria-labelledby="admin-users-title"
      sx={{ borderRadius: 3, overflow: 'hidden' }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 1.5,
          px: 2.25,
          py: 1.75,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <GroupOutlinedIcon color="primary" sx={{ fontSize: 20 }} />
        <Typography
          id="admin-users-title"
          component="h2"
          sx={{ fontSize: 16, fontWeight: 800 }}
        >
          {t('admin.users.title')}
        </Typography>
        {countChip}
        <Box sx={{ flex: 1 }} />
        <Typography variant="body2" color="text.secondary">
          {t('admin.users.sortNote')}
        </Typography>
      </Box>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ ...headCellSx, width: '38%' }}>
                {t('admin.users.columns.user')}
              </TableCell>
              <TableCell sx={{ ...headCellSx, width: '22%' }}>
                {t('admin.users.columns.registration')}
              </TableCell>
              <TableCell sx={{ ...headCellSx, width: '20%' }}>
                {t('admin.users.columns.confirmation')}
              </TableCell>
              <TableCell sx={{ ...headCellSx, width: '20%' }}>
                {t('admin.users.columns.access')}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading &&
              SKELETON_ROWS.map((i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton width={160} height={14} />
                    <Skeleton width={210} height={11} sx={{ mt: 0.75 }} />
                  </TableCell>
                  <TableCell>
                    <Skeleton width={110} height={12} />
                  </TableCell>
                  <TableCell>
                    <Skeleton variant="rounded" width={96} height={22} sx={{ borderRadius: 999 }} />
                  </TableCell>
                  <TableCell>
                    <Skeleton variant="rounded" width={88} height={22} sx={{ borderRadius: 999 }} />
                  </TableCell>
                </TableRow>
              ))}
            {!loading && items.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  sx={{ textAlign: 'center', color: 'text.secondary', py: 4 }}
                >
                  {t('admin.users.empty')}
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              items.map((user) => {
                const created = user.createdAt ? new Date(user.createdAt) : null;
                return (
                  <TableRow key={user.id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography fontWeight={700}>{displayNameOf(user)}</Typography>
                        {user.id === currentUserId && <YouChip />}
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        {user.email}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {created ? (
                        <>
                          <Typography fontWeight={600} sx={{ fontSize: 14 }}>
                            {formatLongDate(created, language)}
                          </Typography>
                          {isWithinRelativeWindow(created, now) && (
                            <Typography variant="body2" color="text.secondary">
                              {formatRelativeDate(created, now, language)}
                            </Typography>
                          )}
                        </>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          {registeredBefore(false)}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <ConfirmationChip confirmed={user.emailConfirmed} />
                    </TableCell>
                    <TableCell>
                      <AccessChip hasGoogleLogin={user.hasGoogleLogin} />
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </TableContainer>
      {pagination}
    </Card>
  );
}
