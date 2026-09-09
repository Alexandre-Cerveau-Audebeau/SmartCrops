import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import {
  DASHBOARD_SPACING,
  DASHBOARD_TYPE,
} from '../../theme/dashboardTokens';
import type { DashboardBlockKey, DashboardSize } from '../../types/Dashboard';

interface Props {
  blockKey: DashboardBlockKey;
  title: string;
  size: DashboardSize;
  /** Right-hand chip of the title row (« 3 jardins », « 4 tâches »). */
  chip?: ReactNode;
  /** Extra top padding for the Edit-mode controls, which sit INSIDE the card. */
  editing?: boolean;
  children: ReactNode;
}

/**
 * SMA-336 — the shared widget frame: the card, its 13 px spaced-capitals title,
 * an optional right-hand chip, and the body. Every widget of the dashboard is
 * this component plus a body, so the type scale (`_spec.md` § 2) and the air
 * rules (§ 3) are applied in ONE place.
 *
 * `data-widget` mirrors the frozen artboards' own attribute — the same eight
 * keys — which keeps a widget identifiable from a test and from the design.
 *
 * The card radius is the product's `MuiCard` default (12 px), which is also the
 * radius the frozen artboards use.
 */
export default function DashboardBlock({
  blockKey,
  title,
  size,
  chip,
  editing = false,
  children,
}: Props) {
  const padding =
    size === 'large'
      ? DASHBOARD_SPACING.paddingLarge
      : DASHBOARD_SPACING.padding;
  // Edit mode: the "−", the drag handle and the gear live inside the card
  // (`_spec.md` § 8, point 5), so the header needs room for them.
  const topPadding = editing ? (size === 'large' ? 38 : 34) : padding;

  return (
    <Card
      variant="outlined"
      data-widget={blockKey}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: `${DASHBOARD_SPACING.gap}px`,
        p: `${padding}px`,
        pt: `${topPadding}px`,
        borderColor: 'borderSubtle',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        <Typography
          component="h2"
          sx={{
            fontSize: `${DASHBOARD_TYPE.title}px`,
            fontWeight: 800,
            letterSpacing: DASHBOARD_TYPE.titleLetterSpacing,
            textTransform: 'uppercase',
            color: 'text.secondary',
          }}
        >
          {title}
        </Typography>
        {chip}
      </Box>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: `${DASHBOARD_SPACING.gap}px`,
        }}
      >
        {children}
      </Box>
    </Card>
  );
}
