import { useEffect, useId } from 'react';
import { useTranslation } from 'react-i18next';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import FormulaChoice from './FormulaChoice';
import { useSiteNavbarHeight } from '../../hooks/useSiteNavbarHeight';
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

/** The two axes the screen locks on <html> — each given back as it stood (PR #306, fix round 1, D2). */
const PAGE_AXES = ['overflow-x', 'overflow-y'] as const;

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
  // The site's navbar stands over the page: the panel descends from under
  // it, so the header's title stays in view above the veil.
  const navbar = useSiteNavbarHeight();
  // No way out while mandatory, and none while a switch is on the wire (S5).
  const locked = mandatory || switching;

  // PR #306, fix round 1, D2 (Alexandre's visual pass, 01/10: « il y a 2
  // scrollbars sur le côté de l'écran quand ce dialog container s'ouvre »)
  // — the screen LOCKS THE PAGE under it itself. `scroll="body"` makes its
  // container scroll; `disableScrollLock` (the overlays' rule,
  // `docs/coding-guidelines.md`: nothing shifts on open) left the page
  // scrolling under it, its bar kept by `html { overflow-y: scroll }` — two
  // bars, and the wheel past the screen's end scrolled the page. MUI's lock
  // is decided by the first overlay of the page (`ModalManager.mount`): the
  // Customize panel and the creation dialog take it, the chip and the
  // mandatory screen never did. So a style written on <html> as the screen
  // opens, given back EXACTLY as it closes or unmounts — over the panel left
  // open under it, or the creation dialog « Voir les formules » closes, what
  // stood before stands after. The reserved gutter (`scrollbar-gutter:
  // stable`) keeps the width: nothing moves behind. A style, no state.
  useEffect(() => {
    if (!open) return;
    const style = document.documentElement.style;
    const before = PAGE_AXES.map((axis) => ({ axis, value: style.getPropertyValue(axis), priority: style.getPropertyPriority(axis) }));
    for (const axis of PAGE_AXES) style.setProperty(axis, 'hidden');
    return () => {
      for (const { axis, value, priority } of before) {
        if (value) style.setProperty(axis, value, priority);
        else style.removeProperty(axis);
      }
    };
  }, [open]);

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
      // The content focuses its title, without scrolling (`FormulaChoice`):
      // MUI's own focus of the paper scrolled the overlay past the panel's
      // top margin, and the header was gone. The trap stays.
      disableAutoFocus
      data-formula-choice-dialog
      data-mandatory={mandatory ? 'true' : 'false'}
      slotProps={{
        backdrop: {
          sx: mandatory
            ? { bgcolor: 'background.default' }
            : { bgcolor: tk.scrim, backdropFilter: 'blur(2.5px)', WebkitBackdropFilter: 'blur(2.5px)' },
        },
        // D2 — the one scroll of the screen keeps the wheel at its ends:
        // never passed on to the page under it.
        container: { sx: { overscrollBehavior: 'contain' } },
        paper: {
          sx: {
            // The panel descends enough to let « Mes Jardins » and the chip
            // be seen (V3-01: 104 px on a desktop, 58 on a phone) — under
            // the site's navbar, which the mock-up did not draw. On a phone,
            // 80 rather than 58: measured in Chrome (L7), the title's line
            // box runs from 88 to 130 px under the real navbar, and 58 put
            // the panel's top inside it. From 600 px, 80 rather than 104
            // (PR #297, fix round 1, A2 — Alexandre: « un poil plus haut
            // d'un cran »): one notch up, the same 80 as on a phone — the
            // title's line box ends 138 px down at 600 px and beyond
            // (measured), so 72 put the panel 2 px inside it; 80 leaves it
            // clear above the veil.
            m: { xs: `${navbar + 80}px 12px 24px`, sm: `${navbar + 80}px 24px 40px` },
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
