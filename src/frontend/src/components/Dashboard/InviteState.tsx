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
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: '12px',
        p: '16px',
        borderRadius: '10px',
        backgroundColor: tk.invBg,
        border: `1px solid ${tk.invBd}`,
      }}
    >
      <Box
        aria-hidden
        sx={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tk.invIcBg,
          color: 'primary.main',
          '& .MuiSvgIcon-root': { fontSize: 24 },
        }}
      >
        {icon}
      </Box>
      <Typography
        sx={{
          fontSize: `${DASHBOARD_TYPE.body}px`,
          lineHeight: 1.45,
          color: 'text.primary',
          maxWidth: 320,
        }}
      >
        {message}
      </Typography>
      {variant === 'invite' && action}
      {variant === 'soon' && (
        <Typography
          sx={{
            fontSize: `${DASHBOARD_TYPE.secondary}px`,
            lineHeight: 1.45,
            color: 'text.secondary',
          }}
        >
          {t('dashboard.soon')}
        </Typography>
      )}
    </Box>
  );
}
