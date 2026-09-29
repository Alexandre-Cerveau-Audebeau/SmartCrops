import { Fragment, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { visuallyHidden } from '@mui/utils';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import AddIcon from '@mui/icons-material/Add';
import AddLocationAltOutlinedIcon from '@mui/icons-material/AddLocationAltOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import FilterVintageOutlinedIcon from '@mui/icons-material/FilterVintageOutlined';
import SearchIcon from '@mui/icons-material/Search';
import SearchOffIcon from '@mui/icons-material/SearchOff';
import YardOutlinedIcon from '@mui/icons-material/YardOutlined';
import DeleteGardenDialog from '../../Garden/DeleteGardenDialog';
import RenameGardenDialog from '../../Garden/RenameGardenDialog';
import DashboardBlock from '../DashboardBlock';
import ExposureDot from '../ExposureDot';
import GardenActions from '../GardenActions';
import GardenThumbnail from '../GardenThumbnail';
import InviteState from '../InviteState';
import MissingDataMark from '../MissingDataMark';
import { GARDEN_TYPE_ICONS } from '../gardenTypeIcons';
import OccupancyBar from '../OccupancyBar';
import { useGlyphsFit } from '../useGlyphsFit';
import WeatherGlyph from './WeatherGlyph';
import { displayTemperature } from './weatherFormat';
import { defaultGardensCount, gardensCap, gardensOptions, searchGardens, sortGardens } from './gardensOptions';
import { DASHBOARD_TYPE, DASHBOARD_WEATHER } from '../../../theme/dashboardTokens';
import { useDashboardTokens } from '../../../theme/useDashboardTokens';
import type { DashboardSize, GardenSort } from '../../../types/Dashboard';
import type { DashboardGardenData } from '../../../types/DashboardData';
import type { WeatherLocation } from '../../../types/DashboardWeather';
import { formatCount, formatPercent, formatSurface } from '../../../utils/formatNumber';
import { formatRelativeDate } from '../../../utils/formatRelativeDate';
import { useGardenViews } from '../../../hooks/useGardenViews';
import { useUnitSystem } from '../../../hooks/useUnitSystem';
import type { GardenView } from '../../../utils/gardenStats';

/**
 * What the page knows of the weather for the MÉTÉO column (SMA-336 PR 3b/5,
 * amendment A6 lifted): the aggregate in flight, failed, or the place each
 * garden reads — `null` for a garden that is not located. Without the prop
 * (another page, another lot) the column keeps its « soon » marker.
 */
export type GardensWeather =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; byGarden: ReadonlyMap<string, WeatherLocation | null> };

/** Rows a Medium card shows before it defers the rest to "+N" (_spec.md 4). */
const MEDIUM_ROWS = 3;

/**
 * The glyph a MEDIUM row's type chip carries (round 6, N5-1) — the shared
 * table of `gardenTypeIcons.ts` since PR 4b/5 (T12), where the Tips widget
 * reads the same drawings for its per-garden groups.
 *
 * MEDIUM only: `Main.dc.html`'s table writes the same chips WITHOUT a glyph
 * (`<span class="pill type">Terrasse</span>`), and so does the Large row here.
 * And on a Medium row only where it fits (`_spec.md` § 10.24): see
 * `useGlyphsFit`.
 */
const TYPE_CHIP_ICONS = GARDEN_TYPE_ICONS;

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
 * …and on a PHONE, `A9NovicePhone.dc.html` l. 293: `<span class="tbox"
 * style="width: 40px; height: 34px;">` (SMA-336 mobile lot, step 6 —
 * pre-flight D5, arbitrage 5).
 */
const MEDIUM_THUMB_W_PHONE = 40;
const MEDIUM_THUMB_H_PHONE = 34;

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

/**
 * SMA-448, lot F5-b — the FULL WIDTH of the widget (V3-03 § 1, V3-04 § 4;
 * contract v3 § 4.7 a; pre-flight F5 § C.4, retained by Alexandre on 28/09):
 * the identity column of its seven-column table is drawn at 290 px on the
 * artboards, on 1 104 px of content. The description line takes at most this
 * there — a `nowrap` line hands its WHOLE text to the column's preferred width
 * (see `DESCRIPTION_MAX_PX`), and one long description would otherwise widen
 * the column for every row.
 */
const WIDE_DESCRIPTION_MAX_PX = 250;
/**
 * The identity column never shrinks under this in the Full width: from 600 to
 * 1 199 px the table scrolls horizontally under its frozen actions column
 * (C.4 — the Large's idiom, no new one), and without a floor `table-layout:
 * auto` would squeeze the names to their longest word before it scrolled.
 */
const WIDE_IDENTITY_MIN_PX = 200;
/** The OCCUPATION column's floor in the Full width: the bar stretched, its figure under it (« 68 % · 26 cases libres »). */
const WIDE_OCCUPANCY_MIN_PX = 150;
/** The search bar (V3-04, [P]): 190 px in Large, 230 in the Full width, the whole width on a phone. */
const LARGE_SEARCH_PX = 190;
const WIDE_SEARCH_PX = 230;

/**
 * A cell of the comparison table — the Large's and the Full width's alike.
 *
 * >= 44px rows (_spec.md 3): the line is a touch target as much as a row.
 * `height`, not `min-height` (round 7, S45 — Extension #8-7): CSS leaves
 * `min-height` on a table cell undefined and browsers ignore it, so the 44 px
 * were declared and never enforced. On a table cell `height` IS the minimum —
 * a taller content still grows the row.
 */
const TABLE_CELL_SX = {
  height: 44,
  py: '6px',
  pr: '8px',
  borderBottom: '1px solid',
  borderColor: 'borderSubtle',
  fontSize: DASHBOARD_TYPE.body,
  verticalAlign: 'middle',
} as const;

/** A sub-line of a table cell: 13 px, one of the three sizes V11 allows under 14. */
const TABLE_SUB_SX = {
  fontSize: 13,
  color: 'text.secondary',
  whiteSpace: 'nowrap',
} as const;

/**
 * A column header of the comparison table.
 *
 * 11px capitals: one of the three sizes the frozen design allows under 14, and
 * the reason is measured — six labelled columns plus a chevron only fit a
 * 516 px card at this size. The rest is `.tbl .th` verbatim (round 6, N5-4):
 * `font-weight: 800; letter-spacing: 0.02em; line-height: 1.25; padding: 0
 * 10px 10px 0; align-self: end`. The header wrote 700 / 0.04em with 4 px above
 * and below.
 */
