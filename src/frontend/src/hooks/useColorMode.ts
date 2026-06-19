import { useContext } from 'react';
import { ColorModeContext } from '../contexts/colorModeContextValue';

export function useColorMode() {
  return useContext(ColorModeContext);
}
