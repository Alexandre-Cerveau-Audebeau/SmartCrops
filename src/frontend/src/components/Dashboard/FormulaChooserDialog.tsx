import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Typography from '@mui/material/Typography';
import { formulaRefusalText } from './formulaRefusal';
import { DASHBOARD_TYPE } from '../../theme/dashboardTokens';
import { DASHBOARD_LEVELS, type DashboardLevel, type FormulaRefusal } from '../../types/Dashboard';

interface Props {
  open: boolean;
  /** The account's formula — the one checked. */
  level: DashboardLevel;
  /**
   * A switch of formula is in flight (SMA-448, PR #293, S5): the choice takes
   * no gesture — not even a closing — until the page stands at one formula.
   */
  switching: boolean;
  /** A formula the server refused, with the reasons it served (A1): said here, under the choice. */
  refusal: FormulaRefusal | null;
  /** « Fermer sans changer de formule », Escape, the backdrop. */
  onClose: () => void;
  /** The choice: the page switches the account's formula on the server. */
  onChoose: (level: DashboardLevel) => void;
}

/**
 * SMA-448, lot F2, step N3 — PROVISIONAL: the small choice of formula the
 * Novice page's chip opens, so that a Novice is never trapped in a formula
 * whose page has no « Personnaliser » — the panel was the one door to another
 * formula. Lot F3 builds the real door behind the chip, the choice screen of
 * V3-01 (contract v3 § 4.2: the three offers, their limits, « Conseillé pour
 * vous », « Indisponible » and its reason, « Votre formule — conservée »);
 * this dialog is the closest thing to it that lot F1's switch already
 * supports — the three formulas by name and tagline, the current one checked,
 * the promise of V4 — and F3 replaces its content, not its wiring: the same
 * `setLevel`, the same outcomes said honestly — the refusal and each reason
 * the server served, in a live region born empty and kept mounted (the rule
 * of the panel, A1); the layout that could not be written, by the header's
 * indicator; the layout that could not be read back, by the page's load
 * error, the dialog closed by the page (R2-E1). Nothing is lost in either
 * direction (V4, lot F1).
 */
export default function FormulaChooserDialog({ open, level, switching, refusal, onClose, onChoose }: Props) {
  const { t } = useTranslation();
  const titleId = useId();

  return (
    <Dialog
      open={open}
      // No closing while a switch is on the wire (S5): Escape and the backdrop
      // wait with the choice.
      onClose={switching ? undefined : onClose}
      aria-labelledby={titleId}
      maxWidth="xs"
      fullWidth
      disableScrollLock
    >
      <DialogTitle id={titleId} sx={{ fontWeight: 700 }}>
        {t('dashboard.formulaChooser.title')}
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <Typography sx={{ fontSize: `${DASHBOARD_TYPE.secondary}px`, color: 'text.secondary' }}>
          {t('dashboard.formulaChooser.promise')}
        </Typography>
        {/* The three formulas as the panel lists them: the name, the
            tagline; the group named by the dialog's own title. */}
        <RadioGroup
          aria-labelledby={titleId}
          value={level}
          onChange={(event) => onChoose(event.target.value as DashboardLevel)}
          sx={{ gap: '8px' }}
        >
          {DASHBOARD_LEVELS.map((option) => (
            <FormControlLabel
              key={option}
              value={option}
              disabled={switching}
              control={<Radio size="small" />}
              sx={{
                m: 0,
                p: '12px',
                alignItems: 'flex-start',
                borderRadius: '10px',
                border: '1px solid',
                borderColor: option === level ? 'primary.main' : 'borderSubtle',
              }}
              label={
                <Box>
                  <Typography sx={{ fontSize: `${DASHBOARD_TYPE.body}px`, fontWeight: 700 }}>
                    {t(`dashboard.levels.${option}.name`)}
                  </Typography>
                  <Typography sx={{ fontSize: `${DASHBOARD_TYPE.secondary}px`, color: 'text.secondary' }}>
                    {t(`dashboard.levels.${option}.tagline`)}
                  </Typography>
                </Box>
              }
            />
          ))}
        </RadioGroup>
        {/* The refusal of a formula (A1), said HERE, under the choice the
            user just made, in a live region born EMPTY and kept mounted while
            the dialog is: a region inserted already filled is not announced.
            `polite`, never `assertive`. */}
        <Typography
          role="status"
          aria-live="polite"
          data-formula-chooser-refusal
          sx={{ fontSize: `${DASHBOARD_TYPE.secondary}px`, color: 'error.main' }}
        >
          {formulaRefusalText(refusal, t)}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {/* Named as the choice screen's close button will be (§ 4.2): what
            closing does — nothing. */}
        <Button onClick={onClose} disabled={switching} aria-label={t('dashboard.formulaChooser.close')}>
          {t('common.close')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
