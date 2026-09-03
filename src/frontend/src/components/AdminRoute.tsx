import { Navigate, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { useAuth } from '../hooks/useAuth';
import AdminForbiddenState from './Admin/AdminForbiddenState';

/**
 * SMA-414 — admin-only route guard, the role-aware sibling of ProtectedRoute.
 * Anonymous → /login (as ProtectedRoute). Signed-in but not admin → the 403
 * state rendered IN PLACE (D3: no redirect). `user.isAdmin` is UX only: the
 * API's `[Authorize(Roles = "Admin")]` stays the one real barrier, and the
 * page turns an API 403 into the same state.
 */
export default function AdminRoute() {
  const { t } = useTranslation();
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress aria-label={t('common.loading')} />
      </Box>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (!user?.isAdmin) return <AdminForbiddenState />;

  return <Outlet />;
}
