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

/**
 * SMA-437, lot V3-06 (contract A-24) — the page's title, « Mes Jardins », an
 * h1 with the h4 look: 28 px on a phone — the size V3-04 drew, which the
 * pre-flight of lot V39 found the code never had — and the h4's own 34 px
 * from 600 px up (`sm`); the h4's line height, 1.235, at both sizes. In `rem`,
 * as the theme writes the h4 (2.125rem): the reader's own font size still
 * scales it. One constant, read by the page and by the layout harness, like
 * the row above.
 */
export const DASHBOARD_TITLE_SX: SxProps<Theme> = {
  fontSize: { xs: '1.75rem', sm: '2.125rem' },
};
