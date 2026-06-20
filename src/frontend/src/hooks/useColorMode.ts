import { useContext } from 'react';
import { ColorModeContext } from '../contexts/colorModeContextValue';

/**
 * Access the light/dark color mode (SMA-184). Throws when used outside a
 * {@link ColorModeProvider} so a missing provider surfaces as a clear error
 * rather than a silent light fallback (mirrors useUnitSystem / useAuth).
 */
export function useColorMode() {
  const ctx = useContext(ColorModeContext);
  if (ctx === undefined) {
    throw new Error('useColorMode must be used within a ColorModeProvider');
  }
  return ctx;
}
