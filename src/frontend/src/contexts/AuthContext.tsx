import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import * as authApi from '../services/authApi';
import type { AuthUser } from '../types/Auth';
import { AuthContext } from './authContextValue';

const STORAGE_KEY = 'smartcrops-token';

function decodeToken(token: string): AuthUser | null {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(base64Url.length / 4) * 4, '=');
    const payload = JSON.parse(atob(base64));
    if (typeof payload.exp !== 'number' || payload.exp <= Date.now() / 1000) return null;
    if (typeof payload.email !== 'string' || typeof payload.sub !== 'string') return null;
    return { email: payload.email, userId: payload.sub };
  } catch {
    return null;
  }
}

function loadStoredAuth(): { token: string | null; user: AuthUser | null } {
  try {
    const token = localStorage.getItem(STORAGE_KEY);
    if (!token) return { token: null, user: null };
    const user = decodeToken(token);
    if (!user) {
      localStorage.removeItem(STORAGE_KEY);
      return { token: null, user: null };
    }
    return { token, user };
  } catch {
    return { token: null, user: null };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState(loadStoredAuth);

  const login = useCallback(async (email: string, password: string) => {
    const response = await authApi.login(email, password);
    const user = decodeToken(response.token);
    if (!user) throw new Error('Received an invalid authentication token');
    localStorage.setItem(STORAGE_KEY, response.token);
    setAuth({ token: response.token, user });
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    await authApi.register(email, password);
    await login(email, password);
  }, [login]);

  const googleCallback = useCallback((token: string) => {
    const user = decodeToken(token);
    if (!user) throw new Error('Received an invalid authentication token');
    localStorage.setItem(STORAGE_KEY, token);
    setAuth({ token, user });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setAuth({ token: null, user: null });
  }, []);

  const value = useMemo(() => ({
    user: auth.user,
    token: auth.token,
    login,
    register,
    googleCallback,
    logout,
    isAuthenticated: auth.user !== null,
  }), [auth, login, register, googleCallback, logout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