const TABLE_HEADER_SX = {
  textAlign: 'left',
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
} as const;

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
  /** The weather each garden reads, for the MÉTÉO column (PR 3b/5). */
  weather?: GardensWeather;
  /** Opens the location dialog on this garden — the « Ajouter » of an unlocated cell. */
  onLocate?: (gardenId: string) => void;
  /** Opens the page create dialog - the same one the header button opens. */
  onCreateClick: () => void;
  /** Re-runs the dashboard fetch after a failed load or a rename. */
  onChanged: () => void;
  /** A deletion the backend confirmed: the page toasts and re-fetches. */
  onDeleted: () => void;
  /** "+N" - the rest of the list is reached by growing the widget. */
  onExpand: () => void;
  /**
   * The widget's stored settings (SMA-448, lot F5-a; V3-04) — `{ count, sort }`
   * and whatever else another build keeps there — read through
   * `gardensOptions` against the sorts the formula serves.
   */
  options?: Record<string, unknown> | null;
  /** The sorts the account's formula serves (`FormulaCapabilities.gardenSorts`): what a stored sort is read against (R8). */
  sorts: readonly GardenSort[];
  /**
   * The page's LOCAL custom order — the ids the gear panel is moving, not yet
   * or just written — or null to read the places the server serves.
   */
  customOrder?: readonly string[] | null;
  /** The Large list unfolded from the start — the harness's scenes; the widget owns the state after. */
  defaultExpanded?: boolean;
  /** A search typed from the start — the harness's scenes; the widget owns the state after. */
  defaultQuery?: string;
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
 * The rename and the type-the-name deletion were MOVED here untouched,
 * aria-labels included — they cost four review rounds to get right. Since
 * SMA-448, lot F2, the rename dialog and the two action buttons are components
 * of their own (`RenameGardenDialog`, `GardenActions`): the Novice page draws
 * the same ones, by construction.
 *
 * HARVEST renders a marker with NO gesture (decision D10) until PR 5/5. WEATHER
 * is fed since PR 3b/5 (amendment A6 lifted): the `.pill.wx` of `Main.dc.html`
 * — a 14 px glyph and the temperature — over the place name, or the dashed
 * marker and the « Ajouter » link of `A4Manquantes.dc.html` (`_spec.md` § 10.20,
 * no arrow, a 66 px column) that opens the shared location dialog on THAT
 * garden. PR 1/5's doctrine holds: the link exists because the endpoint does.
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
  weather,
  onLocate,
  onCreateClick,
  onChanged,
  onDeleted,
  onExpand,
  options = null,
  sorts,
  customOrder = null,
  defaultExpanded = false,
  defaultQuery = '',
}: Props) {
  // ONE locale source (round 6, Extension #5-9 / #5-10): this widget formatted
  // counts with `i18n.language` and dates with a `language` prop the page
  // derived from its own provider, and the two disagree for one render after a
  // switch — a French date beside an English-grouped count in one cell. Every
  // figure reads i18next's now, which is what `t()` beside it reads too; the
  // prop is gone from this widget and from `GardenRow`.
  const { t, i18n } = useTranslation();
  const tk = useDashboardTokens();
  // °C or °F in the MÉTÉO cell follow the product's one global toggle, like
  // the weather widget beside this table (`_spec.md` § 6).
  const { system } = useUnitSystem();
  // The table's own rule and card colours, resolved once — see
  // `stickyActionsSx` for why they cannot be left as system strings.
  const theme = useTheme();
  const palette = theme.palette;
  const ruleColor = palette.borderSubtle;
  const paperColor = palette.background.paper;
  /**
   * The Medium row's PHONE form (SMA-336 mobile lot, step 6 — pre-flight D5,
   * arbitrage 5), under the one `sm` breakpoint `DashboardGrid` folds at.
   * Measured on `5282852` at 360 px: the row's fixed parts — a 48 px
   * thumbnail, a type chip with its glyph, the « Ornemental » chip, the
   * count pill, the 52 px actions zone and the 24 px chevron — left the
   * NAME 12 px: « T. », « B », « P. » (constat N1). `A9NovicePhone.dc.html`
   * l. 292-299 draws the phone row as a 40 × 34 thumbnail, the name on a
   * line of its own over its type chip (no glyph, `_spec.md` § 10.24), the
   * count pill, the chevron — and no « Ornemental » (§ 10.22); the pencil
   * and the bin the artboard never drew stay, at their place (amendment A3,
   * arbitrage 5). Those 78 px have to come from somewhere: the count pill
   * joins the chip on the second line, which is what gives the name the
   * whole first line — 134 px at 360, the 130 the arbitrage asks for — and
   * the two wrap to a third line when together they are wider than it.
   */
  const phone = useMediaQuery(theme.breakpoints.down('sm'));

  // ── The widget's settings (SMA-448, lot F5-a; V3-04) ─────────────────────
  // The stored document read against the sorts the formula SERVES
  // (`gardensOptions`): the count — 8 on a desktop, 5 on a phone until the
  // user chooses (contract v3 § 4.7 d) — and the sort, « Derniers ouverts »
  // by default. The list is sorted ONCE per (gardens, sort, language, local
  // order) — every keystroke of the search filters the sorted list, it never
  // re-sorts it (pre-flight F5, risks).
  const parsed = gardensOptions(options, sorts);
  const count = parsed.count ?? defaultGardensCount(phone);
  const cap = gardensCap(count);
  const sort = parsed.sort;
  // The memo reads the PROPS, frozen, and the reader again — not `parsed`,
  // a fresh object of the render the hooks lint cannot see as stable
  // (`react-hooks/preserve-manual-memoization`).
  const sorted = useMemo(
    () => sortGardens(gardens, gardensOptions(options, sorts).sort, i18n.language, customOrder),
    [gardens, options, sorts, i18n.language, customOrder]
  );
  // « + N autres jardins » unfolds the list IN PLACE (A-N23, [A] 28/09):
  // nothing is written — the widget owns the state, the layout never sees
  // it — and « Réduire à N jardins » comes back to the setting. The search
  // (A-N3) exists only while at least one garden is hidden by the SETTING
  // (never by the unfolding: « la règle regarde le réglage, pas le
  // dépliage »), and looks through ALL the gardens, the hidden ones marked.
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [query, setQuery] = useState(defaultQuery);
  const hiddenCount = cap === null ? 0 : Math.max(0, sorted.length - cap);
  const searchable = hiddenCount > 0;
  const trimmedQuery = query.trim();
  const searching = searchable && trimmedQuery.length > 0;
  const results = useMemo(
    () => (searching ? searchGardens(sorted, trimmedQuery) : null),
    [searching, sorted, trimmedQuery]
  );
  const largeRows = results ?? (cap === null || expanded ? sorted : sorted.slice(0, cap));
  // In Large the card has a fixed height: unfolding scrolls to the FIRST
  // garden revealed (V3-04). A flag raised by the click, read by the callback
  // ref of that row as it mounts — never a state written in an effect.
  const revealRef = useRef(false);
  const firstRevealedRef = useCallback((node: HTMLElement | null) => {
    if (!node || !revealRef.current) return;
    revealRef.current = false;
    if (typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'nearest' });
  }, []);

  /**
   * The Medium rows' chips drawn BARE, the A9 form — no type glyph, no
   * « Ornemental » glyph — when one row of the card cannot hold them with
   * their glyphs (SMA-437 lot 1, PR A, step A7a; `_spec.md` § 10.24: the glyph
   * « partout où elle tient »). Measured by the layout harness at 600 px: a
   * 552 px card, whose « Balcon sud » row needs 81 + 10 + 191 px of a 272.5 px
   * group — the « Ornemental » chip was cut by 6.3 px, the name by 2.6. Bare,
   * the two chips are 152 px and the row holds whole, on ONE line: the row
   * keeps its 44 px, so the card still holds its three rows. From a 563 px
   * card up — the 561 px the full form needs, and the pixel `useGlyphsFit`
   * keeps for rounding — and so on the 566 px card of a desktop, the rows
   * hold the full form and nothing changes. The phone row has its own form
   * (above).
   *
   * The Medium body is handed to the hook by a CALLBACK ref (PR #287, fix
   * round 1, S1): it is drawn only once the gardens are loaded, without an
   * error, and not empty, and the measure starts when it mounts — whatever
   * kept it off the page, and even when the gardens come back unchanged.
   */
  const { bare: bareChips, ref: mediumBodyRef } = useGlyphsFit(
    '[data-garden-row-group]',
    [
      i18n.language,
      ...sorted
        .slice(0, MEDIUM_ROWS)
        .map((garden) => `${garden.id} ${garden.name} ${garden.config.gardenType} ${garden.isEdible}`),
    ].join('\n'),
    size === 'medium' && !phone
  );

  // ONE derivation per garden, shared with Statistics and reused across every
  // render of this widget (round 1, E10 / G4 / E22). It used to run inline in
  // `GardenRow`, so the rename dialog's own `setEditName` re-ran the exposure
  // engine once per garden per keystroke.
  const views = useGardenViews(gardens);

  // The garden being renamed — the dialog is `RenameGardenDialog`'s
  // (SMA-448, lot F2), which owns the request and its states.
  const [editingGarden, setEditingGarden] = useState<DashboardGardenData | null>(
    null
  );

  // The deletion target OUTLIVES the dialog open flag (the MyGardens idiom):
  // every close path only flips `deleteOpen`, so the fading dialog keeps its
  // name, count and (disarmed) button instead of collapsing mid-transition.
  const [deleteTarget, setDeleteTarget] = useState<DashboardGardenData | null>(
    null
  );
  const [deleteOpen, setDeleteOpen] = useState(false);

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

  // The relative date, or NULL when the wire value is not an instant (round
  // 8 — Extension #9-12). S30 guarded the SORT and stopped there: the three
  // places that DISPLAY the date still did `new Date(garden.updatedAt)`, and
  // an `Invalid Date` makes every branch of `formatRelativeDate` compare
  // `NaN`, fall through, and answer « now » — the card stated « Modified now »
  // for a timestamp it could not read. The boundary accepts `updatedAt` as a
  // string, not as a parsable instant, so one reader owns that contract for
  // the sort and the three displays alike; a null here is drawn as the
  // missing-data mark, in the place the date would have been.
  const modifiedText = (garden: DashboardGardenData): string | null =>
    Number.isFinite(instant(garden))
      ? formatRelativeDate(
          new Date(garden.updatedAt),
          new Date(),
          i18n.language,
          'short'
        )
      : null;
  /** « Modified … », or the mark when the date is unreadable. */
  const modifiedLine = (garden: DashboardGardenData): React.ReactNode => {
    const when = modifiedText(garden);
    return when !== null ? (
      t('dashboard.blocks.gardens.lastModified', { when })
    ) : (
      <MissingDataMark label={t('dashboard.blocks.gardens.noDate')} />
    );
  };

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

  // ── The Full width's cells (SMA-448, lot F5-b — V3-03 § 1, V3-04 § 4;
  // contract v3 § 4.7 a; pre-flight F5 § C.4, retained on 28/09) ────────────
  /** The plan's surface, in the page's one format — hectares beyond 10 000 m² (A-N16). */
  const surfaceText = (view: GardenView): string => {
    const surface = formatSurface(view.surfaceM2, i18n.language);
    return t(`dashboard.surface.${surface.unit}`, { value: surface.value });
  };
  /** « 50 cm » — the cell as the planner names it, or null for a cell this build does not know. */
  const cellSizeLabel = (garden: DashboardGardenData): string | null =>
    garden.cellSize && i18n.exists(`planner.templates.cellSizes.${garden.cellSize}`)
      ? t(`planner.templates.cellSizes.${garden.cellSize}`)
      : null;
  /**
   * The identity sub-line of the Full width — « 10 × 8 · 50 cm · 20 m² ·
   * modifié il y a 2 h »: the plan's dimensions, its cell, its surface, and
   * the modification, which has no column of its own there (C.4). Without a
   * plan, « Plan non dessiné » stands for the three. The parts are joined by
   * the middle dot the artboards write; a date that cannot be read draws the
   * missing-data mark in its place, as the Large's own sub-line does.
   */
  const wideSubLine = (
    garden: DashboardGardenData,
    view: GardenView | undefined,
    withModified: boolean
  ): React.ReactNode => {
    const parts: React.ReactNode[] = view?.hasPlan
      ? [
          t('dashboard.blocks.gardens.dimensions', { cols: garden.width, rows: garden.height }),
          cellSizeLabel(garden),
          surfaceText(view),
        ]
      : [t('dashboard.blocks.gardens.noPlan')];
    if (withModified) {
      const when = modifiedText(garden);
      parts.push(
        when !== null ? (
          t('dashboard.blocks.gardens.wide.modified', { when })
        ) : (
          <MissingDataMark key="no-date" label={t('dashboard.blocks.gardens.noDate')} />
        )
      );
    }
    return parts.filter((part) => part !== null).flatMap((part, index) => (index === 0 ? [part] : [' · ', part]));
  };
  /** The TYPE cell: the type chip WITH its glyph (V3-03, V3-04), or the « Type ? » mark of the contract (§ 4.7 b) — no gesture: the row's name already opens the garden. */
  const typeCell = (garden: DashboardGardenData): React.ReactNode =>
    typeLabel(garden) ? (
      <Chip
        label={typeLabel(garden)}
        size="small"
        variant="outlined"
        icon={typeChipIcon(garden)}
        sx={{
          height: DASHBOARD_TYPE.tableChipHeight,
          fontSize: DASHBOARD_TYPE.chip,
          borderColor: tk.chipBorder,
          '& .MuiChip-icon': { color: 'primary.main', fontSize: 14, ml: '6px', mr: '-4px' },
        }}
      />
    ) : (
      <MissingDataMark label={t('dashboard.blocks.gardens.wide.noType')} />
    );
  /** « 68 % · 26 cases libres » — the figure written once, under the bar. */
  const occupancyText = (view: GardenView): string =>
    t('dashboard.blocks.gardens.wide.occupancy', {
      count: view.freeCells,
      percent: formatPercent(view.occupancyPercent, i18n.language),
    });
  /** « 12 variétés », in full — the Full width has the room the Large's « 12 var. » lacks. */
  const varietiesText = (garden: DashboardGardenData): string =>
    t('dashboard.blocks.gardens.wide.varieties', { count: garden.varietyCount });
  /** « hors des 8 affichés » (V3-04): a garden a search found beyond the cut, or null. */
  const beyondOf = (garden: DashboardGardenData): string | null =>
    searching && cap !== null && sorted.indexOf(garden) >= cap
      ? t('dashboard.blocks.gardens.search.beyond', { count: cap })
      : null;

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
   * 24 px high (`Main.dc.html`, `.tbl .pill { height: 24px }`). A Medium row
   * whose card cannot hold the glyphs draws it bare too (`bareChips`).
   */
  const ornamentalChip = (
    garden: DashboardGardenData,
    where: 'medium' | 'table' = 'medium'
  ) =>
    garden.isEdible === false ? (
      <Chip
        label={t('dashboard.blocks.gardens.ornamental')}
        size="small"
        icon={where === 'medium' && !bareChips ? <FilterVintageOutlinedIcon /> : undefined}
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
   * The GREEN count pill of a Medium row (round 4, A4): `<span class="pill ok
   * num">50 plantes</span>`. Its colours are the artboards' `--chip-ok-bg` /
   * `--chip-ok-tx` in both modes, carried as tokens like every other dashboard
   * fill. At the end of the row on a desktop, on the chips line on a phone.
   */
  const countPill = (garden: DashboardGardenData) => (
    <Chip
      data-garden-count
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
  );

  /**
   * The trailing group of a row: rename, delete, chevron — in that order, at
   * that place, at both sizes (round 2, V12). Rename and delete were on the
   * Large table only, which is what the frozen design draws; but the Medium
   * list had no way at all to rename or delete a garden — both primary
   * gestures of the page. Documented amendment: `GardenActions` on every
   * row, in the same place, so the sizes have one trailing structure and the
   * buttons never move under the cursor when a widget is resized.
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
      <GardenActions garden={garden} onRename={setEditingGarden} onDelete={openDeleteDialog} />
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
              {modifiedLine(lastModified)}
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
    // The three first of the SORTED list ([P], lot F5-a): the sort is a
    // setting of the widget, and R4 wants a larger size to show MORE, never
    // something else. The three rows and « +N → » are otherwise unchanged
    // (A-N4: the Medium keeps its growth; the cap and the search are Large's).
    const shown = sorted.slice(0, MEDIUM_ROWS);
    const remaining = sorted.length - shown.length;
    return (
      <Box
        ref={mediumBodyRef}
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
                    // The hover inset is a pointer's: on a phone its 16 px go to the name.
                    px: { xs: 0, sm: '8px' },
                    borderRadius: '8px',
                    textDecoration: 'none',
                    color: 'inherit',
                    '&:hover': { backgroundColor: 'surfaceSubtle' },
                  }}
                >
                  <GardenThumbnail
                    garden={garden}
                    maxW={phone ? MEDIUM_THUMB_W_PHONE : MEDIUM_THUMB_W}
                    maxH={phone ? MEDIUM_THUMB_H_PHONE : MEDIUM_THUMB_H}
                  />
                  {/* The artboard's own middle group: `flex: 1; min-width: 0;
                      display: flex; align-items: center; gap: 10px; overflow:
                      hidden` — the name and the chips share ONE line and yield
                      together, which is why the chips clip rather than push the
                      name out. On a phone the group is A9's COLUMN (l. 294:
                      `flex-direction: column; align-items: flex-start; gap:
                      4px`): the name on its own line, the chips under it. */}
                  <Box
                    data-garden-row-group
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      display: 'flex',
                      flexDirection: { xs: 'column', sm: 'row' },
                      alignItems: { xs: 'flex-start', sm: 'center' },
                      gap: { xs: '4px', sm: '10px' },
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
                      data-garden-row-chips
                      sx={{
                        display: 'flex',
                        gap: '6px',
                        minWidth: 0,
                        overflow: 'hidden',
                        alignItems: 'center',
                        // On a phone the count pill is on this line too, and
                        // the two wrap under each other rather than clip.
                        flexWrap: { xs: 'wrap', sm: 'nowrap' },
                      }}
                    >
                      {typeLabel(garden) && (
                        <Chip
                          label={typeLabel(garden)}
                          size="small"
                          variant="outlined"
                          // The type's glyph, primary-coloured, 14 px (N5-1):
                          // `.pill.type .ic { color: var(--prim) }` — and no
                          // glyph on a phone (`_spec.md` § 10.24: « la ligne de
                          // chips débordait de 29 px »), nor where the card
                          // cannot hold it (`bareChips`, SMA-437 A7a).
                          icon={phone || bareChips ? undefined : typeChipIcon(garden)}
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
                      {/* No « Ornemental » on the phone row (`_spec.md` § 10.22). */}
                      {!phone && ornamentalChip(garden, 'medium')}
                      {phone && countPill(garden)}
                    </Box>
                  </Box>
                  {/* The GREEN count pill, right-aligned (round 4, A4):
                      `<span class="pill ok num">50 plantes</span>` — on the
                      chips line on a phone, see above. */}
                  {!phone && countPill(garden)}
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
  /**
   * The MÉTÉO cell of one row (PR 3b/5, A6 lifted) — `Main.dc.html`: `<span
   * class="pill wx num">[14 px glyph]24°</span><div class="tsub">Lyon</div>`,
   * `.pill.wx { background: --warn-bg; color: --warn-tx }`, `.pill.wx .ic
   * { color: --sun }`, `.pill.wx.cl .ic { color: --cloud }`; `.tbl .pill` is
   * 24 px high. Unlocated: `A4Manquantes.dc.html`'s `<span class="pill miss"
   * style="padding: 0 6px">[glyph]</span><span class="lnk">Ajouter</span>` —
   * the link without an arrow (`_spec.md` § 10.20), named for a screen reader
   * with the garden it locates, since three rows may carry it.
   *
   * Without the `weather` prop the column keeps the « soon » marker of PR 2/5:
   * the table is drawn elsewhere than the dashboard page.
   */
  const weatherCell = (garden: DashboardGardenData): React.ReactNode => {
    if (!weather) {
      return <MissingDataMark label={t('dashboard.blocks.gardens.columnSoon')} />;
    }
    if (weather.status === 'loading') {
      return <Skeleton variant="rounded" width={44} height={DASHBOARD_TYPE.tableChipHeight} />;
    }
    if (weather.status === 'error') {
      return <MissingDataMark label={t('dashboard.blocks.weather.cellUnavailable')} />;
    }

    const place = weather.byGarden.get(garden.id) ?? null;
    const subSx = { fontSize: 13, color: 'text.secondary', whiteSpace: 'nowrap' } as const;

    if (place === null) {
      if (!onLocate) {
        return <MissingDataMark label={t('dashboard.blocks.weather.cellNotLocated')} />;
      }
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
          <Box
            component="span"
            aria-hidden
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              height: DASHBOARD_TYPE.tableChipHeight,
              px: '6px',
              borderRadius: '999px',
              border: `1.5px dashed ${tk.invBd}`,
              backgroundColor: tk.invBg,
              color: 'primary.main',
            }}
          >
            <AddLocationAltOutlinedIcon sx={{ fontSize: DASHBOARD_WEATHER.cellIcon }} />
          </Box>
          <Button
            variant="text"
            size="small"
            onClick={() => onLocate(garden.id)}
            aria-label={t('dashboard.blocks.weather.cellAddNamed', { name: garden.name })}
            sx={{
              p: 0,
              minWidth: 0,
              fontSize: DASHBOARD_TYPE.link,
              fontWeight: 700,
              lineHeight: 1.2,
              textTransform: 'none',
            }}
          >
            {t('dashboard.blocks.weather.cellAdd')}
          </Button>
        </Box>
      );
    }

    /**
     * A LOCATED garden's cell is the door to its own location (round 1, V21 c):
     * a button that opens the shared dialog PRE-TARGETED on this garden — an
     * override to set, or « Revenir à la ville du profil » — named with the
     * garden, since several rows carry it. Plain when nobody can open the
     * dialog (the table drawn outside the dashboard page).
     */
    const located = (content: React.ReactNode) => {
      const columnSx = { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' } as const;
      if (!onLocate) return <Box sx={columnSx}>{content}</Box>;
      return (
        <Box
          component="button"
          type="button"
          data-weather-cell-edit
          onClick={() => onLocate(garden.id)}
          aria-label={t('dashboard.blocks.weather.cellEditNamed', { name: garden.name })}
          sx={{
            ...columnSx,
            background: 'none',
            border: 0,
            p: 0,
            m: 0,
            font: 'inherit',
            color: 'inherit',
            textAlign: 'left',
            cursor: 'pointer',
            borderRadius: '8px',
            '&:hover [data-weather-cell-place]': { textDecoration: 'underline dotted', textUnderlineOffset: '3px' },
            '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
          }}
        >
          {content}
        </Box>
      );
    };
    // A `span`, not Typography's `<p>`: the cell may be a `<button>`, whose content must be phrasing.
    const placeLine = (
      <Typography component="span" data-weather-cell-place sx={{ ...subSx, display: 'block' }}>
        {place.name}
      </Typography>
    );

    if (!place.current) {
      // Located, but the provider had nothing to say: the place, and a dash
      // where the temperature would be — never an invented figure. The dash
      // is for the eye; assistive technology hears « Sans météo » (round 1,
      // G1 — GitHub 4008082465), the same words the other empty states of
      // this column carry through `MissingDataMark`.
      return located(
        <>
          <Box component="span" aria-hidden sx={{ fontWeight: 700, color: 'text.disabled' }}>
            —
          </Box>
          <Box component="span" sx={visuallyHidden}>
            {t('dashboard.blocks.weather.cellUnavailable')}
          </Box>
          {placeLine}
        </>
      );
    }

    return located(
      <>
        <Box
          component="span"
          data-weather-cell
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            height: DASHBOARD_TYPE.tableChipHeight,
            px: '8px',
            borderRadius: '999px',
            fontSize: DASHBOARD_TYPE.chip,
            lineHeight: 1,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
            backgroundColor: tk.warnBg,
            color: tk.warnText,
          }}
        >
          <WeatherGlyph
            code={place.current.conditionCode}
            isDay={place.current.isDay}
            px={DASHBOARD_WEATHER.cellIcon}
          />
          {t('dashboard.blocks.weather.degrees', {
            value: displayTemperature(place.current.tempC, system),
          })}
        </Box>
        {placeLine}
      </>
    );
  };

  // ── What the Large and the Full width share (SMA-448, lot F5-a then F5-b):
  // the search bar — 190 px in Large, 230 in the Full width, the whole width
  // on a phone —, its announced results, its empty state, and the foot ────
  const searchLabel = t('dashboard.blocks.gardens.search.placeholder');
  // The discreet bar in the widget's head (A-N3, [A] 23/09 07:39; the form
  // of V3-04: 32 px, a pill, 190 px in Large, the whole width on a phone),
  // drawn only while a garden is hidden by the setting. Escape clears it
  // and stops there, so the key never reaches a surface above.
  const searchBar = (width: number) =>
    searchable ? (
      <TextField
        data-gardens-search
        size="small"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && query.length > 0) {
            event.stopPropagation();
            setQuery('');
          }
        }}
        placeholder={searchLabel}
        slotProps={{
          htmlInput: { 'aria-label': searchLabel },
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
              </InputAdornment>
            ),
            endAdornment:
              query.length > 0 ? (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    // Its own name: « Effacer la recherche » is the empty
                    // state's button, and two controls of one widget must not
                    // share a name.
                    aria-label={t('dashboard.blocks.gardens.search.clearField')}
                    onClick={() => setQuery('')}
                    sx={{ mr: '-6px' }}
                  >
                    <CloseIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            sx: { height: 32, borderRadius: '16px', fontSize: DASHBOARD_TYPE.secondary },
          },
        }}
        sx={{ width: { xs: '100%', sm: width }, flexShrink: 0 }}
      />
    ) : null;
  // The results, said once (V3-04: « le nombre de résultats est annoncé »):
  // a region mounted with the Large body, born empty, its text changing
  // with the query — never inserted already filled (the rule of #278).
  // ANNOUNCED, not displayed: the list itself, or the empty state, is what
  // the eye reads — a visible line would say the empty state's sentence
  // twice on the screen.
  const searchStatus = (
    <Typography
      role="status"
      aria-live="polite"
      data-gardens-search-status
      sx={visuallyHidden}
    >
      {searching && results
        ? results.length === 0
          ? t('dashboard.blocks.gardens.search.none', { query: trimmedQuery })
          : t('dashboard.blocks.gardens.search.results', {
              count: results.length,
              total: sorted.length,
              query: trimmedQuery,
            })
        : ''}
    </Typography>
  );
  // « Aucun résultat » is a state, not an error (R5; V3-04).
  const emptySearch = (
    <InviteState
      icon={<SearchOffIcon />}
      message={t('dashboard.blocks.gardens.search.none', { query: trimmedQuery })}
      body={t('dashboard.blocks.gardens.search.scope', { count: sorted.length })}
      action={
        <Button variant="outlined" size="small" onClick={() => setQuery('')}>
          {t('dashboard.blocks.gardens.search.clear')}
        </Button>
      }
    />
  );
  // The foot (A-N23, [A] 28/09): « + N autres jardins » that unfolds in
  // place, « Réduire à N jardins » that folds back, and, at the right, the
  // sort in force — « Triés par … », « Dans votre ordre » — so an order
  // never looks arbitrary. The button is not drawn while a search is on
  // (the results replace the cut); the sort line always is.
  const foot = (
    <Box
      data-gardens-foot
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        flexWrap: 'wrap',
        pt: '6px',
        borderTop: '1px solid',
        borderColor: 'borderSubtle',
      }}
    >
      {hiddenCount > 0 && !searching ? (
        <Button
          size="small"
          aria-expanded={expanded}
          onClick={() => {
            revealRef.current = !expanded;
            setExpanded(!expanded);
          }}
          sx={{ fontSize: DASHBOARD_TYPE.link, fontWeight: 700, px: '6px', ml: '-6px' }}
        >
          {expanded
            ? t('dashboard.blocks.gardens.foot.less', { count: cap ?? 0 })
            : t('dashboard.blocks.gardens.foot.more', { count: hiddenCount })}
        </Button>
      ) : (
        <Box component="span" />
      )}
      <Typography
        data-gardens-sorted-by
        sx={{ fontSize: DASHBOARD_TYPE.secondary, color: 'text.secondary', ml: 'auto', whiteSpace: 'nowrap' }}
      >
        {t(`dashboard.blocks.gardens.foot.sortedBy.${sort}`)}
      </Typography>
    </Box>
  );

  const largeBody = () => {
    // Resolved ONCE for the table (round 7, S07 — Extension #7-13): every row
    // re-read the theme and the tokens and built a fresh sticky `sx` — with
    // its nested `&::before` — on every render, per garden, on a table with
    // no row cap. The header cell and every row share this one object.
    const stickyActions = stickyActionsSx(ruleColor, paperColor);
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
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {searchBar(LARGE_SEARCH_PX)}
        {searchStatus}
        <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {results && results.length === 0 ? emptySearch : (
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
                  // `TABLE_HEADER_SX`: 11px capitals, `.tbl .th` verbatim (round 6, N5-4).
                  sx={TABLE_HEADER_SX}
                >
                  {label}
                </Box>
              ))}
              <Box component="th" scope="col" sx={stickyActions}>
                <Box component="span" sx={visuallyHidden}>
                  {t('dashboard.blocks.gardens.columns.actions')}
                </Box>
              </Box>
            </Box>
          </Box>
          <Box component="tbody">
            {largeRows.map((garden, index) => (
              <GardenRow
                rowRef={expanded && !searching && cap !== null && index === cap ? firstRevealedRef : undefined}
                beyond={
                  searching && cap !== null && sorted.indexOf(garden) >= cap
                    ? t('dashboard.blocks.gardens.search.beyond', { count: cap })
                    : null
                }
                stickyActions={stickyActions}
                chipBorder={tk.chipBorder}
                key={garden.id}
                garden={garden}
                view={views.get(garden.id)}
                showWeatherColumn={showWeatherColumn}
                showHarvestColumn={showHarvestColumn}
                weather={weatherCell(garden)}
                modified={modifiedText(garden)}
                typeLabel={typeLabel(garden)}
                ornamental={ornamentalChip(garden, 'table')}
                actions={rowTrailing(garden)}
                plannerPath={plannerPath(garden)}
              />
            ))}
          </Box>
        </Box>
        )}
        </Box>
        {foot}
      </Box>
    );
  };

  /**
   * SMA-448, lot F5-b — THE FULL WIDTH (V3-03 § 1, V3-04 § 4; contract v3
   * § 4.7 a; pre-flight F5 § C.4, retained by Alexandre on 28/09), the
   * Expert's alone (A-N11): the seven-column table — JARDIN (the name, its
   * sub-line « 10 × 8 · 50 cm · 20 m² · modifié il y a 2 h », its description
   * on a truncated line, V33), TYPE (the chip with its glyph), PLANTES (the
   * pill and the varieties in full), OCCUPATION (the bar, « 68 % · 26 cases
   * libres » under it), EXPOSITION, MÉTÉO when the Weather widget is on the
   * page (V23), the frozen actions column — with NO MODIFIÉ column and NO
   * RÉCOLTE column. The card grows with its rows (A-N10): nothing scrolls
   * vertically; under 1 152 px of card the table scrolls horizontally under
   * its frozen actions, the Large's idiom. The settings of lot F5-a hold: the
   * count as the cap, « + N autres jardins » unfolding in place under a rule
   * « Au-delà des N affichés » — the mark of what was hidden, since nothing
   * scrolls to the first garden revealed —, the search while a garden is
   * hidden, the sort in the foot. On a PHONE the rows of the A9 form replace
   * the table: a 1 104 px table has no place in a 328 px card.
   */
  /** Where the unfolding's rule falls: before the first garden the cut hid, or nowhere. */
  const cutAt = expanded && !searching && cap !== null && sorted.length > cap ? cap : null;
  const cutLine = (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        fontSize: DASHBOARD_TYPE.secondary,
        fontWeight: 700,
        color: 'text.secondary',
        whiteSpace: 'nowrap',
        '&::before, &::after': { content: '""', flex: 1, borderTop: `1px dashed ${tk.chipBorder}` },
      }}
    >
      {t('dashboard.blocks.gardens.foot.cut', { count: cap ?? 0 })}
    </Box>
  );
  /** The identity link of the Full width: the name WRAPS (V5 — no ellipsis a source allows here; the card grows, A-N10). */
  const wideNameSx = {
    display: 'block',
    fontSize: DASHBOARD_TYPE.gardenName,
    fontWeight: 700,
    lineHeight: 1.25,
    textDecoration: 'none',
    color: 'inherit',
    overflowWrap: 'anywhere',
  } as const;

  const wideTable = () => {
    const stickyActions = stickyActionsSx(ruleColor, paperColor);
    const headers = [
      t('dashboard.blocks.gardens.columns.garden'),
      t('dashboard.blocks.gardens.columns.type'),
      t('dashboard.blocks.gardens.columns.plants'),
      t('dashboard.blocks.gardens.columns.occupancy'),
      t('dashboard.blocks.gardens.columns.exposure'),
      ...(showWeatherColumn ? [t('dashboard.blocks.gardens.columns.weather')] : []),
    ];
    const cutRow = (
      <Box component="tr" key="cut" data-gardens-cut>
        <Box component="td" colSpan={headers.length + 1} sx={{ py: '8px', borderBottom: '1px solid', borderColor: 'borderSubtle' }}>
          {cutLine}
        </Box>
      </Box>
    );
    return (
      // The horizontal scroll under 1 152 px of card (C.4): the table keeps
      // its columns whole and slides under its frozen actions column.
      <Box data-gardens-scroll sx={{ overflowX: 'auto' }}>
        <Box
          component="table"
          aria-label={t('dashboard.blocks.gardens.title')}
          sx={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'auto' }}
        >
          <Box component="thead">
            <Box component="tr">
              {headers.map((label, index) => (
                <Box component="th" key={index} scope="col" sx={TABLE_HEADER_SX}>
                  {label}
                </Box>
              ))}
              <Box component="th" scope="col" sx={stickyActions}>
                <Box component="span" sx={visuallyHidden}>
                  {t('dashboard.blocks.gardens.columns.actions')}
                </Box>
              </Box>
            </Box>
          </Box>
          <Box component="tbody">
            {largeRows.flatMap((garden, index) => [
              ...(cutAt !== null && index === cutAt ? [cutRow] : []),
              <WideRow
                key={garden.id}
                garden={garden}
                view={views.get(garden.id)}
                showWeatherColumn={showWeatherColumn}
                weather={weatherCell(garden)}
                subLine={wideSubLine(garden, views.get(garden.id), true)}
                type={typeCell(garden)}
                plants={countPill(garden)}
                varieties={varietiesText(garden)}
                ornamental={ornamentalChip(garden, 'table')}
                actions={rowTrailing(garden)}
                plannerPath={plannerPath(garden)}
                stickyActions={stickyActions}
                nameSx={wideNameSx}
                beyond={beyondOf(garden)}
                occupancy={occupancyText}
              />,
            ])}
          </Box>
        </Box>
      </Box>
    );
  };

  /**
   * The Full width on a PHONE — the rows of the A9 form (V3-03 § 6, défaut 8 ;
   * V3-04 `rowsPhone`; contract v3 § 4.7 a « Au téléphone »): the thumbnail,
   * the name on its own line as the door to the garden, « 10 × 8 · 50 cm ·
   * 20 m² », the chips (the type with its glyph, « N plantes », « Ornemental »,
   * the MÉTÉO cell when the Weather widget is on the page) that wrap, « 68 % ·
   * 26 cases libres · Plein soleil », the description (V33), and the pencil,
   * the bin and the chevron at their place (V21). The unfolding's rule stands
   * between the rows where the cut fell.
   */
  const wideRows = () => (
    <Box component="ul" data-gardens-rows sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column' }}>
      {largeRows.flatMap((garden, index) => {
        const view = views.get(garden.id);
        const beyond = beyondOf(garden);
        const items: React.ReactNode[] = [];
        if (cutAt !== null && index === cutAt) {
          items.push(
            <Box component="li" key="cut" data-gardens-cut sx={{ py: '8px' }}>
              {cutLine}
            </Box>
          );
        }
        items.push(
          <Box
            component="li"
            key={garden.id}
            data-garden-row
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              py: '12px',
              borderBottom: '1px solid',
              borderColor: 'borderSubtle',
              '&:last-of-type': { borderBottom: 'none' },
            }}
          >
            <Box sx={{ flexShrink: 0, pt: '2px' }}>
              <GardenThumbnail garden={garden} maxW={MEDIUM_THUMB_W_PHONE} maxH={MEDIUM_THUMB_H_PHONE} />
            </Box>
            <Box
              data-garden-row-group
              sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '5px' }}
            >
              <Box
                component={RouterLink}
                to={plannerPath(garden)}
                aria-label={t('dashboard.blocks.gardens.open', { name: garden.name })}
                sx={wideNameSx}
              >
                {garden.name}
              </Box>
              {beyond && (
                <Typography data-garden-beyond sx={{ ...TABLE_SUB_SX, fontStyle: 'italic' }}>
                  {beyond}
                </Typography>
              )}
              <Typography data-garden-sub sx={{ ...TABLE_SUB_SX, color: 'text.primary', whiteSpace: 'normal' }}>
                {wideSubLine(garden, view, false)}
              </Typography>
              <Box data-garden-row-chips sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', minWidth: 0 }}>
                {typeCell(garden)}
                {countPill(garden)}
                {ornamentalChip(garden, 'table')}
                {showWeatherColumn && weatherCell(garden)}
              </Box>
              {view?.hasPlan && (
                <Box
                  data-garden-occupancy
                  sx={{ ...TABLE_SUB_SX, whiteSpace: 'normal', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}
                >
                  <span>{occupancyText(view)}</span>
                  {view.dominantExposure && (
                    <>
                      <span aria-hidden> · </span>
                      <ExposureDot category={view.dominantExposure} />
                      <span>{t(`dashboard.exposure.short.${view.dominantExposure}`)}</span>
                    </>
                  )}
                </Box>
              )}
              {garden.description && (
                <MaybeTooltip description={garden.description}>
                  <Typography
                    data-garden-description
                    sx={{ ...TABLE_SUB_SX, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'help' }}
                    tabIndex={0}
                  >
                    {garden.description}
                  </Typography>
                </MaybeTooltip>
              )}
            </Box>
            {rowTrailing(garden)}
          </Box>
        );
        return items;
      })}
    </Box>
  );

  const wideBody = () => (
    <Box data-gardens-wide sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {searchBar(WIDE_SEARCH_PX)}
      {searchStatus}
      {results && results.length === 0 ? emptySearch : phone ? wideRows() : wideTable()}
      {foot}
    </Box>
  );

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
    // The Full width (lot F5-b): the seven columns — never the Large stretched.
    if (size === 'wide') return wideBody();
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

      <RenameGardenDialog
        garden={editingGarden}
        onClose={() => setEditingGarden(null)}
        onRenamed={onChanged}
      />

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
  /** The MÉTÉO cell, resolved by the block (`weatherCell`); the row keeps no weather logic. */
  weather: React.ReactNode;
  /**
   * The relative date, resolved by the block through the one reader that
   * guards the sort (round 8 — Extension #9-12); null when the wire value is
   * not an instant. The row keeps no date logic of its own.
   */
  modified: string | null;
  typeLabel: string | null;
  ornamental: React.ReactNode;
  actions: React.ReactNode;
  plannerPath: string;
  /** Resolved once by the table (round 7, S07) — see `stickyActionsSx`. */
  stickyActions: ReturnType<typeof stickyActionsSx>;
  /** The outlined-chip border token, read once by the table. */
  chipBorder: string;
  /** The row's node, for the first garden an unfolding reveals (SMA-448, lot F5-a). */
  rowRef?: (node: HTMLElement | null) => void;
  /** « hors des 8 affichés »: a garden a search found beyond the cut (V3-04), or null. */
  beyond?: string | null;
}

