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
  /**
   * NO title row (SMA-336 PR 3b/5, arbitrage Q1) — the declared exception to
   * amendments A1 / A2, for the ONE widget the artboards do not title: the
   * weather card opens on its place name (`.wx-place`, `_spec.md:108` « le
   * lieu tient lieu de titre, dans tous ses états »), and a « MÉTÉO » bar
   * above it would draw a title the design never drew.
   *
   * A prop on the shared frame rather than a sibling `WeatherCard`: the frame
   * — card, padding, radius, gap, Edit-mode top padding, `data-widget` — stays
   * owned ONCE, and the exception is visible at the one call site that takes
   * it. The seven other widgets pass nothing and render exactly as before.
   *
   * The card then names itself for assistive technology as a REGION labelled
   * by {@link Props.regionLabel} (§ 7: « chaque widget est une région nommée »),
   * since no `h2` is left to name it.
   */
  headless?: boolean;
  /** The region's accessible name when {@link Props.headless}; the place, or the widget title while there is none. */
  regionLabel?: string;
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
  headless = false,
  regionLabel,
  children,
}: Props) {
  // « 24 en Grand et en Pleine largeur » (SMA-437 contract § 5.4, D7): the
  // two sizes wide enough for the larger air.
  const roomy = size === 'large' || size === 'wide';
  const padding = roomy ? DASHBOARD_SPACING.paddingLarge : DASHBOARD_SPACING.padding;
  // The Full width on a PHONE (SMA-437 lot 1, PR B, step B7): 20 px, the
  // phone's one air (V32; V3-04, `.ph .w.xl { padding: 20px }`). The harness
  // measured the Key figures band at 24 px: a 110 px tile at 360 px, seven
  // English digits at 22 px running 1.4 px past it; arbitrage 1's 22 px was
  // measured on the 114 px tile these 20 px give. The Large is not touched.
  const air =
    size === 'wide'
      ? { xs: `${DASHBOARD_SPACING.padding}px`, sm: `${padding}px` }
      : `${padding}px`;
  // Edit mode: the "−", the drag handle and the gear live inside the card
  // (`_spec.md` § 8, point 5), so the header needs room for them. A responsive
  // `p` is written in media queries, which come after a plain `pt` and would
  // override it: the Full width's Edit-mode top is declared at its breakpoints.
  const editTop = `${roomy ? 38 : 34}px`;
  const topPadding = editing
    ? size === 'wide'
      ? { xs: editTop, sm: editTop }
      : editTop
    : air;

  // Every widget has one, and it is the SAME table the Customize gallery and
  // the invitation panels read — a widget cannot be drawn with one glyph here
  // and another there.
  const Icon = BLOCK_ICONS[blockKey];

  return (
    <Card
      variant="outlined"
      data-widget={blockKey}
      // A headless card has no heading to be reached by: it is a landmark
      // region carrying the name its heading would have carried.
      role={headless ? 'region' : undefined}
      aria-label={headless ? (regionLabel ?? title) : undefined}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: `${DASHBOARD_SPACING.gap}px`,
        p: air,
        pt: topPadding,
        borderColor: 'borderSubtle',
        overflow: 'hidden',
      }}
    >
      {!headless && (
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
      )}
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
