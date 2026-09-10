import { useTheme } from '@mui/material/styles';
import { getDashboardTokens, type DashboardTokens } from './dashboardTokens';

/**
 * Mode-aware dashboard tokens (SMA-336) — the usePlannerTokens idiom, so no
 * widget repeats the `useTheme` + `getDashboardTokens(palette.mode …)` pair.
 */
export function useDashboardTokens(): DashboardTokens {
  const theme = useTheme();
  return getDashboardTokens(theme.palette.mode === 'dark' ? 'dark' : 'light');
}
