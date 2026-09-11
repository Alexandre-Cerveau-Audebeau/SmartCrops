import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { visuallyHidden } from '@mui/utils';
import { useTheme } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import BalconyIcon from '@mui/icons-material/Balcony';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeckIcon from '@mui/icons-material/Deck';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import FilterVintageOutlinedIcon from '@mui/icons-material/FilterVintageOutlined';
import GrassIcon from '@mui/icons-material/Grass';
import YardOutlinedIcon from '@mui/icons-material/YardOutlined';
import type { SvgIconComponent } from '@mui/icons-material';
import DeleteGardenDialog from '../../Garden/DeleteGardenDialog';
import DashboardBlock from '../DashboardBlock';
import ExposureDot from '../ExposureDot';
import GardenThumbnail from '../GardenThumbnail';
import InviteState from '../InviteState';
import MissingDataMark from '../MissingDataMark';
import OccupancyBar from '../OccupancyBar';
import { updateGarden } from '../../../services/gardenApi';
import { DASHBOARD_TYPE } from '../../../theme/dashboardTokens';
import { useDashboardTokens } from '../../../theme/useDashboardTokens';
import type { DashboardSize } from '../../../types/Dashboard';
import type { DashboardGardenData } from '../../../types/DashboardData';
import { formatCount } from '../../../utils/formatNumber';
import { formatRelativeDate } from '../../../utils/formatRelativeDate';
import { useGardenViews } from '../../../hooks/useGardenViews';
import type { GardenView } from '../../../utils/gardenStats';

/** Rows a Medium card shows before it defers the rest to "+N" (_spec.md 4). */
const MEDIUM_ROWS = 3;

/**
 * The glyph a MEDIUM row's type chip carries (round 6, N5-1).
 *
 * `A2Novice.dc.html` draws `<span class="pill type"><svg class="ic" width="14">…
 * </svg>Terrasse</span>` with `.pill.type .ic { color: var(--prim) }`, and the
 * three paths it draws were matched attribute for attribute against
 * `@mui/icons-material`: `terrace` → `Deck`, `balcony` → `Balcony`,
 * `inground` → `Grass`. The artboards never draw a `greenhouse` or an `indoor`
 * garden; rather than invent a glyph for them, those two borrow the Gardens
 * widget's own (`YardOutlined`, the entry of `BLOCK_ICONS`), so no chip is bare
 * and nothing is drawn that the design did not draw somewhere.
 *
 * MEDIUM only: `Main.dc.html`'s table writes the same chips WITHOUT a glyph
 * (`<span class="pill type">Terrasse</span>`), and so does the Large row here.
 */
const TYPE_CHIP_ICONS: Record<string, SvgIconComponent> = {
  terrace: DeckIcon,
  balcony: BalconyIcon,
  inground: GrassIcon,
  greenhouse: YardOutlinedIcon,
  indoor: YardOutlinedIcon,
};

/**
 * Thumbnail box on a Medium row and in the table's identity cell.
 *
 * 48 x 40 on the Medium row, which is `A2Novice.dc.html`'s own
 * `<span class="tbox" style="width: 48px; height: 40px;">` — it was a 48 square
 * here, so a wide plan sat in a box 8 px taller than the artboard's.
 */
const MEDIUM_THUMB_W = 48;
const MEDIUM_THUMB_H = 40;

/**
 * The table's own box (round 5, A10-4): `Main.dc.html` writes
 * `<span class="tbox" style="width: 40px; height: 30px;">` in the identity
 * cell, and the widget drew 34 x 26.
 *
 * It costs the table NOTHING in width, and that is measured rather than hoped
 * for: the thumbnail sits inside the wrapping chip row, whose minimum width is
 * its widest SINGLE item — the ornamental chip, about 85 px (« Ornemental » at
 * 13 px in a 26 px pill with 8 px of padding a side). 40 is not 85, so the
 * identity column's minimum does not move at all; only the row's maximum-content
 * width grows by those 6 px, and a table only reaches its maximum when there is
 * spare room, which six labelled columns plus the 80 px frozen one never leave
 * on a 516 px card.
 *
 * In HEIGHT it costs 4 px a row: the drawing goes from 26 to 30 inside a cell
 * whose content was already about 76 px tall, so the rows grow to about 80.
 */
const TABLE_THUMB_W = 40;
const TABLE_THUMB_H = 30;

/**
 * Padding around an action glyph. 3 px on a 20 px icon gives a 26 px control —
 * above the 24 px floor WCAG 2.2 sets for a target, and exactly the height of
 * the artboards' own `.pill` (26 px), which is what the zone behind the two
 * buttons is.
 */
/**
 * How wide the DESCRIPTION line of the identity cell may ever ask to be
 * (round 5, V18).
 *
 * The two numbers are the identity column of the design contract § 2, measured
 * in the artboards: 130 px on the Gardener table (the MODIFIÉ layout) and 106 on
 * the Expert one (RÉCOLTE, whose own column is wider). A `white-space: nowrap`
 * line contributes its WHOLE text to a table column's preferred width, and the
 * table is inside a horizontal scroller, so one garden with a long description
 * would otherwise widen the identity column for every row and push the table —
 * which is exactly what Alexandre asked not to happen: « plutôt que d'impacter
 * toutes les autres lignes si jamais une seule a une description longue ».
 *
 * The cap also does the second half of the ask — « limiter un peu plus la
 * description visible à l'écran » — while the line still gets the whole column
 * instead of the 40-odd px it had left over beside the date.
 */
const DESCRIPTION_MAX_PX = { gardener: 130, expert: 106 } as const;

const ACTION_PAD_PX = '3px';

/**
 * The tinted zone behind the two action glyphs (round 4, part B).
 *
 * 52 px by 26: two 26 px controls side by side, no gap and no padding, so the
 * tint hugs them exactly and reads as one pill rather than a panel. 26 px is
 * `.pill`'s height and `999px` its radius — the zone is drawn in the artboards'
 * own vocabulary for a small inset, which is the whole point of § 4: the
 * addition must not announce itself.
 *
 * `surfaceSubtle` is the fill: the product's single step away from the card, and
 * the artboards' `--surface` verbatim (`#F2F6F0` by day). § 4 asks for « très
 * légèrement plus clair que la carte » — at night that is literally what it is
 * (`#1E3358` against a `#16294A` card); by day the card is pure white and
 * nothing can be lighter, so the token steps the other way by the same few per
 * cent. It is a theme token in both modes, which is the rule that matters.
 */
