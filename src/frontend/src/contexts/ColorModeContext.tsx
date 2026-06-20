import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { createAppTheme } from '../theme';
import { ColorModeContext, type ColorMode } from './colorModeContextValue';

const KEY = 'smartcrops-color-mode';

// localStorage can throw (SecurityError in private mode, QuotaExceededError,
// sandboxed iframes), so reads/writes are wrapped: persistence degrades
// gracefully while the in-memory mode keeps working for the session.
function readStoredMode(): string | null {
  try {
    return typeof localStorage !== 'undefined'
      ? localStorage.getItem(KEY)
      : null;
  } catch {
    return null;
  }
}

function writeStoredMode(m: ColorMode): void {
  try {
    localStorage.setItem(KEY, m);
  } catch {
    // persistence unavailable — keep the in-memory mode for this session
  }
}

function initialMode(): ColorMode {
  const saved = readStoredMode();
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
    writeStoredMode(m);
  }, []);
  const toggle = useCallback(() => {
    setModeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      writeStoredMode(next);
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
