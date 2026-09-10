import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { DASHBOARD_TYPE } from '../../theme/dashboardTokens';
import { useDashboardTokens } from '../../theme/useDashboardTokens';

/**
 * Which kind of empty a widget is in (SMA-336, design report § 8):
 * - `invite` — something the user can DO right now; `action` carries the gesture.
 * - `catalogue` — an honest statement about the data, with no gesture to offer.
 * - `soon` — the widget exists but its data does not ship yet; carries the
 *   « Bientôt disponible » mention instead of a dead control.
 *
 * The distinction is the point of the pattern: an invitation that cannot be
 * acted on is a dead end, and PR 1/5 ships seven widgets whose data lands in
 * later lots. Saying « bientôt » is honest; drawing a field that does nothing
 * is not.
 */
export type InviteVariant = 'invite' | 'catalogue' | 'soon';

interface Props {
  icon: ReactNode;
  message: string;
  variant?: InviteVariant;
  /** Only read for `variant: 'invite'` — the gesture that resolves the state. */
  action?: ReactNode;
}

/**
 * The shared invitation panel of the gardens dashboard: a soft disc, one
 * sentence, and — when there is one — the gesture. Colours come from the frozen
 * invitation motif (`dashboardTokens`), never from a hardcoded hex.
 *
 * The SHAPE comes from the same frozen source (round 2, V5). `_spec.md` § 5's
 * artboards draw `.inv` as a ROW — `display:flex; gap:12px; align-items:
 * flex-start`, a 34px disc that does not shrink, and the text beside it — and
 * this component had been built as a centred column with a 44px disc stacked
 * above the sentence. That stack is ~56px taller for the same words, which is
 * more than a phone card has to spare: the grid rows are 200px there against
 * 273px on a desktop (`DashboardGrid`), so the tinted panel outgrew its card,
 * was clipped by the card's `overflow: hidden`, and read as a frame stretched
 * edge to edge. The row form fits at every breakpoint with no media query, so
 * V3's rule — intrinsic height, centred in the card — holds on a phone too.
 */
export default function InviteState({
  icon,
  message,
  variant = 'invite',
  action,
}: Props) {
  const { t } = useTranslation();
  const tk = useDashboardTokens();

  return (
    <Box
      data-invite-panel
      sx={{
        // NOT `flex: 1` (round 1, V3): the panel takes the height of what it
        // says and sits in the middle of the card, instead of stretching a
        // tinted rectangle over a Large widget. `margin: auto` is what centres
        // it — vertically and horizontally — inside the card's flex column,
        // and the card keeps the grid footprint its size gives it.
        //
        // Unconditional, at every breakpoint (round 2, V5): nothing here is
        // keyed on a media query, so there is no width at which the panel goes
        // back to filling its card.
        m: 'auto',
        width: '100%',
        maxWidth: 360,
        // `.inv` of the frozen artboards, verbatim.
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        p: '14px 16px',
        borderRadius: '12px',
        backgroundColor: tk.invBg,
        border: `1.5px dashed ${tk.invBd}`,
      }}
    >
      <Box
        aria-hidden
        sx={{
          // `.inv-ic`: 34px, and it never shrinks — the text wraps instead.
          width: 34,
          height: 34,
          flexShrink: 0,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tk.invIcBg,
          color: 'primary.main',
          '& .MuiSvgIcon-root': { fontSize: 18 },
        }}
      >
        {icon}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{
            // `.inv-t`.
            fontSize: `${DASHBOARD_TYPE.body}px`,
            lineHeight: 1.4,
            fontWeight: 700,
            color: 'text.primary',
          }}
        >
          {message}
        </Typography>
        {variant === 'invite' && action}
        {variant === 'soon' && (
          <Typography
            sx={{
              // `.inv-b`.
              fontSize: `${DASHBOARD_TYPE.secondary}px`,
              lineHeight: 1.5,
              color: 'text.secondary',
              mt: '4px',
            }}
          >
            {t('dashboard.soon')}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
