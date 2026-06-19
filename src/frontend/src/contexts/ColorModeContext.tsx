import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { createAppTheme } from '../theme';
import { ColorModeContext, type ColorMode } from './colorModeContextValue';

const KEY = 'smartcrops-color-mode';

function initialMode(): ColorMode {
  const saved =
    typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
  if (saved === 'light' || saved === 'dark') return saved;
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function ColorModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ColorMode>(initialMode);
  const setMode = useCallback((m: ColorMode) => {
    setModeState(m);
    localStorage.setItem(KEY, m);
  }, []);
  const toggle = useCallback(() => {
    setModeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem(KEY, next);
      return next;
    });
  }, []);
  const theme = useMemo(() => createAppTheme(mode), [mode]);
  const value = useMemo(
    () => ({ mode, toggle, setMode }),
    [mode, toggle, setMode]
  );
  return (
    <ColorModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}
