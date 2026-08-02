import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import * as authApi from '../services/authApi';
import type { AuthUser } from '../types/Auth';
import { AuthContext } from './authContextValue';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authApi.fetchMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await authApi.login(email, password);
    const me = await authApi.fetchMe();
    setUser(me);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    // SMA-320 R1: registration no longer establishes a session — the account
    // starts unconfirmed and every token for it is inert until the email is
    // confirmed, so there is no session to fetch. The page shows the
    // check-your-inbox notice and routes the user toward Login instead.
    await authApi.register(email, password);
  }, []);

  const googleCallback = useCallback(async () => {
    const me = await authApi.fetchMe();
    setUser(me);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const me = await authApi.fetchMe();
      setUser(me);
    } catch {
      // Silently fail — user stays with current state
    }
  }, []);

  const value = useMemo(() => ({
    user,
    token: null,
    login,
    register,
    googleCallback,
    logout,
    refreshUser,
    isAuthenticated: user !== null,
    loading,
  }), [user, login, register, googleCallback, logout, refreshUser, loading]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
