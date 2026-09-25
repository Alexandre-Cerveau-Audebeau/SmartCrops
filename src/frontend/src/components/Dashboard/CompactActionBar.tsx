import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import type { SaveState } from '../../hooks/useDashboardPreferences';
import { DASHBOARD_TYPE } from '../../theme/dashboardTokens';
import { useDashboardTokens } from '../../theme/useDashboardTokens';
import { PageActionButtons } from './DashboardActions';

export interface CompactActionBarProps {
  /** The header's repeated buttons have passed the line: the bar takes them over. */
  shown: boolean;
  /** The bottom of the site navbar, measured — where the bar sits. */
  top: number;
  editing: boolean;
  /** The layout is loading or could not be read — the header's buttons' own state. */
  unavailable: boolean;
  /** Where the debounced save stands — the bar shows a COPY of the header's indicator in Edit mode. */
  saveState: SaveState;
  onEditingChange: (editing: boolean) => void;
  onCustomize: () => void;
  barRef?: Ref<HTMLDivElement>;
}

/** `.cb`'s soft shadow, and `.cb.ed`'s green rule drawn inside its bottom edge. */
const BAR_SHADOW = '0 2px 8px rgba(0,0,0,0.08)';

/**
 * SMA-437, lot V39, PR B — the compact action bar (V3-05, validated by
 * Alexandre on 25/09: « Magnifique, continue »). When the header's « Modifier
 * » and « Personnaliser » scroll away under the site navbar, the bar brings
 * them back at the top of the screen, right under that navbar, at every width
 * (A-8) — and nothing else: neither « Créer un jardin » nor the level chip
 * (A-7). Not at the Novice formula (A-9, the page does not mount it).
 *
 * Mounted ONCE, right after the header and right before the grid — the order
 * of the keyboard (A-10.6: Shift+Tab from the first widget reaches it) — and
 * `position: fixed` from there: a fixed bar inside `<main>`, whose
 * `overflow-x: clip` the Layout warns about, was measured to paint and take
 * clicks normally in Chrome 153 (pre-flight, constat 15). Hidden, it is
 * `visibility: hidden`, `inert` and `aria-hidden`, slid up behind the site
 * navbar (`z-index` 1099, the navbar's 1100 less one — A-10.2).
 *
 * `.cb` and `.cb-in` of V3-05: a card-coloured bar the whole width of the
 * window, a 1 px rule and a soft shadow under it; inside, the page's 1 200 px
 * column, 53 px high with 8 px above and below. On a phone, « Modifier » and
 * « Personnaliser » in two equal halves; from 600 px, « Mes Jardins » on the
 * left (17 px — the product loads no 800 weight, which draws as 700) and the
 * two buttons on the right.
 *
 * In Edit mode — the case the bar is for (A-10.4, B5): a tinted ground
 * (`tint` by day, `invBg` at night, where `tint` would bring « Personnaliser »
 * down to 4.26:1), a green rule under it, and « Mode Modifier » with the save
 * state where the title was. On a phone, two lines — 73 px, measured —:
 * « Mode Modifier » and the state, then « Terminé » and « Personnaliser » in
 * equal halves; under 600 px « Mode Modifier » goes without its glyph, which
 * would not leave room for « Modifications non enregistrées » at 360 px. The
 * state's place is kept before the first change, so the bar does not grow at
 * the first gesture. The state here is a COPY, `aria-hidden`: the page has ONE
 * live region for the save, the header's, which no row ever makes inert.
 */
