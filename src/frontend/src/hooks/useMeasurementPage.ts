import { useContext, useEffect } from 'react';
import { MeasurementPageContext } from '../contexts/measurementPageContextValue';

function useMeasurementPageContext() {
  const ctx = useContext(MeasurementPageContext);
  if (ctx === undefined) {
    throw new Error(
      'useMeasurementPage must be used within a MeasurementPageProvider'
    );
  }
  return ctx;
}

/**
 * Declare side (SMA-352): a page that displays measurements calls this once
 * at top level; the registration lives exactly as long as the page. The
 * effect's cleanup IS the unregister returned by `register`.
 */
export function useMeasurementPage(): void {
  const { register } = useMeasurementPageContext();
  useEffect(() => register(), [register]);
}

/** Read side: the chrome asks whether any mounted page declared measurements. */
export function useIsMeasurementPage(): boolean {
  return useMeasurementPageContext().isMeasurementPage;
}
