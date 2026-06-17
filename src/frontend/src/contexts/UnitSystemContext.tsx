import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { UnitSystemContext } from './unitSystemContextValue';
import type { UnitSystem } from './unitSystemContextValue';

const STORAGE_KEY = 'smartcrops.unitSystem';

function normalize(value: string | null): UnitSystem {
  return value === 'imperial' ? 'imperial' : 'metric';
}

/**
 * Provides the metric/imperial preference for Plant Detail v2 (SMA-178). The
 * initial value is read from localStorage (default 'metric') and persisted on
 * every change. Mounted high enough to cover the Plant Detail route (App.tsx).
 */
export function UnitSystemProvider({ children }: { children: ReactNode }) {
  const [system, setSystem] = useState<UnitSystem>(() => {
    try {
      return normalize(localStorage.getItem(STORAGE_KEY));
    } catch {
      return 'metric';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, system);
    } catch {
      // localStorage unavailable (private mode / SSR) — preference stays in memory.
    }
  }, [system]);

  const toggle = useCallback(
    () => setSystem((prev) => (prev === 'metric' ? 'imperial' : 'metric')),
    []
  );

  const value = useMemo(
    () => ({ system, setSystem, toggle }),
    [system, toggle]
  );

  return (
    <UnitSystemContext.Provider value={value}>
      {children}
    </UnitSystemContext.Provider>
  );
}
