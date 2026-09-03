import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import { alpha } from '@mui/material/styles';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';

// SMA-414 — every badge is icon + text, never colour alone. Colours derive from
// the theme palette (mode-aware); the Google badge carries the official G
// (public/google-g.svg, the same asset as the OAuth buttons — SMA-57).

const inheritIcon = { '& .MuiChip-icon': { color: 'inherit' } } as const;

/** « Confirmé » (check) or « En attente » (clock) from `emailConfirmed`. */
export const ConfirmationChip = memo(function ConfirmationChip({
  confirmed,
}: {
  confirmed: boolean;
}) {
  const { t } = useTranslation();
  return confirmed ? (
    <Chip
      size="small"
      icon={<CheckCircleOutlinedIcon />}
      label={t('admin.users.confirmed')}
      sx={{
        fontWeight: 600,
        bgcolor: 'brandTintBg',
        color: (theme) =>
          theme.palette.mode === 'dark'
            ? theme.palette.primary.light
            : theme.palette.primary.dark,
        ...inheritIcon,
      }}
    />
  ) : (
    <Chip
      size="small"
      icon={<ScheduleOutlinedIcon />}
      label={t('admin.users.pending')}
      sx={{
        fontWeight: 600,
        bgcolor: (theme) =>
          alpha(
            theme.palette.warning.main,
            theme.palette.mode === 'dark' ? 0.18 : 0.15
          ),
        color: (theme) =>
          theme.palette.mode === 'dark'
            ? theme.palette.warning.light
            : theme.palette.warning.dark,
        ...inheritIcon,
      }}
    />
  );
});

/** « Google » (official G) when a Google login is linked, else « Local » (key) — D2. */
export const AccessChip = memo(function AccessChip({
  hasGoogleLogin,
}: {
  hasGoogleLogin: boolean;
}) {
  const { t } = useTranslation();
  return hasGoogleLogin ? (
    <Chip
      size="small"
      icon={
        <Box
          component="img"
          src="/google-g.svg"
          alt=""
          sx={{ width: 14, height: 14 }}
        />
      }
      label={t('admin.users.google')}
      sx={{ fontWeight: 600, bgcolor: 'surfaceSubtle' }}
    />
  ) : (
    <Chip
      size="small"
      variant="outlined"
      icon={<KeyOutlinedIcon />}
      label={t('admin.users.local')}
      sx={{ fontWeight: 600, ...inheritIcon }}
    />
  );
});

/** « vous » — marks the signed-in admin's own row. */
export const YouChip = memo(function YouChip() {
  const { t } = useTranslation();
  return (
    <Chip
      size="small"
      label={t('admin.users.you')}
      sx={{
        height: 20,
        fontSize: 11,
        fontWeight: 700,
        bgcolor: 'surfaceSubtle',
        color: 'text.secondary',
      }}
    />
  );
});
