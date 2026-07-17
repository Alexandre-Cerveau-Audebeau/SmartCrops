import { useTheme } from '@mui/material/styles';
import { getPlannerTokens, type PlannerTokens } from './plannerTokens';

/**
 * Mode-aware planner tokens (SMA-17 5.3-D R3, CR accept): one hook instead of
 * the `useTheme` + `getPlannerTokens(palette.mode …)` pair duplicated across
 * the planner surfaces.
 */
export function usePlannerTokens(): PlannerTokens {
  const theme = useTheme();
  return getPlannerTokens(theme.palette.mode === 'dark' ? 'dark' : 'light');
}
