import type { SxProps, Theme } from '@mui/material/styles';

/**
 * SMA-437, lot V39, PR B, step T0 — the layout of the dashboard's header row:
 * the page title on the left, the actions zone (`DashboardActions`) on the
 * right, wrapping under the title when the row has no room for both.
 *
 * One constant, read by the page and by the layout harness: the harness
 * mounts the actions zone UNDER THIS LAYOUT, beside a title, so what it
 * measures is where the header really puts the zone — finding E3 of #291's
 * round 1, which measured the zone alone, in a frame of its own.
 */
export const DASHBOARD_HEADER_SX: SxProps<Theme> = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '12px',
  justifyContent: 'space-between',
  alignItems: 'center',
  mb: 3,
};
