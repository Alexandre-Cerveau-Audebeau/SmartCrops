import { useContext } from 'react';
import { UnitSystemContext } from '../contexts/unitSystemContextValue';

/**
 * Access the metric/imperial preference (SMA-178). Throws when used outside a
 * {@link UnitSystemProvider} so a missing provider surfaces as a clear error
 * rather than a silent metric fallback.
 */
export function useUnitSystem() {
  const ctx = useContext(UnitSystemContext);
  if (ctx === undefined) {
    throw new Error('useUnitSystem must be used within a UnitSystemProvider');
  }
  return ctx;
}
