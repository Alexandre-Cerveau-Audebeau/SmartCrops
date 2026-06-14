import { Navigate, Outlet } from 'react-router-dom';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { useAuth } from '../hooks/useAuth';

// Anonymous-only route guard — the mirror of ProtectedRoute. Keeps already
// authenticated users away from /login and /register (UX consistency only;
// the endpoints themselves are protected regardless).
export default function GuestRoute() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isAuthenticated) return <Navigate to="/" replace />;

  return <Outlet />;
}
