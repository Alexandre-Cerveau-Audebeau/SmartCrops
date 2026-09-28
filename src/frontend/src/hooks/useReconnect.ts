import { useCallback, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../contexts/authContextValue';

/**
 * SMA-448, lot F3, step L4 (R3-E1) — HOW to sign in again, once a request
 * answered 401: the session is ended on both sides (`logout` clears the
 * cookie server-side and the user client-side, so the guest route lets the
 * login page through), then the login page. Read through the context
 * itself rather than `useAuth`, which throws without a provider: a surface
 * mounted without one — a test, a page harness — still navigates.
 */
export function useReconnect(): () => Promise<void> {
  const auth = useContext(AuthContext);
  const navigate = useNavigate();
  return useCallback(async () => {
    await auth?.logout();
    navigate('/login');
  }, [auth, navigate]);
}