const ACTIONS_ZONE_W = 52;

/**
 * The fade, and NOT a rule (round 4, part B).
 *
 * 28 px of `transparent → card` immediately left of the frozen column, inside
 * the 24–32 px § 4 asks for. What it replaces is the 1 px vertical border round
 * 3 put there: a continuous vertical rule is the first thing § 4 rejects — « aucun
 * autre séparateur du produit n'est vertical ; il découpe le widget en deux » —
 * and the hard edge it drew was also what cut a word in half (« Plein so| »),
 * the second rejection. A gradient does the one job the rule was doing, which is
 * to say « the row continues under here », and does it by dimming the text
 * instead of severing it.
 *
 * It is painted by the sticky cell's own `::before` at `right: 100%`, so it
 * travels with the column at every scroll position and needs no second sticky
 * element. `pointerEvents: 'none'` — it sits over the scrolling cells and must
 * not take a click meant for them.
 */
const ACTIONS_FADE_PX = 28;

/**
 * Width the actions column RESERVES in the Large table (round 2, V8; tightened
 * round 3, V14; redrawn round 4, part B).
 *
 * Measured, not chosen: 2 px of left inset, the 52 px zone, 2 px, and the
 * chevron's own 24 px column — the width the artboards give their last column
 * (22 px on `Main`, 24 on `A3Expert`). 2 + 52 + 2 + 24 = 80.
 *
 * § 4 sets the target at « ≈ 52 px au lieu de 80 », reached by STACKING the two
 * glyphs so they occupy one 28 px column beside the chevron's 24. That stack is
 * refused here, and the refusal is arithmetic rather than taste: § 4 also fixes
 * two hard constraints — each target at least 24 px (WCAG 2.2 § 2.5.8) and a
 * 44 px row — and two 24 px targets stacked need 48 px of height with no gap at
 * all, 4 px more than the row has. The § 2.5.8 spacing exception does not rescue
 * it either: undersized targets are exempt only when a 24 px circle centred on
 * each does not meet its neighbour's, and two controls sharing a 44 px row have
 * their centres 22 px apart. § 4 says what to do when the two cannot both hold —
 * « NE FORCE PAS : garde l'alignement horizontal resserré, dis-le avec la
 * mesure » — so the pair stays side by side and the 80 px stands.
 *
 * It is DECLARED because the column is sticky, and a sticky column is still a
 * column: its width is counted in the layout, so at full scroll-right the last
 * data cell stops just before it instead of running underneath.
 */
const ACTIONS_COL_PX = 80;

/**
 * The frozen actions column (round 2, V8) — the header cell and every body cell
 * carry it, so the column stays put while the rest of the table scrolls.
 *
 * `position: sticky` and NOT an overlay, which is the whole point: a sticky
 * cell is still laid out as a cell, so its width is subtracted from the row
 * once and for all. Scrolled fully right, it sits at its own natural place and
 * the last data cell stops just before it — nothing is left underneath. An
 * absolutely positioned button strip would reserve nothing and would sit on top
 * of the last column forever, which is exactly what this is not.
 *
 * `backgroundColor` is the card's own paper, opaque in day and in night. While
 * the table is scrolled short of the end the data cells DO pass under this
 * column, and a translucent fill would let their text show through it — the
 * defect is worst on the dark theme, where the text is light and the card is
 * dark.
 *
 * What says « the row continues behind here » is now the FADE and no longer a
 * border (round 4, part B): see {@link ACTIONS_FADE_PX}. Only the horizontal
 * row rule is left, which every other cell of the table draws too.
 *
 * Both colours are resolved by the CALLER and written into the shorthand, which
 * is the only form that survives MUI's system here (round 3, V16). Two others
 * were measured and do not: `borderBottomColor: 'borderSubtle'` reaches CSS
 * unresolved, because the system maps `borderColor` through the palette and
 * passes the longhands straight through; and a `(theme) => ...` callback on such
 * a longhand is dropped outright, leaving no declaration at all.
 */
const stickyActionsSx = (rule: string, paper: string) => ({
  position: 'sticky' as const,
  right: 0,
  // Above the scrolling cells, below MUI's own overlays (Tooltip, Popover).
  zIndex: 1,
  width: ACTIONS_COL_PX,
  minWidth: ACTIONS_COL_PX,
  backgroundColor: paper,
  borderBottom: `1px solid ${rule}`,
  '&::before': {
    content: '""',
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    right: '100%',
    width: ACTIONS_FADE_PX,
    pointerEvents: 'none' as const,
    background: `linear-gradient(to right, transparent, ${paper})`,
  },
});

interface Props {
  size: DashboardSize;
  editing?: boolean;
  gardens: DashboardGardenData[];
  loading: boolean;
  loadError: boolean;
  /**
   * A replacement is in flight while the error (or the figures) is still on
   * screen (round 7, S33 — Extension #7-17): the Retry button says so by
   * disabling itself, instead of taking a click that changed nothing visible.
   */
  refreshing?: boolean;
  /**
   * Whether the WEATHER and HARVEST columns belong on the Large table.
   *
   * The frozen design ties them to their own widgets: a column for data the user
   * has taken off their dashboard is a column of nothing. The page passes what
   * the layout says.
   */
  showWeatherColumn?: boolean;
  showHarvestColumn?: boolean;
  /** Opens the page create dialog - the same one the header button opens. */
  onCreateClick: () => void;
  /** Re-runs the dashboard fetch after a failed load or a rename. */
  onChanged: () => void;
  /** A deletion the backend confirmed: the page toasts and re-fetches. */
  onDeleted: () => void;
  /** "+N" - the rest of the list is reached by growing the widget. */
  onExpand: () => void;
}

/**
 * SMA-336 PR 2/5 — the Gardens widget, now fed by the transport aggregate.
 *
 * PR 1/5 shipped it against `GET /api/gardens`, which serves a garden's name,
 * its dates and its distinct plants and nothing else — so the cards carried what
 * that DTO honestly held. `GET /api/dashboard` carries the PLAN, and everything
 * the frozen design asks for follows from it: the thumbnail, the occupancy bar,
 * the dominant exposure, the free-cell count.
 *
 * Small is unchanged — the design does not revisit it. Medium gains the
 * thumbnail, the type chip and the ornamental chip. Large stops being a grid of
 * cards and becomes the six-column comparison table.
 *
 * The rename, the type-the-name deletion and their dialogs are MOVED here
 * untouched, aria-labels included. They cost four review rounds to get right and
 * this lot has no reason to spend them again.
 *
 * WEATHER and HARVEST render a marker with NO gesture (decision D10). The design
 * gives the unlocated weather cell an « Add » link, but the geocoding endpoint
 * behind it lands in PR 3/5 — and PR 1/5 settled the doctrine: a control that
 * accepts a city and does nothing with it is worse than saying « soon ».
 */