export default function CompactActionBar({
  shown,
  top,
  editing,
  unavailable,
  saveState,
  onEditingChange,
  onCustomize,
  barRef,
}: CompactActionBarProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const tk = useDashboardTokens();
  const night = theme.palette.mode === 'dark';
  const tint = night ? tk.invBg : tk.tint;

  return (
    <Box
      ref={barRef}
      data-compact-bar
      role="group"
      aria-label={t('dashboard.pageActions')}
      aria-hidden={shown ? undefined : true}
      inert={!shown}
      sx={{
        position: 'fixed',
        top,
        left: 0,
        right: 0,
        zIndex: theme.zIndex.appBar - 1,
        bgcolor: 'background.paper',
        backgroundImage: editing ? `linear-gradient(${tint}, ${tint})` : 'none',
        borderBottom: '1px solid',
        borderColor: editing ? theme.palette.primary.main : 'divider',
        boxShadow: editing
          ? `inset 0 -1px 0 ${theme.palette.primary.main},${BAR_SHADOW}`
          : BAR_SHADOW,
        // B7 — the motion (A-10.2): it slides from behind the site navbar in
        // 150 ms (`duration.shortest`), `easeOut` in and `sharp` out, the
        // TRANSFORM only — composited, never `top` nor `height`. Visible at
        // once when it comes; hidden only once it is out. Under
        // `prefers-reduced-motion`, no frame in between: a state, not a
        // slower animation (V15) — the idiom of `SortableWidget`'s wobble.
        transform: shown ? 'none' : 'translateY(-100%)',
        visibility: shown ? 'visible' : 'hidden',
        transition: shown
          ? `transform ${theme.transitions.duration.shortest}ms ${theme.transitions.easing.easeOut},visibility 0s linear 0s`
          : `transform ${theme.transitions.duration.shortest}ms ${theme.transitions.easing.sharp},visibility 0s linear ${theme.transitions.duration.shortest}ms`,
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      <Box
        sx={{
          maxWidth: 1200,
          mx: 'auto',
          display: 'flex',
          // `.vp.ph .cb.ed .cb-in`: in Edit mode on a phone, a column of two
          // lines, 4 px apart, 5 px above and 8 below, as tall as they are.
          flexDirection: editing ? { xs: 'column', sm: 'row' } : 'row',
          alignItems: editing ? { xs: 'stretch', sm: 'center' } : 'center',
          gap: editing ? { xs: '4px', sm: '12px' } : '12px',
          height: editing ? { xs: 'auto', sm: '53px' } : '53px',
          p: editing ? { xs: '5px 16px 8px', sm: '8px 24px' } : { xs: '8px 16px', sm: '8px 24px' },
        }}
      >
        {/* The left of the bar: the page's title at rest — none on a phone,
            where the two halves take the whole line —, « Mode Modifier » and
            the state in Edit mode (`.cb-r1`). */}
        <Box
          sx={{
            display: editing ? 'flex' : { xs: 'none', sm: 'flex' },
            alignItems: 'center',
            justifyContent: { xs: 'space-between', sm: 'flex-start' },
            gap: { xs: '10px', sm: '12px' },
            minHeight: 18,
            minWidth: 0,
            mr: { sm: 'auto' },
          }}
        >
          {editing ? (
            <>
              <Typography
                component="span"
                data-compact-bar-mode
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: 14,
                  lineHeight: 1.3,
                  fontWeight: 700,
                  color: night ? 'primary.light' : 'primary.dark',
                  whiteSpace: 'nowrap',
                }}
              >
                <EditOutlinedIcon sx={{ fontSize: 18, display: { xs: 'none', sm: 'inline-block' } }} />
                {t('dashboard.editMode.label')}
              </Typography>
              {/* The COPY of the header's indicator (A-10.6): the same words,
                  never announced — `aria-hidden`, no role. Mounted empty
                  before the first change, so its line keeps its height. */}
              <Typography
                component="span"
                aria-hidden
                data-compact-bar-status
                sx={{
                  fontSize: `${DASHBOARD_TYPE.chip}px`,
                  lineHeight: 1.3,
                  whiteSpace: 'nowrap',
                  color: saveState === 'error' ? 'error.main' : 'text.secondary',
                  fontWeight: saveState === 'error' ? 600 : 400,
                }}
              >
                {saveState === 'idle' ? '' : t(`dashboard.save.${saveState}`)}
              </Typography>
            </>
          ) : (
            <Typography
              component="span"
              data-compact-bar-title
              sx={{
                fontSize: 17,
                lineHeight: 1.3,
                fontWeight: 700,
                color: 'primary.main',
                whiteSpace: 'nowrap',
              }}
            >
              {t('gardens.title')}
            </Typography>
          )}
        </Box>
        {/* The two buttons (`.cb-r2`): equal halves on a phone, side by side
            from 600 px — the header's own, drawn by the same component. */}
        <Box
          sx={{
            display: { xs: 'grid', sm: 'flex' },
            gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))' },
            gap: { xs: '8px', sm: '12px' },
            flexGrow: { xs: 1, sm: 0 },
          }}
        >
          <PageActionButtons
            editing={editing}
            unavailable={unavailable}
            onEditingChange={onEditingChange}
            onCustomize={onCustomize}
          />
        </Box>
      </Box>
    </Box>
  );
}
