import { createContext } from 'react';

export type ColorMode = 'light' | 'dark';

export interface ColorModeContextValue {
  mode: ColorMode;
  toggle: () => void;
  setMode: (m: ColorMode) => void;
}

export const ColorModeContext = createContext<
  ColorModeContextValue | undefined
>(undefined);