export default function GardensBlock({
  size,
  editing,
  gardens,
  loading,
  loadError,
  refreshing = false,
  showWeatherColumn = false,
  showHarvestColumn = false,
  onCreateClick,
  onChanged,
  onDeleted,
  onExpand,
}: Props) {
  // ONE locale source (round 6, Extension #5-9 / #5-10): this widget formatted
  // counts with `i18n.language` and dates with a `language` prop the page
  // derived from its own provider, and the two disagree for one render after a
  // switch — a French date beside an English-grouped count in one cell. Every
  // figure reads i18next's now, which is what `t()` beside it reads too; the
  // prop is gone from this widget and from `GardenRow`.
  const { t, i18n } = useTranslation();
  const tk = useDashboardTokens();
  // The table's own rule and card colours, resolved once — see
  // `stickyActionsSx` for why they cannot be left as system strings.
  const palette = useTheme().palette;
  const ruleColor = palette.borderSubtle;
  const paperColor = palette.background.paper;

  // ONE derivation per garden, shared with Statistics and reused across every
  // render of this widget (round 1, E10 / G4 / E22). It used to run inline in
  // `GardenRow`, so the rename dialog's own `setEditName` re-ran the exposure
  // engine once per garden per keystroke.
  const views = useGardenViews(gardens);

  const [mutationError, setMutationError] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  const [editingGarden, setEditingGarden] = useState<DashboardGardenData | null>(
    null
  );
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // The deletion target OUTLIVES the dialog open flag (the MyGardens idiom):
  // every close path only flips `deleteOpen`, so the fading dialog keeps its
  // name, count and (disarmed) button instead of collapsing mid-transition.
  const [deleteTarget, setDeleteTarget] = useState<DashboardGardenData | null>(
    null
  );
  const [deleteOpen, setDeleteOpen] = useState(false);

  /**
   * EVERY way the rename dialog closes (round 1, E9 / G4). Clearing the error
   * here is the point: it is raised inside a modal, so leaving it behind put a
   * failure message on the widget frame with no subject left to explain it.
   */
  const closeEditDialog = () => {
    // Not while the rename is in flight (round 2, E'5 / N2). The Save button is
    // disabled, but the backdrop and Escape still reach this handler: closing
    // there unmounts the Dialog the error Alert lives in, so a rename that then
    // fails is reported nowhere at all. Same contract as `closeCreateDialog` in
    // GardensDashboard.tsx — the widget and the page close the same way.
    if (isMutating) return;
    setEditingGarden(null);
    setMutationError(false);
  };

  const handleEdit = async () => {
    if (!editingGarden || isMutating) return;
    setIsMutating(true);
    setMutationError(false);
    try {
      await updateGarden(
        editingGarden.id,
        editName,
        editDescription || undefined
      );
      // Clears the state directly: `isMutating` is still true here (it falls in
      // the `finally`), so the guarded close would refuse to run.
      setEditingGarden(null);
      setMutationError(false);
      onChanged();
    } catch {
      setMutationError(true);
    } finally {
      setIsMutating(false);
    }
  };

  const openEditDialog = (garden: DashboardGardenData) => {
    setEditingGarden(garden);
    setEditName(garden.name);
    setEditDescription(garden.description ?? '');
    setMutationError(false);
  };

  const openDeleteDialog = (garden: DashboardGardenData) => {
    setDeleteTarget(garden);
    setDeleteOpen(true);
  };

  // Most recently touched garden - the Small card subject, and where its arrow
  // leads. `updatedAt` is the one freshness signal every size can rely on.
  //
  // Compared as INSTANTS, not as strings (round 6, Extension #4-9):
  // `System.Text.Json` omits zero fractional seconds, so « 10:00:00Z » sorts
  // AFTER the later « 10:00:00.1Z » in a string comparison.
  //
  // And a wire value `Date.parse` cannot read counts as the OLDEST, not as the
  // winner (round 7, S30 — Extension #7-11): the seed branch accepted a first
  // garden whose `updatedAt` parsed to `NaN`, and every later `>` against
  // `NaN` is false, so that garden was named for good whatever the others'
  // timestamps said.
  const instant = (garden: DashboardGardenData) => {
    const parsed = Date.parse(garden.updatedAt);
    return Number.isNaN(parsed) ? -Infinity : parsed;
  };
  const lastModified = gardens.reduce<DashboardGardenData | null>(
    (latest, garden) =>
      !latest || instant(garden) > instant(latest) ? garden : latest,
    null
  );

  const plannerPath = (garden: DashboardGardenData) =>
    `/gardens/${garden.id}/planner`;

  const typeLabel = (garden: DashboardGardenData) =>
    garden.config.gardenType
      ? t(`planner.config.type.${garden.config.gardenType}`)
      : null;

  /** The Medium row's type-chip glyph — see `TYPE_CHIP_ICONS`. */
  const typeChipIcon = (garden: DashboardGardenData) => {
    const Icon = garden.config.gardenType
      ? TYPE_CHIP_ICONS[garden.config.gardenType]
      : undefined;
    return Icon ? <Icon /> : undefined;
  };

  /**
   * The header chip, FILLED (round 5, A10-5).
   *
   * `Main.dc.html` l. 146 — `.pill.n { background: var(--pill-bg); color:
   * var(--pill-tx) }` — and the artboard writes it `<span class="pill n num">3
   * jardins</span>`. It was an MUI outline, which is a different object: a
   * bordered ghost where the design draws a tinted lozenge. Every header chip
   * of the page moves together, on the two tokens.
   */
  const countChip = (
    <Chip
      label={t('dashboard.blocks.gardens.count', { count: gardens.length })}
      size="small"
      sx={{
        height: DASHBOARD_TYPE.chipHeight,
        fontSize: DASHBOARD_TYPE.chip,
        fontWeight: 700,
        backgroundColor: tk.pillBg,
        color: tk.pillText,
      }}
    />
  );

  /**
   * The « Ornemental » chip, in the two forms the artboards draw it (round 6,
   * N5-1 and N5-2): on a Medium row with a 13 px `FilterVintageOutlined` in
   * front (`A2Novice.dc.html`, `<span class="pill orn"><svg class="ic"
   * width="13">…</svg>Ornemental</span>`), in the table without a glyph and
   * 24 px high (`Main.dc.html`, `.tbl .pill { height: 24px }`).
   */
  const ornamentalChip = (
    garden: DashboardGardenData,
    where: 'medium' | 'table' = 'medium'
  ) =>
    garden.isEdible === false ? (
      <Chip
        label={t('dashboard.blocks.gardens.ornamental')}
        size="small"
        icon={where === 'medium' ? <FilterVintageOutlinedIcon /> : undefined}
        sx={{
          height:
            where === 'table'
              ? DASHBOARD_TYPE.tableChipHeight
              : DASHBOARD_TYPE.chipHeight,
          fontSize: DASHBOARD_TYPE.chip,
          backgroundColor: tk.ornBg,
          color: tk.ornText,
          // `.pill.orn` has no `.ic` rule of its own: the glyph takes the chip's
          // text colour, which MUI would otherwise repaint in its default grey.
          '& .MuiChip-icon': { color: 'inherit', fontSize: 13, ml: '8px', mr: '-2px' },
        }}
      />
    ) : null;

  /**
   * Rename and delete — the same two buttons at EVERY size (round 2, V12).
   *
   * They were on the Large table only, which is what the frozen design draws.
   * But the Novice preset shows this widget in Medium, so a Novice account had
   * no way at all to rename or delete a garden from the dashboard — and both
   * are primary gestures of the page. Documented amendment to the frozen
   * design: they come back on the Medium row, in the same place, so the two
   * sizes have one trailing structure and the buttons never move under the
   * cursor when a widget is resized.
   */
  const gardenActions = (garden: DashboardGardenData) => (
    // The tinted, borderless, rounded ZONE of § 4 (round 4, part B): two 26 px
    // controls touching, so the fill hugs them into a 52 x 26 pill — the
    // artboards' own `.pill` box, and no rule anywhere on it.
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
          openEditDialog(garden);
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
          openDeleteDialog(garden);
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

  /**
   * The trailing group of a row: rename, delete, chevron — in that order, at
   * that place, at both sizes (round 2, V12).
   *
   * The chevron used to live INSIDE the Medium row's link. It cannot stay
   * there: a button inside an anchor is invalid content, and the buttons have
   * to come before the chevron. Moving it out is what lets the two sizes share
   * this one group.
   */
  const rowTrailing = (garden: DashboardGardenData) => (
    <Box
      data-row-actions
      sx={{
        display: 'flex',
        alignItems: 'center',
        // 2 px between the zone and the chevron: 2 + 52 + 2 + 24 = the 80 px
        // the column declares (see `ACTIONS_COL_PX`).
        gap: '2px',
        flexShrink: 0,
      }}
    >
      {gardenActions(garden)}
      {/* V15 — the chevron OPENS the garden.

          It never did. It was drawn with `pointerEvents: 'none'`, so a click
          went straight through it, and round 2 made that visible by moving it
          out of the Medium row's link to put the two buttons before it: what
          used to be an inert glyph on a clickable row became an inert glyph on
          nothing. On the Large table it was inert from the first commit.

          A link, then, to the same place the garden's name leads. `aria-hidden`
          and out of the tab order deliberately: the row already exposes ONE
          focusable link named « Open <garden> », and a second tab stop per row
          with the same destination is noise for a keyboard and for a screen
          reader. What it adds is the pointer affordance the arrow was already
          promising. */}
      <Box
        component={RouterLink}
        to={plannerPath(garden)}
        aria-hidden="true"
        tabIndex={-1}
        data-row-chevron
        sx={{
          display: 'flex',
          alignItems: 'center',
          // Its own 24 px column, as the artboards give it (22 px on `Main`,
          // 24 on `A3Expert`) and as § 4 requires it to keep.
          justifyContent: 'center',
          width: 24,
          flexShrink: 0,
          color: 'text.disabled',
          textDecoration: 'none',
          '&:hover': { color: 'text.secondary' },
        }}
      >
        <ChevronRightIcon fontSize="small" />
      </Box>
    </Box>
  );

  const smallBody = () => (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <Box>
        <Typography
          sx={{ fontSize: DASHBOARD_TYPE.big, fontWeight: 800, lineHeight: 1.1 }}
        >
          {formatCount(gardens.length, i18n.language)}
        </Typography>
        <Typography
          sx={{ fontSize: DASHBOARD_TYPE.secondary, color: 'text.secondary' }}
        >
          {t('dashboard.blocks.gardens.count', { count: gardens.length })}
        </Typography>
      </Box>
      {/* THE CARD NAMES ITS GARDEN (round 5, A10-3).

          It never did: the Small card carried a count, « Modifié il y a 4 mois »
          and a chevron labelled « Ouvrir le dernier jardin modifié », so the one
          thing it did not say was WHICH garden it was about to open. § 5 of the
          design contract: « un accès qui ne nomme pas sa destination est un
          défaut ».

          The MINIMUM, deliberately. The Small card's redesign — a compact list
          of two or three named gardens, the carousel — is SMA-432 and is not
          touched here: this puts the name above the line the date already
          occupied, puts it in the chevron's accessible label, and stops. */}
      {lastModified && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            minWidth: 0,
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography
              sx={{
                fontSize: DASHBOARD_TYPE.gardenName,
                fontWeight: 700,
                lineHeight: 1.25,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {lastModified.name}
            </Typography>
            <Typography
              sx={{
                fontSize: DASHBOARD_TYPE.secondary,
                color: 'text.secondary',
              }}
            >
              {t('dashboard.blocks.gardens.lastModified', {
                when: formatRelativeDate(
                  new Date(lastModified.updatedAt),
                  new Date(),
                  i18n.language,
                  'short'
                ),
              })}
            </Typography>
          </Box>
          <IconButton
            component={RouterLink}
            to={plannerPath(lastModified)}
            size="small"
            sx={{ flexShrink: 0 }}
            aria-label={t('dashboard.blocks.gardens.openLastNamed', {
              name: lastModified.name,
            })}
          >
            <ChevronRightIcon />
          </IconButton>
        </Box>
      )}
    </Box>
  );

  const mediumBody = () => {
    const shown = gardens.slice(0, MEDIUM_ROWS);
    const remaining = gardens.length - shown.length;
    return (
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          // Bounded, like every other list body (V7): three rows and two links
          // fit a Medium card, but a long garden name wrapping is enough to
          // make them not, and the answer to that is a scrollbar inside the
          // card — never a line drawn under it.
          overflowY: 'auto',
          // A plain column (round 6, N5-8): `A2Novice.dc.html` stacks its rows
          // in `display: flex; flex-direction: column` with `padding: 6px 0`
          // on each row and the `.dv` rule between them, and pushes the link
          // to the bottom with `margin-top: auto`. The body had
          // `space-evenly` and an 8 px gap instead, which floated the rules
          // between the rows rather than seating them.
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {shown.map((garden, index) => (
          <Fragment key={garden.id}>
            {/* THE RULE BETWEEN ROWS (round 5, A10-2). `A2Novice.dc.html` lays
                a `<div class="dv"></div>` between each pair of rows —
                `.dv { height: 1px; background: var(--divider) }` — and the
                widget had nothing at all, so three rows of a thumbnail, a name
                and two chips ran into one another.

                BETWEEN, never before the first or after the last: the artboard
                closes its list on the last row, and a rule under that one would
                read as a rule under the widget. `--divider` and `--card-bd` are
                the same value in both themes, which is the `borderSubtle` the
                table's own row rules already draw. */}
            {index > 0 && (
              <Box
                data-row-divider
                sx={{ height: '1px', backgroundColor: 'borderSubtle' }}
              />
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', py: '6px' }}>
              {/* The description, for zero pixels (round 2). The Large table gives
                  it a truncated line of its own; a Medium row is a single 44 px
                  line and has none to spare, so the row's own link carries it as
                  a tooltip. `describeChild` writes the text into the link's
                  `title`, which is what makes it the link's accessible
                  DESCRIPTION — put on the name span instead, it would describe a
                  node no assistive technology stops on. Same touch delays as the
                  table: on a phone there is no hover, and a long-press is how the
                  text is reached. */}
              <MaybeTooltip description={garden.description}>
                <Box
                  component={RouterLink}
                  to={plannerPath(garden)}
                  aria-label={t('dashboard.blocks.gardens.open', {
                    name: garden.name,
                  })}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    // `A2Novice.dc.html`: `gap: 12px` between the thumbnail, the
                    // name group and the count pill.
                    gap: '12px',
                    flex: 1,
                    minWidth: 0,
                    minHeight: 44,
                    px: '8px',
                    borderRadius: '8px',
                    textDecoration: 'none',
                    color: 'inherit',
                    '&:hover': { backgroundColor: 'surfaceSubtle' },
                  }}
                >
                  <GardenThumbnail
                    garden={garden}
                    maxW={MEDIUM_THUMB_W}
                    maxH={MEDIUM_THUMB_H}
                  />
                  {/* The artboard's own middle group: `flex: 1; min-width: 0;
                      display: flex; align-items: center; gap: 10px; overflow:
                      hidden` — the name and the chips share ONE line and yield
                      together, which is why the chips clip rather than push the
                      name out. */}
                  <Box
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      overflow: 'hidden',
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: DASHBOARD_TYPE.gardenName,
                        fontWeight: 700,
                        // `.gname { line-height: 1.25 }` (round 6, N5-10).
                        lineHeight: 1.25,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {garden.name}
                    </Typography>
                    {/* NO sub-line under the name (round 4, A4). The row carried
                        « N plantes · M var. » there; `A2Novice.dc.html` puts the
                        count in the green pill at the end of the row and leaves
                        the name on a line of its own. A second line also made the
                        row taller than the 44 px the artboard draws, which is
                        what pushed three rows and two links past a Medium card. */}
                    <Box
                      sx={{
                        display: 'flex',
                        gap: '6px',
                        minWidth: 0,
                        overflow: 'hidden',
                        alignItems: 'center',
                      }}
                    >
                      {typeLabel(garden) && (
                        <Chip
                          label={typeLabel(garden)}
                          size="small"
                          variant="outlined"
                          // The type's glyph, primary-coloured, 14 px (N5-1):
                          // `.pill.type .ic { color: var(--prim) }`.
                          icon={typeChipIcon(garden)}
                          sx={{
                            height: DASHBOARD_TYPE.chipHeight,
                            fontSize: DASHBOARD_TYPE.chip,
                            // `.pill.type { border: 1px solid var(--chip-bd) }`
                            borderColor: tk.chipBorder,
                            '& .MuiChip-icon': {
                              color: 'primary.main',
                              fontSize: 14,
                              ml: '8px',
                              mr: '-2px',
                            },
                          }}
                        />
                      )}
                      {ornamentalChip(garden, 'medium')}
                    </Box>
                  </Box>
                  {/* The GREEN count pill, right-aligned (round 4, A4):
                      `<span class="pill ok num">50 plantes</span>`. Its colours
                      are the artboards' `--chip-ok-bg` / `--chip-ok-tx` in both
                      modes, carried as tokens like every other dashboard fill. */}
                  <Chip
                    label={t('gardens.plantsCount', {
                      count: garden.placementCount,
                    })}
                    size="small"
                    sx={{
                      flexShrink: 0,
                      height: DASHBOARD_TYPE.chipHeight,
                      fontSize: DASHBOARD_TYPE.chip,
                      fontWeight: 700,
                      backgroundColor: tk.okBg,
                      color: tk.okText,
                    }}
                  />
                </Box>
              </MaybeTooltip>
              {rowTrailing(garden)}
            </Box>
          </Fragment>
        ))}
        {/* `<div style="margin-top: auto"><span class="lnk">[+] Créer un
            jardin</span></div>` — the artboard seats the link at the bottom of
            the card and gives it the `Add` glyph. */}
        <Box sx={{ mt: 'auto', display: 'flex', flexDirection: 'column', pt: '6px' }}>
          {remaining > 0 && (
            <Button
              size="small"
              onClick={onExpand}
              sx={{ alignSelf: 'flex-start', fontSize: DASHBOARD_TYPE.link }}
            >
              {t('dashboard.blocks.gardens.more', { count: remaining })}
            </Button>
          )}
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={onCreateClick}
            sx={{ alignSelf: 'flex-start', fontSize: DASHBOARD_TYPE.link }}
          >
            {t('gardens.createGarden')}
          </Button>
        </Box>
      </Box>
    );
  };

  /**
   * The comparison table (_spec.md 7). Six labelled columns plus the chevron —
   * the frozen design's own arbitration, measured: seven labelled columns need
   * 590 px and a Large card offers 516.
   *
   * The thumbnail lives in the identity cell and steps aside when HARVEST is
   * shown, exactly as the design has it: that column is the wider one, and the
   * cell cannot carry both.
   */
  const largeBody = () => {
    const headers = [
      t('dashboard.blocks.gardens.columns.garden'),
      t('dashboard.blocks.gardens.columns.plants'),
      t('dashboard.blocks.gardens.columns.occupancy'),
      t('dashboard.blocks.gardens.columns.exposure'),
      ...(showWeatherColumn
        ? [t('dashboard.blocks.gardens.columns.weather')]
        : []),
      ...(showHarvestColumn
        ? [t('dashboard.blocks.gardens.columns.harvest')]
        : [t('dashboard.blocks.gardens.columns.modified')]),
      // NO trailing empty entry (round 1, E9 / G2). The actions column has its
      // own `th` below, with the screen-reader label this list cannot carry, so
      // a placeholder here emitted a SEVENTH header for six body cells: every
      // header after EXPOSURE sat one column right of the cells it named, and
      // assistive technology read the actions cell under « MODIFIED ».
    ];

    return (
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <Box
          component="table"
          // NAMED (round 7, S35 — Extension #8-5): with column headers and no
          // name, a screen reader reaching this table from the rotor announced
          // an unnamed table, with nothing to say which widget it belongs to.
          // The widget's own title, which is the name the card above carries.
          aria-label={t('dashboard.blocks.gardens.title')}
          sx={{
            width: '100%',
            // `separate` rather than `collapse` (round 2, V8). Under
            // `border-collapse: collapse` the borders belong to the TABLE, not
            // to the cell that declares them, so they do not travel with a
            // sticky cell: the actions column would slide out from under its
            // own rules and leave them behind on the scrolling content.
            // `borderSpacing: 0` keeps the grid drawn exactly as before — each
            // cell paints its own bottom rule, and adjacent rules meet.
            borderCollapse: 'separate',
            borderSpacing: 0,
            tableLayout: 'auto',
          }}
        >
          <Box component="thead">
            <Box component="tr">
              {headers.map((label, index) => (
                <Box
                  component="th"
                  key={index}
                  scope="col"
                  sx={{
                    textAlign: 'left',
                    // 11px capitals: one of the three sizes the frozen design
                    // allows under 14, and the reason is measured — six labelled
                    // columns plus a chevron only fit a 516 px card at this size.
                    //
                    // The rest is `.tbl .th` verbatim (round 6, N5-4):
                    // `font-weight: 800; letter-spacing: 0.02em; line-height:
                    // 1.25; padding: 0 10px 10px 0; align-self: end`. The
                    // header wrote 700 / 0.04em with 4 px above and below.
                    fontSize: 11,
                    lineHeight: 1.25,
                    fontWeight: 800,
                    letterSpacing: '0.02em',
                    textTransform: 'uppercase',
                    color: 'text.secondary',
                    pt: 0,
                    pr: '10px',
                    pb: '10px',
                    pl: 0,
                    verticalAlign: 'bottom',
                    borderBottom: '1px solid',
                    borderColor: 'borderSubtle',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {label}
                </Box>
              ))}
              <Box
                component="th"
                scope="col"
                sx={stickyActionsSx(ruleColor, paperColor)}
              >
                <Box component="span" sx={visuallyHidden}>
                  {t('dashboard.blocks.gardens.columns.actions')}
                </Box>
              </Box>
            </Box>
          </Box>
          <Box component="tbody">
            {gardens.map((garden) => (
              <GardenRow
                key={garden.id}
                garden={garden}
                view={views.get(garden.id)}
                showWeatherColumn={showWeatherColumn}
                showHarvestColumn={showHarvestColumn}
                typeLabel={typeLabel(garden)}
                ornamental={ornamentalChip(garden, 'table')}
                actions={rowTrailing(garden)}
                plannerPath={plannerPath(garden)}
              />
            ))}
          </Box>
        </Box>
      </Box>
    );
  };

  const body = () => {
    if (loading) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} variant="rounded" height={56} />
          ))}
        </Box>
      );
    }

    if (loadError) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Typography
            sx={{ fontSize: DASHBOARD_TYPE.body, color: 'text.secondary' }}
          >
            {t('gardens.error')}
          </Typography>
          <Button size="small" onClick={onChanged} disabled={refreshing}>
            {t('dashboard.retry')}
          </Button>
        </Box>
      );
    }

    if (gardens.length === 0) {
      return (
        <InviteState
          icon={<YardOutlinedIcon />}
          message={t('gardens.noGardens')}
          action={
            <Button variant="contained" size="small" onClick={onCreateClick}>
              {t('gardens.createGarden')}
            </Button>
          }
        />
      );
    }

    if (size === 'small') return smallBody();
    if (size === 'medium') return mediumBody();
    return largeBody();
  };

  return (
    <DashboardBlock
      blockKey="gardens"
      title={t('dashboard.blocks.gardens.title')}
      size={size}
      editing={editing}
      chip={!loading && !loadError && gardens.length > 0 ? countChip : undefined}
    >
      {body()}

      <Dialog
        open={editingGarden !== null}
        onClose={closeEditDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{t('gardens.editDialogTitle')}</DialogTitle>
        <DialogContent>
          {mutationError && (
            <Alert severity="error" sx={{ mb: 1 }}>
              {t('gardens.mutationError')}
            </Alert>
          )}
          <TextField
            label={t('gardens.gardenName')}
            fullWidth
            required
            slotProps={{ htmlInput: { maxLength: 100 } }}
            value={editName}
            onChange={(event) => setEditName(event.target.value)}
            disabled={isMutating}
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            label={t('gardens.description')}
            fullWidth
            multiline
            rows={3}
            slotProps={{ htmlInput: { maxLength: 500 } }}
            value={editDescription}
            onChange={(event) => setEditDescription(event.target.value)}
            disabled={isMutating}
          />
        </DialogContent>
        <DialogActions>
          {/* Round 3 (N'1): while `closeEditDialog` refuses to close, the
              dialog has to SAY that it is working. Cancel disabled, the fields
              disabled and a spinner on Save — the same pending shape as
              DeleteGardenDialog, so the two dialogs read alike.

              Round 4 (E'''2): all of that is SILENT. The spinner is
              `aria-hidden` and `aria-busy` sits on a disabled button, which
              assistive technology does not announce — so a screen-reader user
              met a dialog that refused to close and said nothing. This region
              is what speaks. It stays MOUNTED and empty when idle: a live
              region inserted at the same moment as its text is announced
              unreliably, one that is already there is not. */}
          <Typography
            role="status"
            aria-live="polite"
            variant="body2"
            color="text.secondary"
            sx={{ mr: 'auto', pl: 1 }}
          >
            {isMutating ? t('gardens.savingStatus') : ''}
          </Typography>
          <Button onClick={closeEditDialog} disabled={isMutating}>
            {t('gardens.cancel')}
          </Button>
          <Button
            variant="contained"
            disabled={isMutating || !editName.trim()}
            aria-busy={isMutating}
            startIcon={
              isMutating ? (
                <CircularProgress size={18} color="inherit" aria-hidden="true" />
              ) : undefined
            }
            onClick={handleEdit}
          >
            {t('gardens.save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm (SMA-18 lot 1): type-the-name brake. The aggregate
          counts the DISTINCT placed varieties itself, which is the same number
          the list DTO's `plants` array used to carry. */}
      <DeleteGardenDialog
        open={deleteOpen}
        gardenId={deleteTarget?.id ?? ''}
        gardenName={deleteTarget?.name ?? ''}
        summary={{ kind: 'list', plants: deleteTarget?.varietyCount ?? 0 }}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => {
          setDeleteOpen(false);
          onDeleted();
        }}
      />
    </DashboardBlock>
  );
}

/**
 * The description tooltip, or the child untouched (round 2).
 *
 * A `Tooltip` with an empty title still wraps its child in a focus/hover
 * listener and still writes an empty `title`, so « no description » has to mean
 * « no tooltip » and not « a tooltip that says nothing ».
 */
function MaybeTooltip({
  description,
  children,
}: {
  description: string | null;
  children: React.ReactElement;
}) {
  if (!description) return children;
  return (
    <Tooltip
      title={description}
      enterTouchDelay={0}
      leaveTouchDelay={6000}
      describeChild
    >
      {children}
    </Tooltip>
  );
}

interface RowProps {
  garden: DashboardGardenData;
  /** Derived once for the whole page — see `useGardenViews`. */
  view: GardenView | undefined;
  showWeatherColumn: boolean;
  showHarvestColumn: boolean;
  typeLabel: string | null;
  ornamental: React.ReactNode;
  actions: React.ReactNode;
  plannerPath: string;
}

/** One line of the comparison table. */
function GardenRow({
  garden,
  view,
  showWeatherColumn,
  showHarvestColumn,
  typeLabel,
  ornamental,
  actions,
  plannerPath,
}: RowProps) {
  const { t, i18n } = useTranslation();
  const palette = useTheme().palette;
  const ruleColor = palette.borderSubtle;
  const paperColor = palette.background.paper;
  const { chipBorder } = useDashboardTokens();

  const cellSx = {
    // >= 44px rows (_spec.md 3): the line is a touch target as much as a row.
    // `height`, not `min-height` (round 7, S45 — Extension #8-7): CSS leaves
    // `min-height` on a table cell undefined and browsers ignore it, so the
    // 44 px were declared and never enforced. On a table cell `height` IS the
    // minimum — a taller content still grows the row.
    height: 44,
    py: '6px',
    pr: '8px',
    borderBottom: '1px solid',
    borderColor: 'borderSubtle',
    fontSize: DASHBOARD_TYPE.body,
    verticalAlign: 'middle',
  } as const;

  const subSx = {
    fontSize: 13,
    color: 'text.secondary',
    whiteSpace: 'nowrap',
  } as const;

  /**
   * The first sub-line of the identity cell — the artboard's own text: « 10 × 8 »
   * in Gardener, « modifié il y a 2 h » in Expert, « plan non dessiné » when
   * there is none (round 4, A5).
   *
   * Round 5 (V18) takes the DESCRIPTION back off it. Round 4 had concatenated
   * the two behind a middle dot to hold the cell to three children, and on a
   * 106-130 px column that put « Modifié il y a 11 h » and « Blablablaaaa Test »
   * in a fight neither could win. Alexandre's amendment of 11/09 to § 5 of the
   * design contract: « deux sous-lignes, PLUS une troisième ligne réservée à la
   * description lorsqu'elle existe ».
   */
  const primarySub = showHarvestColumn
    ? t('dashboard.blocks.gardens.lastModified', {
        when: formatRelativeDate(
          new Date(garden.updatedAt),
          new Date(),
          i18n.language,
          'short'
        ),
      })
    : view?.hasPlan
      ? t('dashboard.blocks.gardens.dimensions', {
          cols: garden.width,
          rows: garden.height,
        })
      : t('dashboard.blocks.gardens.noPlan');

  return (
    <Box component="tr">
      {/* THREE children, FOUR when the garden has a description (round 5, V18).

          `Main.dc.html` puts three in a `.td`:

            <div class="gname">Terrasse</div>
            <div class="tsub num">10 × 8 · 50 cm</div>
            <div style="display:flex; …; flex-wrap:wrap;">[thumb][chips]</div>

          Round 4 held the cell to those three by making the description the
          truncated TAIL of the sub-line, behind a middle dot. On a 106-130 px
          column that produced « Modifié il y a 11 h · Blablablaaaa Test »: two
          facts sharing one line, and the identity losing. The amendment of
          11/09 gives the description a line of ITS OWN, and only the rows that
          have one pay for it — a table row takes its own height, so a long
          description on one garden lengthens that row and no other. */}
      {/* The row's HEADER, not a plain cell (round 7, S31 — Extension #7-12):
          every other cell of the row is a fact about the garden named here.
          With column headers only, a screen reader reading the OCCUPANCY cell
          announced the column and not the garden; `scope="row"` restores the
          pairing. Same typography — `cellSx` sets it and the inner nodes carry
          their own weight, so the `th` default bold never shows. */}
      <Box
        component="th"
        scope="row"
        sx={{ ...cellSx, textAlign: 'left', fontWeight: 400 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Box
            component={RouterLink}
            to={plannerPath}
            aria-label={t('dashboard.blocks.gardens.open', {
              name: garden.name,
            })}
            sx={{
              display: 'block',
              fontSize: DASHBOARD_TYPE.gardenName,
              fontWeight: 700,
              // `.gname { line-height: 1.25 }` (round 6, N5-10).
              lineHeight: 1.25,
              textDecoration: 'none',
              color: 'inherit',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {garden.name}
          </Box>
          {/* The artboard's own sub-line, at `text.primary` (round 5, V18).

              The pair had to be told apart by COLOUR — « une couleur plus
              discrète que la date, pour qu'elle ne prime pas sur l'identité » —
              and the step was taken UPWARD on the date rather than downward on
              the description, because downward breaks the contrast rule of § 7:
              MUI's `text.secondary` is `rgba(0,0,0,0.6)`, which is 5.7:1 on
              white, and the next step down, `rgba(0,0,0,0.5)`, is 3.9:1 — under
              the 4.5:1 that 13 px text owes. `text.disabled` is 2.9:1 and the
              product's own `mutedText` is 2.0:1. The relation Alexandre asked
              for holds either way; only this direction keeps both lines
              legible. */}
          <Typography sx={{ ...subSx, color: 'text.primary' }}>
            {primarySub}
          </Typography>
          {/* V10 — the description is still shown, and V18 is where it sits.
              « Mes Jardins » printed it on every card; the widget carried it on
              the wire and edited it in the rename dialog, but showed it nowhere.
              ONE line, truncated, with the whole text in the tooltip.
              `enterTouchDelay` / `leaveTouchDelay` make that tooltip open on a
              long-press and stay open — on a phone there is no hover, and a
              description nobody can reach is the defect V10 fixed. */}
          {garden.description && (
            <MaybeTooltip description={garden.description}>
              <Typography
                data-garden-description
                sx={{
                  ...subSx,
                  maxWidth: showHarvestColumn
                    ? DESCRIPTION_MAX_PX.expert
                    : DESCRIPTION_MAX_PX.gardener,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  // The tooltip is the way to the rest, and it needs a
                  // focusable, hoverable target of its own.
                  cursor: 'help',
                }}
                tabIndex={0}
              >
                {garden.description}
              </Typography>
            </MaybeTooltip>
          )}
          {/* V11 — the plan thumbnail is back, at every level.

              It was never missing on the Gardener dashboard: it was tied to
              `!showHarvestColumn`, so it vanished the moment the Harvest widget
              joined the page — which is the Expert preset, and the only place
              the defect was seen. That condition transcribed `_spec.md` § 4 and
              § 10.18 faithfully, and both are a WIDTH arbitration: seven
              labelled columns need 590 px and a Large card offers 516, so the
              design paid for RÉCOLTE with the thumbnail. V8 makes the table
              scroll horizontally with its actions frozen, so 516 px is no
              longer a ceiling and the trade no longer has to be made.
              Documented amendment: the thumbnail is unconditional.

              Inside the wrapping chip row, exactly as the frozen artboard has
              it (`Main.dc.html`: `flex-wrap: wrap`, thumbnail then chips), and
              not to the left of the whole cell where it used to be. That
              placement COSTS NOTHING: a wrapping row's minimum width is its
              widest single item, so the identity column asks for 85 px (the
              ornamental chip) instead of the 211 px the old inline row summed. */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              mt: '2px',
              flexWrap: 'wrap',
            }}
          >
            <GardenThumbnail
              garden={garden}
              maxW={TABLE_THUMB_W}
              maxH={TABLE_THUMB_H}
            />
            {/* 24 px inside the table (round 6, N5-2): `.tbl .pill { height:
                24px; font-size: 13px; padding: 0 8px }`. No glyph here — the
                table's chips are drawn bare in `Main.dc.html`. */}
            {typeLabel && (
              <Chip
                label={typeLabel}
                size="small"
                variant="outlined"
                sx={{
                  height: DASHBOARD_TYPE.tableChipHeight,
                  fontSize: DASHBOARD_TYPE.chip,
                  borderColor: chipBorder,
                }}
              />
            )}
            {ornamental}
          </Box>
        </Box>
      </Box>

      <Box component="td" sx={cellSx}>
        <Box sx={{ fontWeight: 700 }}>
          {formatCount(garden.placementCount, i18n.language)}
        </Box>
        <Typography sx={subSx}>
          {t('dashboard.blocks.gardens.varieties', {
            count: garden.varietyCount,
          })}
        </Typography>
      </Box>

      <Box component="td" sx={cellSx}>
        {view?.hasPlan ? (
          <>
            <OccupancyBar percent={view.occupancyPercent} />
            <Typography sx={subSx}>
              {t('dashboard.blocks.gardens.freeCells', {
                count: view.freeCells,
              })}
            </Typography>
          </>
        ) : (
          <MissingDataMark label={t('dashboard.blocks.gardens.noPlanShort')} />
        )}
      </Box>

      <Box component="td" sx={cellSx}>
        {view?.dominantExposure ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ExposureDot category={view.dominantExposure} />
            <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
              {t(`dashboard.exposure.short.${view.dominantExposure}`)}
            </Box>
          </Box>
        ) : (
          <MissingDataMark label={t('dashboard.blocks.gardens.noPlanShort')} />
        )}
      </Box>

      {showWeatherColumn && (
        <Box component="td" sx={cellSx}>
          {/* Decision D10: a marker, no gesture. The design's « Add » link needs
              the geocoding endpoint of PR 3/5 behind it.

              Its own short word rather than the shells' « Coming soon »: the
              column is 66 px wide, and a cell marker is not a card's sentence. */}
          <MissingDataMark label={t('dashboard.blocks.gardens.columnSoon')} />
        </Box>
      )}

      {showHarvestColumn ? (
        <Box component="td" sx={cellSx}>
          <MissingDataMark label={t('dashboard.blocks.gardens.columnSoon')} />
        </Box>
      ) : (
        <Box component="td" sx={cellSx}>
          <Typography sx={subSx}>
            {formatRelativeDate(
              new Date(garden.updatedAt),
              new Date(),
              i18n.language,
              'short'
            )}
          </Typography>
        </Box>
      )}

      {/* 2 px in, nothing out: the column ends at the card's own padding, and
          the zone starts where the fade to its left finishes. */}
      <Box
        component="td"
        sx={{
          ...cellSx,
          ...stickyActionsSx(ruleColor, paperColor),
          pl: '2px',
          pr: 0,
        }}
      >
        {actions}
      </Box>
    </Box>
  );
}