/** One line of the comparison table. */
function GardenRow({
  garden,
  view,
  showWeatherColumn,
  showHarvestColumn,
  weather,
  modified,
  typeLabel,
  ornamental,
  actions,
  plannerPath,
  stickyActions,
  chipBorder,
  rowRef,
  beyond = null,
}: RowProps) {
  const { t, i18n } = useTranslation();

  // The table's cell and sub-line, shared with the Full width's row (lot F5-b).
  const cellSx = TABLE_CELL_SX;
  const subSx = TABLE_SUB_SX;

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
  const primarySub = showHarvestColumn ? (
    modified !== null ? (
      t('dashboard.blocks.gardens.lastModified', { when: modified })
    ) : (
      <MissingDataMark label={t('dashboard.blocks.gardens.noDate')} />
    )
  ) : view?.hasPlan ? (
    t('dashboard.blocks.gardens.dimensions', {
      cols: garden.width,
      rows: garden.height,
    })
  ) : (
    t('dashboard.blocks.gardens.noPlan')
  );

  return (
    <Box component="tr" ref={rowRef}>
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
          {/* « hors des 8 affichés » (V3-04): the garden a search found past
              the cut, said under its name — the one line of the lot on the
              identity cell, drawn only while a search is on. */}
          {beyond && (
            <Typography data-garden-beyond sx={{ ...subSx, color: 'text.secondary', fontStyle: 'italic' }}>
              {beyond}
            </Typography>
          )}
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
        <Box component="td" data-weather-column sx={cellSx}>
          {/* Resolved by the block — see `weatherCell`: the temperature pill
              over the place, the « Ajouter » of an unlocated garden, or the
              marker while the aggregate is not there (PR 3b/5, A6 lifted). */}
          {weather}
        </Box>
      )}

      {showHarvestColumn ? (
        <Box component="td" sx={cellSx}>
          <MissingDataMark label={t('dashboard.blocks.gardens.columnSoon')} />
        </Box>
      ) : (
        <Box component="td" sx={cellSx}>
          {modified !== null ? (
            <Typography sx={subSx}>{modified}</Typography>
          ) : (
            <MissingDataMark label={t('dashboard.blocks.gardens.noDate')} />
          )}
        </Box>
      )}

      {/* 2 px in, nothing out: the column ends at the card's own padding, and
          the zone starts where the fade to its left finishes. */}
      <Box
        component="td"
        sx={{
          ...cellSx,
          ...stickyActions,
          pl: '2px',
          pr: 0,
        }}
      >
        {actions}
      </Box>
    </Box>
  );
}

