import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import { AdminErrorState } from '../components/Admin/AdminErrorState';
import { AdminForbiddenState } from '../components/Admin/AdminForbiddenState';
import { AdminHeader } from '../components/Admin/AdminHeader';
import { AdminStatsTiles } from '../components/Admin/AdminStatsTiles';
import { AdminUsersCard } from '../components/Admin/AdminUsersCard';
import {
  ADMIN_USERS_PAGE_SIZE,
  ADMIN_USERS_PAGINATION_THRESHOLD,
  ADMIN_USERS_SINGLE_PAGE_SIZE,
} from '../constants/admin';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import { fetchAdminStats, fetchAdminUsers } from '../services/adminApi';
import { HttpStatusError } from '../services/httpStatusError';
import type {
  AdminDashboardStats,
  AdminUserListItem,
  PagedResponse,
} from '../types/Admin';

type Status = 'loading' | 'ready' | 'error' | 'forbidden';

function statusForError(err: unknown): Status {
  return err instanceof HttpStatusError && err.status === 403
    ? 'forbidden'
    : 'error';
}

/**
 * SMA-414 — Admin Dashboard v1, read-only: four counters and the paged user
 * listing. Loading (A2) → skeletons; load error (A3) → retry card re-running
 * BOTH calls; API 403 (A4) → the forbidden state in place. D5 + round 1 (F2):
 * the listing is asked for one page of up to 100 accounts; if ITS OWN total
 * exceeds the threshold, page 1 is refetched at 25 per page before anything
 * renders, and the pagination mode follows that total — never the counters,
 * which the stats endpoint computes independently.
 */
export default function Admin() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { user } = useAuth();
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('md'));

  const [status, setStatus] = useState<Status>('loading');
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [users, setUsers] = useState<PagedResponse<AdminUserListItem> | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [receivedAt, setReceivedAt] = useState<Date | null>(null);
  const [attempt, setAttempt] = useState(0);
  const pageRequest = useRef<AbortController | null>(null);

  // F2: the listing response decides the mode, not stats.totalUsers.
  const paginated = (users?.total ?? 0) > ADMIN_USERS_PAGINATION_THRESHOLD;

  // Initial load and every retry: stats, then the listing sized by D5 / F2.
  useEffect(() => {
    const controller = new AbortController();
    pageRequest.current?.abort();
    setStatus('loading');
    (async () => {
      try {
        const nextStats = await fetchAdminStats(controller.signal);
        let nextUsers = await fetchAdminUsers(
          1,
          ADMIN_USERS_SINGLE_PAGE_SIZE,
          controller.signal
        );
        if (nextUsers.total > ADMIN_USERS_PAGINATION_THRESHOLD) {
          // The listing outgrew the single page: switch to 25 per page BEFORE
          // the first render so the bar and the rows agree.
          nextUsers = await fetchAdminUsers(1, ADMIN_USERS_PAGE_SIZE, controller.signal);
        }
        if (controller.signal.aborted) return;
        setStats(nextStats);
        setUsers(nextUsers);
        setReceivedAt(new Date());
        setStatus('ready');
      } catch (err) {
        if (controller.signal.aborted) return;
        setStatus(statusForError(err));
      }
    })();
    return () => controller.abort();
  }, [attempt]);

  // Page flips only refetch the listing; the counters stay as received.
  const changePage = useCallback(async (page: number) => {
    pageRequest.current?.abort();
    const controller = new AbortController();
    pageRequest.current = controller;
    setUsersLoading(true);
    try {
      const next = await fetchAdminUsers(page, ADMIN_USERS_PAGE_SIZE, controller.signal);
      if (controller.signal.aborted) return;
      setUsers(next);
    } catch (err) {
      if (controller.signal.aborted) return;
      setStatus(statusForError(err));
    } finally {
      if (!controller.signal.aborted) setUsersLoading(false);
    }
  }, []);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => () => pageRequest.current?.abort(), []);

  if (status === 'forbidden') return <AdminForbiddenState />;

  const adminName = user?.displayName?.trim() || user?.email || '';
  const now = receivedAt ?? new Date();

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2.5, md: 4 } }}>
      <AdminHeader
        stats={status === 'ready' ? stats : null}
        receivedAt={receivedAt}
        loading={status === 'loading'}
        showMeta={status !== 'error'}
        mobile={mobile}
        language={language}
        adminName={adminName}
      />
      {status === 'error' ? (
        <AdminErrorState onRetry={retry} />
      ) : (
        <>
          <AdminStatsTiles
            stats={status === 'ready' ? stats : null}
            loading={status === 'loading'}
            mobile={mobile}
            now={now}
            language={language}
          />
          <AdminUsersCard
            page={status === 'ready' ? users : null}
            loading={status === 'loading' || usersLoading}
            mobile={mobile}
            now={now}
            language={language}
            currentUserId={user?.userId ?? null}
            trackedSince={status === 'ready' ? (stats?.createdAtTrackedSince ?? null) : null}
            paginated={paginated}
            onPageChange={changePage}
          />
          {status === 'ready' && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1,
                mt: { xs: 1.75, md: 1.5 },
                color: 'text.secondary',
              }}
            >
              <VerifiedUserOutlinedIcon
                sx={{ fontSize: 16, mt: 0.25, color: 'primary.main' }}
              />
              <Typography sx={{ fontSize: { xs: 11.5, md: 12.5 } }}>
                {t('admin.rgpd')}
              </Typography>
            </Box>
          )}
        </>
      )}
    </Container>
  );
}
