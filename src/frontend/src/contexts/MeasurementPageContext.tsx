import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { MeasurementPageContext } from './measurementPageContextValue';

/**
 * Holds the "this page displays measurements" declarations (SMA-352). A
 * COUNTER, not a boolean: StrictMode double-invokes effects and a route
 * transition can mount the next page before the previous one unmounts —
 * register/unregister pairs keep the count honest where a flag would
 * flicker or stick. Mounted at the UnitSystemProvider altitude (App.tsx)
 * so the Navbar and every routed page share the one instance.
 */
export function MeasurementPageProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);

  const register = useCallback(() => {
    setCount((prev) => prev + 1);
    return () => setCount((prev) => prev - 1);
  }, []);

  const value = useMemo(
    () => ({ isMeasurementPage: count > 0, register }),
    [count, register]
  );

  return (
    <MeasurementPageContext.Provider value={value}>
      {children}
    </MeasurementPageContext.Provider>
  );
}
