import { createContext } from 'react';

/** Measurement system for the Plant Detail v2 unit toggle (SMA-178). */
export type UnitSystem = 'metric' | 'imperial';

export interface UnitSystemContextValue {
  system: UnitSystem;
  setSystem: (system: UnitSystem) => void;
  toggle: () => void;
}

/**
 * Undefined default so {@link useUnitSystem} can throw when used outside the
 * provider (a real bug) instead of silently falling back to metric.
 */
export const UnitSystemContext = createContext<
  UnitSystemContextValue | undefined
>(undefined);