interface WideRowProps {
  garden: DashboardGardenData;
  /** Derived once for the whole page — see `useGardenViews`. */
  view: GardenView | undefined;
  showWeatherColumn: boolean;
  /** The MÉTÉO cell, resolved by the block (`weatherCell`). */
  weather: React.ReactNode;
  /** « 10 × 8 · 50 cm · 20 m² · modifié il y a 2 h », resolved by the block (`wideSubLine`). */
  subLine: React.ReactNode;
  /** The TYPE cell: the chip with its glyph, or the « Type ? » mark (`typeCell`). */
  type: React.ReactNode;
  /** The green « N plantes » pill (`countPill`). */
  plants: React.ReactNode;
  /** « 12 variétés », in full. */
  varieties: string;
  /** « 68 % · 26 cases libres », from the view — read only with a plan. */
  occupancy: (view: GardenView) => string;
  ornamental: React.ReactNode;
  actions: React.ReactNode;
  plannerPath: string;
  /** Resolved once by the table — see `stickyActionsSx`. */
  stickyActions: ReturnType<typeof stickyActionsSx>;
  /** The name's style: it wraps rather than ellipsizes (V5). */
  nameSx: Record<string, unknown>;
  /** « hors des 8 affichés »: a garden a search found beyond the cut (V3-04), or null. */
  beyond?: string | null;
}

