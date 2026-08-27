import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';

/** The criteria the bubble lists, in the order the backend enforces them. */
const RULE_KEYS = [
  'auth.passwordRuleLength',
  'auth.passwordRuleDigit',
  'auth.passwordRuleLower',
  'auth.passwordRuleUpper',
  'auth.passwordRuleSpecial',
] as const;

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  /**
   * Shows the static criteria bubble while the field holds focus. Opt-in: on a
   * form with several password inputs only the one the user COMPOSES needs the
   * rules — repeating them over the confirmation field is noise.
   */
  showRules?: boolean;
}

/**
 * SMA-350 — the auth pages' password input: the same stock MUI `TextField`
 * they already use (label/type/required/fullWidth/value/onChange, no variant,
 * no size) plus two things a bare one cannot do.
 *
 * <b>Hold to reveal.</b> An in-field end adornment appears on the first
 * character typed — never before, so an empty form is unchanged — and reveals
 * the value only while it is actively held. Every way of letting go hides it
 * again: pointer up, pointer leaving the button, a cancelled pointer (a scroll
 * gesture stealing it), the button losing focus, and key up for the keyboard
 * gesture. A toggle would leave a password on screen behind the user's back;
 * a hold cannot.
 *
 * <b>Rules bubble.</b> Optional, static, and shown BEFORE submission — a
 * Tooltip open only while the field is focused. Deliberately not a live
 * checklist: the criteria never change, and what was actually missing is the
 * server's answer to give (the page renders it from the returned codes). The
 * Tooltip portals out of the flow, so opening it shifts nothing.
 */
export default function PasswordField({
  label,
  value,
  onChange,
  showRules = false,
}: PasswordFieldProps) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const [focused, setFocused] = useState(false);

  const reveal = () => setRevealed(true);
  const hide = () => setRevealed(false);

  const field = (
    <TextField
      label={label}
      type={revealed ? 'text' : 'password'}
      required
      fullWidth
      value={value}
      onChange={onChange}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      slotProps={{
        input: {
          endAdornment: value ? (
            <InputAdornment position="end">
              <IconButton
                // Inside a <form>: without this it would default to submit and
                // a press-and-hold would post the form.
                type="button"
                size="small"
                edge="end"
                aria-label={t('auth.showPasswordHold')}
                onPointerDown={reveal}
                onPointerUp={hide}
                onPointerLeave={hide}
                onPointerCancel={hide}
                onBlur={hide}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') reveal();
                }}
                onKeyUp={hide}
              >
                {revealed ? (
                  <Visibility fontSize="small" />
                ) : (
                  <VisibilityOff fontSize="small" />
                )}
              </IconButton>
            </InputAdornment>
          ) : undefined,
        },
      }}
    />
  );

  if (!showRules) return field;

  return (
    <Tooltip
      open={focused}
      placement="top"
      arrow
      describeChild
      title={
        <>
          <Typography variant="caption" component="div" fontWeight={600}>
            {t('auth.passwordRulesTitle')}
          </Typography>
          <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2 }}>
            {RULE_KEYS.map((key) => (
              <Typography key={key} variant="caption" component="li">
                {t(key)}
              </Typography>
            ))}
          </Box>
        </>
      }
    >
      {field}
    </Tooltip>
  );
}
