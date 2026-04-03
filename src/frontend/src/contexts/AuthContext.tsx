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
    await authApi.register(email, password);
    const me = await authApi.fetchMe();
    setUser(me);
  }, []);

  const googleCallback = useCallback(async () => {
    const me = await authApi.fetchMe();
    setUser(me);
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, []);

  const value = useMemo(() => ({
    user,
    token: null,
    login,
    register,
    googleCallback,
    logout,
    isAuthenticated: user !== null,
    loading,
  }), [user, login, register, googleCallback, logout, loading]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
