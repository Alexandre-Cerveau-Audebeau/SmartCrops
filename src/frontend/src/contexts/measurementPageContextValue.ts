import { createContext } from 'react';

/**
 * Page-carried declaration for the contextual unit toggle (SMA-352): a page
 * that displays measurements registers itself while mounted, and the chrome
 * (Navbar) surfaces the unit switch in the top bar there — folding it into
 * the hamburger drawer everywhere else. The page declares, the bar reads:
 * no central route list, no prop drilling.
 */
export interface MeasurementPageContextValue {
  /** True while at least one mounted page declares it displays measurements. */
  isMeasurementPage: boolean;
  /** Registers a declaring page; returns the matching unregister. */
  register: () => () => void;
}

/**
 * Undefined default so {@link useMeasurementPage} can throw when used outside
 * the provider (a real bug) instead of silently never showing the bar toggle.
 */
export const MeasurementPageContext = createContext<
  MeasurementPageContextValue | undefined
>(undefined);
