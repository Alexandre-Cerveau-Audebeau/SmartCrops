import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import FormulaChoice from './FormulaChoice';
import { useDashboardTokens } from '../../theme/useDashboardTokens';
import type { DashboardLevel, FormulaRefusal } from '../../types/Dashboard';

interface Props {
  open: boolean;
  /**
   * SMA-448, lot F3 (N18) — the choice is MANDATORY: the account never chose
   * its formula (`FormulaChosenAt` null). No close button, no Escape, no
   * backdrop click, and nothing of the dashboard to see behind — the veil
   * is the page's own ground. Shown once: the first choice stamps it.
   */
  mandatory: boolean;
  /**
   * A switch of formula is in flight (SMA-448, PR #293, S5): the choice takes
   * no gesture — not even a closing — until the page stands at one formula.
   */
  switching: boolean;
  /** A switch that did not go through, with what the server said (A1, R3-E1): said here, under the offers. */
  refusal: FormulaRefusal | null;
  /** « Fermer sans changer de formule », Escape, the backdrop — never when mandatory. */
  onClose: () => void;
  /** The choice: the page switches the account's formula on the server — « Garder » included, which stamps the choice. */
  onChoose: (level: DashboardLevel) => void;
}

/**
 * SMA-448, lot F3, step L5 — THE CHOICE OF FORMULA behind the chip (V3-01;
 * contract v3 § 4.2), in place of the provisional dialog of lot F2 (N3),
 * whose wiring it keeps — `open`, `switching`, `refusal`, `onClose`,
 * `onChoose`; the page's `setLevel` and its outcomes; the refusal region
 * born empty. The account's formula is the catalogue's to say (`account.
 * formula`, read with the offers), so the `level` of lot F2 is not passed
 * any more. What it decides is HOW the screen opens: over the
 * dashboard, blurred 2.5 px under the scrim token (V3-01, « Changer de
 * formule »: the header and the chip that opened it stay visible under the
 * panel), with its close button; or MANDATORY, the first time, over an
 * opaque ground — no close, no Escape, no backdrop, the focus kept inside by
 * the dialog. The content is `FormulaChoice`.
 */
export default function FormulaChooserDialog({ open, mandatory, switching, refusal, onClose, onChoose }: Props) {
  const { t } = useTranslation();
  const titleId = useId();
  const tk = useDashboardTokens();
  // No way out while mandatory, and none while a switch is on the wire (S5).
  const locked = mandatory || switching;

  return (
    <Dialog
      open={open}
      onClose={locked ? undefined : onClose}
      disableEscapeKeyDown={locked}
      aria-labelledby={titleId}
      maxWidth="lg"
      fullWidth
      scroll="body"
      disableScrollLock
      data-formula-choice-dialog
      data-mandatory={mandatory ? 'true' : 'false'}
      slotProps={{
        backdrop: {
          sx: mandatory
            ? { bgcolor: 'background.default' }
            : { bgcolor: tk.scrim, backdropFilter: 'blur(2.5px)', WebkitBackdropFilter: 'blur(2.5px)' },
        },
        paper: {
          sx: {
            // The panel descends enough to let « Mes Jardins » and the chip
            // be seen (V3-01: 104 px on a desktop, 58 on a phone).
            m: { xs: '58px 12px 24px', sm: '104px 24px 40px' },
            width: { xs: 'calc(100% - 24px)', sm: 'calc(100% - 48px)' },
            maxWidth: 1200,
            borderRadius: { xs: '14px', sm: '18px' },
            border: mandatory ? 0 : '1px solid',
            borderColor: 'borderSubtle',
            boxShadow: mandatory ? 'none' : '0 22px 60px rgba(0,0,0,.34)',
            bgcolor: 'background.default',
            // No elevation overlay at night: the ground is the page's.
            backgroundImage: 'none',
            p: { xs: '20px 14px 24px', sm: '30px 28px 34px' },
            position: 'relative',
            overflow: 'visible',
          },
        },
      }}
    >
      {!mandatory && (
        <IconButton
          data-formula-choice-close
          aria-label={t('dashboard.formulaChooser.close')}
          onClick={onClose}
          disabled={switching}
          sx={{
            position: 'absolute',
            top: { xs: 12, sm: 18 },
            right: { xs: 12, sm: 18 },
            width: { xs: 36, sm: 40 },
            height: { xs: 36, sm: 40 },
            borderRadius: '12px',
            bgcolor: 'surfaceSubtle',
            border: '1px solid',
            borderColor: 'borderSubtle',
            color: 'text.primary',
            '&.Mui-focusVisible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 3 },
          }}
        >
          <CloseIcon />
        </IconButton>
      )}
      <FormulaChoice titleId={titleId} mandatory={mandatory} switching={switching} refusal={refusal} onChoose={onChoose} />
    </Dialog>
  );
}
