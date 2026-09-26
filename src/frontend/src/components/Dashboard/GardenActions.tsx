import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import type { DashboardGardenData } from '../../types/DashboardData';

/**
 * Padding around an action glyph. 3 px on a 20 px icon gives a 26 px control —
 * above the 24 px floor WCAG 2.2 sets for a target, and exactly the height of
 * the artboards' own `.pill` (26 px), which is what the zone behind the two
 * buttons is.
 */
const ACTION_PAD_PX = '3px';

/**
 * The tinted zone behind the two action glyphs (SMA-336 PR 2/5, round 4,
 * part B).
 *
 * 52 px by 26: two 26 px controls side by side, no gap and no padding, so the
 * tint hugs them exactly and reads as one pill rather than a panel. 26 px is
 * `.pill`'s height and `999px` its radius — the zone is drawn in the artboards'
 * own vocabulary for a small inset, which is the whole point of § 4 of the
 * design contract: the addition must not announce itself.
 *
 * `surfaceSubtle` is the fill: the product's single step away from the card, and
 * the artboards' `--surface` verbatim (`#F2F6F0` by day). § 4 asks for « très
 * légèrement plus clair que la carte » — at night that is literally what it is
 * (`#1E3358` against a `#16294A` card); by day the card is pure white and
 * nothing can be lighter, so the token steps the other way by the same few per
 * cent. It is a theme token in both modes, which is the rule that matters.
 */
const ACTIONS_ZONE_W = 52;

interface Props {
  garden: DashboardGardenData;
  /** The pencil: opens the rename dialog on this garden. */
  onRename: (garden: DashboardGardenData) => void;
  /** The bin: opens the type-the-name deletion on this garden. */
  onDelete: (garden: DashboardGardenData) => void;
}

/**
 * SMA-448, lot F2 — rename and delete, the same two buttons at EVERY size and
 * at EVERY formula, always at the same place (contract V21: « des
 * fonctionnalités PRIMORDIALES », Alexandre 10/09). They were drawn by the
 * Gardens widget alone (SMA-336 PR 2/5, round 2, V12); the Novice page draws
 * them on each of its cards, so one component draws them for both — the same
 * zone, the same glyphs, the same names, by construction.
 *
 * The clicks stop where they are: on a Medium row the zone stands beside a
 * link, and a click on a button must never open the garden.
 */
export default function GardenActions({ garden, onRename, onDelete }: Props) {
  const { t } = useTranslation();
  return (
    // The tinted, borderless, rounded ZONE of § 4: two 26 px controls
    // touching, so the fill hugs them into a 52 x 26 pill — the artboards'
    // own `.pill` box, and no rule anywhere on it.
    <Box
      data-row-actions-zone
      sx={{
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
        width: ACTIONS_ZONE_W,
        borderRadius: '999px',
        backgroundColor: 'surfaceSubtle',
      }}
    >
      <IconButton
        size="small"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onRename(garden);
        }}
        aria-label={`${t('gardens.edit')} ${garden.name}`}
        sx={{
          p: ACTION_PAD_PX,
          color: 'text.secondary',
          '&:hover': { color: 'text.primary' },
        }}
      >
        <EditIcon fontSize="small" />
      </IconButton>
      {/* NEUTRAL at rest, red when the pointer or the keyboard reaches it
          (§ 4). A saturated bin on every row put three alarms in a table the
          frozen design gives no alert colour at all; the warning belongs to the
          moment of acting, not to the moment of looking. `Mui-focusVisible`
          rather than `:focus` so it answers the keyboard and not a click that
          has already left. */}
      <IconButton
        size="small"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onDelete(garden);
        }}
        aria-label={`${t('gardens.delete')} ${garden.name}`}
        sx={{
          p: ACTION_PAD_PX,
          color: 'text.secondary',
          '&:hover': { color: 'error.main' },
          '&.Mui-focusVisible': { color: 'error.main' },
        }}
      >
        <DeleteIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}
