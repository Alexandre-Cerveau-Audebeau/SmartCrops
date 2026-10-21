import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import ReconnectButton from './ReconnectButton';
import type { RequestFailureKind } from '../services/requestFailure';

interface Props {
  /** What the request that did not go through means for the user (`requestFailureKind`). */
  kind: RequestFailureKind;
  /** The caller's own sentence for a failure a retry may cure — translated by the caller, whose button is the retry. */
  fallback: string;
  /** The Alert's `sx`, where a dialog needs a margin under it. */
  sx?: SxProps<Theme>;
}

/** The words: the two sentences every surface shares (R3-E1), or the caller's own. */
function failureText(kind: RequestFailureKind, fallback: string, t: TFunction): string {
  switch (kind) {
    case 'unauthorized':
      return t('common.sessionExpired');
    case 'forbidden':
      return t('common.forbidden');
    default:
      return fallback;
  }
}

/**
 * SMA-457, PR #319, fix round 1 — S3 (CodeRabbit Extension, draw 9792b2b0):
 * the one error Alert of a dialog whose request did not go through, said for
 * what it is (SMA-437, review of the v3, M3 — R3-E1): the session that
 * expired, with the way to sign in again; the right the account lacks; or the
 * caller's own sentence for a failure a retry may cure — never « try again »
 * to a session that is gone. The rename and the deletion of a garden each
 * carried these fourteen lines; one component names a failure in one place,
 * so a fourth kind would be an edit here and nowhere else. For these two
 * dialogs only: the order's region and the formula chooser keep their text
 * alone with the button BESIDE it ([P3]/[P4], the live region's rule), the
 * creation of a garden its Typography with a second button, the planner its
 * toast — other shapes, left as they are.
 */
export default function RequestFailureAlert({ kind, fallback, sx }: Props) {
  const { t } = useTranslation();
  return (
    <Alert severity="error" sx={sx}>
      {failureText(kind, fallback, t)}
      {/* The way back, beside the words — as the planner's toast
          places it (R3-E1, L4). */}
      {kind === 'unauthorized' && (
        <Box component="span" sx={{ display: 'inline-block', ml: 1 }}>
          <ReconnectButton />
        </Box>
      )}
    </Alert>
  );
}