/**
 * One line of the Full width's table (SMA-448, lot F5-b — V3-03, V3-04;
 * contract v3 § 4.7 a). The identity cell is the row's HEADER (`scope="row"`,
 * as the Large's — round 7, S31): the name as the door to the garden, the
 * mark of a search beyond the cut, the sub-line, the description on its own
 * truncated line (V33 — the one ellipsis a source allows here), then the
 * thumbnail and « Ornemental ». The type is a column of its own.
 */
function WideRow({
  garden,
  view,
  showWeatherColumn,
  weather,
  subLine,
  type,
  plants,
  varieties,
  occupancy,
  ornamental,
  actions,
  plannerPath,
  stickyActions,
  nameSx,
  beyond = null,
}: WideRowProps) {
  const { t } = useTranslation();

  return (
    <Box component="tr">
      <Box
        component="th"
        scope="row"
        sx={{ ...TABLE_CELL_SX, textAlign: 'left', fontWeight: 400, minWidth: WIDE_IDENTITY_MIN_PX }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Box
            component={RouterLink}
            to={plannerPath}
            aria-label={t('dashboard.blocks.gardens.open', { name: garden.name })}
            sx={nameSx}
          >
            {garden.name}
          </Box>
          {beyond && (
            <Typography data-garden-beyond sx={{ ...TABLE_SUB_SX, fontStyle: 'italic' }}>
              {beyond}
            </Typography>
          )}
          {/* The sub-line WRAPS (V5): « 10 × 8 · 50 cm · 20 m² · modifié il y a
              2 h » passes to a second line in a narrow column rather than
              being cut — the artboard's `.ell` is not an ellipsis a source
              allows (contract v3 § 6, V5). */}
          <Typography data-garden-sub sx={{ ...TABLE_SUB_SX, color: 'text.primary', whiteSpace: 'normal' }}>
            {subLine}
          </Typography>
          {garden.description && (
            <MaybeTooltip description={garden.description}>
              <Typography
                data-garden-description
                sx={{
                  ...TABLE_SUB_SX,
                  maxWidth: WIDE_DESCRIPTION_MAX_PX,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  cursor: 'help',
                }}
                tabIndex={0}
              >
                {garden.description}
              </Typography>
            </MaybeTooltip>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', mt: '2px', flexWrap: 'wrap' }}>
            <GardenThumbnail garden={garden} maxW={TABLE_THUMB_W} maxH={TABLE_THUMB_H} />
            {ornamental}
          </Box>
        </Box>
      </Box>

      <Box component="td" sx={TABLE_CELL_SX}>
        {type}
      </Box>

      <Box component="td" sx={TABLE_CELL_SX}>
        {/* The pill does not stretch to the column (V3-03: `align-items:
            flex-start` — « les puces d'une cellule ne s'étirent pas »). */}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
          {plants}
          <Typography sx={TABLE_SUB_SX}>{varieties}</Typography>
        </Box>
      </Box>

      <Box component="td" sx={{ ...TABLE_CELL_SX, minWidth: WIDE_OCCUPANCY_MIN_PX }}>
        {view?.hasPlan ? (
          <>
            {/* The bar alone, stretched to its column; the figure written ONCE,
                under it, with the free cells (contract v3 § 4.7 a). */}
            <OccupancyBar percent={view.occupancyPercent} valueHidden stretch />
            <Typography data-garden-occupancy sx={{ ...TABLE_SUB_SX, mt: '4px' }}>
              {occupancy(view)}
            </Typography>
          </>
        ) : (
          <MissingDataMark label={t('dashboard.blocks.gardens.noPlanShort')} />
        )}
      </Box>

      <Box component="td" sx={TABLE_CELL_SX}>
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
        <Box component="td" data-weather-column sx={TABLE_CELL_SX}>
          {weather}
        </Box>
      )}

      <Box component="td" sx={{ ...TABLE_CELL_SX, ...stickyActions, pl: '2px', pr: 0 }}>
        {actions}
      </Box>
    </Box>
  );
}
