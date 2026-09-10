import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import { BLOCK_ICONS } from './blockIcons';
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
 * SMA-336 — the shared widget frame: the card, its icon, its spaced-capitals
 * title, an optional right-hand chip, and the body. Every widget of the
 * dashboard is this component plus a body, so the type scale (`_spec.md` § 2)
 * and the air rules (§ 3) are applied in ONE place.
 *
 * The title row is the artboards' `.hd` transcribed: `display: flex;
 * align-items: center; gap: 8px`, the glyph in the primary colour, the label in
 * muted capitals, and anything else pushed to the right by `.hd-r`. Two
 * amendments apply to it (round 4) — the label is 15 px rather than 13 (A1) and
 * the glyph 20 px rather than 18 (A2) — and both live in `DASHBOARD_TYPE`, so
 * the eight widgets move together.
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

  // Every widget has one, and it is the SAME table the Customize gallery and
  // the invitation panels read — a widget cannot be drawn with one glyph here
  // and another there.
  const Icon = BLOCK_ICONS[blockKey];

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
          gap: '8px',
          minWidth: 0,
        }}
      >
        {/* `.hd .ic { color: var(--prim) }` — the one coloured mark of a
            widget's header. Decorative: the `h2` beside it carries the name, so
            the glyph is hidden from assistive technology rather than read out a
            second time. `flexShrink: 0` keeps it whole when a long title has to
            ellipsize, which is what the artboard's own `.ic` declares. */}
        <Icon
          aria-hidden
          sx={{
            fontSize: `${DASHBOARD_TYPE.titleIcon}px`,
            color: 'primary.main',
            flexShrink: 0,
          }}
        />
        <Typography
          component="h2"
          sx={{
            fontSize: `${DASHBOARD_TYPE.title}px`,
            fontWeight: 800,
            letterSpacing: DASHBOARD_TYPE.titleLetterSpacing,
            textTransform: 'uppercase',
            color: 'text.secondary',
            // `.hd-t` — the title yields before the chip does.
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </Typography>
        {/* `.hd-r { margin-left: auto }` — pushed right, and never squeezed. */}
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          {chip}
        </Box>
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
