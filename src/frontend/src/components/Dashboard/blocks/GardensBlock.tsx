import { useState } from 'react';
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
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import YardOutlinedIcon from '@mui/icons-material/YardOutlined';
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

/** Thumbnail edge on a Medium card and in the table's identity cell (_spec.md 7). */
const MEDIUM_THUMB_PX = 48;
const TABLE_THUMB_W = 34;
const TABLE_THUMB_H = 26;

/**
 * Width the actions column RESERVES in the Large table (round 2, V8).
 *
 * Measured, not chosen: two `size="small"` icon buttons are 30 px each (5 px of
 * padding around a 20 px glyph), the gap between them is 4, the chevron is 20,
 * its gap 2, and the rule that separates the column from the scrolling cells
 * takes 1 plus 8 of padding. 30 + 4 + 30 + 2 + 20 + 9 = 95, declared at 96.
 *
 * It is DECLARED because the column is sticky, and a sticky column is still a
 * column: its width is counted in the layout, so at full scroll-right the last
 * data cell stops just before it instead of running underneath.
 */
const ACTIONS_COL_PX = 96;

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
 * dark. The left rule is what says « the row continues behind here ».
 */
const stickyActionsSx = {
  position: 'sticky',
  right: 0,
  // Above the scrolling cells, below MUI's own overlays (Tooltip, Popover).
  zIndex: 1,
  width: ACTIONS_COL_PX,
  minWidth: ACTIONS_COL_PX,
  backgroundColor: 'background.paper',
  borderLeft: '1px solid',
  borderBottom: '1px solid',
  borderColor: 'borderSubtle',
} as const;

interface Props {
  size: DashboardSize;
  editing?: boolean;
  gardens: DashboardGardenData[];
  loading: boolean;
  loadError: boolean;
  language: string;
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
  language,
  showWeatherColumn = false,
  showHarvestColumn = false,
  onCreateClick,
  onChanged,
  onDeleted,
  onExpand,
}: Props) {
  const { t, i18n } = useTranslation();
  const tk = useDashboardTokens();

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
  const lastModified = gardens.reduce<DashboardGardenData | null>(
    (latest, garden) =>
      !latest || garden.updatedAt > latest.updatedAt ? garden : latest,
    null
  );

  const plannerPath = (garden: DashboardGardenData) =>
    `/gardens/${garden.id}/planner`;

  const typeLabel = (garden: DashboardGardenData) =>
    garden.config.gardenType
      ? t(`planner.config.type.${garden.config.gardenType}`)
      : null;

  const countChip = (
    <Chip
      label={t('dashboard.blocks.gardens.count', { count: gardens.length })}
      size="small"
      variant="outlined"
      sx={{ height: DASHBOARD_TYPE.chipHeight, fontSize: DASHBOARD_TYPE.chip }}
    />
  );

  const ornamentalChip = (garden: DashboardGardenData) =>
    garden.isEdible === false ? (
      <Chip
        label={t('dashboard.blocks.gardens.ornamental')}
        size="small"
        sx={{
          height: DASHBOARD_TYPE.chipHeight,
          fontSize: DASHBOARD_TYPE.chip,
          backgroundColor: tk.ornBg,
          color: tk.ornText,
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
    <Box sx={{ display: 'flex', gap: 0.5 }}>
      <IconButton
        size="small"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          openEditDialog(garden);
        }}
        aria-label={`${t('gardens.edit')} ${garden.name}`}
      >
        <EditIcon fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          openDeleteDialog(garden);
        }}
        aria-label={`${t('gardens.delete')} ${garden.name}`}
        sx={{ color: 'error.main' }}
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
        gap: '2px',
        flexShrink: 0,
      }}
    >
      {gardenActions(garden)}
      <ChevronRightIcon
        fontSize="small"
        sx={{ color: 'text.disabled', pointerEvents: 'none' }}
      />
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
      {lastModified && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          <Typography
            sx={{ fontSize: DASHBOARD_TYPE.secondary, color: 'text.secondary' }}
          >
            {t('dashboard.blocks.gardens.lastModified', {
              when: formatRelativeDate(
                new Date(lastModified.updatedAt),
                new Date(),
                language,
                'short'
              ),
            })}
          </Typography>
          <IconButton
            component={RouterLink}
            to={plannerPath(lastModified)}
            size="small"
            aria-label={t('dashboard.blocks.gardens.openLast')}
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
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-evenly',
          gap: '8px',
        }}
      >
        {shown.map((garden) => (
          <Box
            key={garden.id}
            sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
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
                  gap: '8px',
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
                  maxW={MEDIUM_THUMB_PX}
                  maxH={MEDIUM_THUMB_PX}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontSize: DASHBOARD_TYPE.gardenName,
                      fontWeight: 700,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {garden.name}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: DASHBOARD_TYPE.secondary,
                      color: 'text.secondary',
                    }}
                  >
                    {t('gardens.plantsCount', { count: garden.placementCount })}
                    {garden.varietyCount > 0 &&
                      ` · ${t('dashboard.blocks.gardens.varieties', {
                        count: garden.varietyCount,
                      })}`}
                  </Typography>
                </Box>
                {/* What CEDES when the two buttons take their 68 px (V12): the
                    chips, by clipping — which is the frozen design's own
                    arrangement for this row (`A2Novice.dc.html`: the name and
                    the chips share one `flex: 1; min-width: 0; overflow:
                    hidden` group). They were `flexShrink: 0` here, so they
                    would have pushed the name out instead of yielding. */}
                <Box
                  sx={{
                    display: 'flex',
                    gap: '4px',
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
                      sx={{
                        height: DASHBOARD_TYPE.chipHeight,
                        fontSize: DASHBOARD_TYPE.chip,
                      }}
                    />
                  )}
                  {ornamentalChip(garden)}
                </Box>
              </Box>
            </MaybeTooltip>
            {rowTrailing(garden)}
          </Box>
        ))}
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
          onClick={onCreateClick}
          sx={{ alignSelf: 'flex-start', fontSize: DASHBOARD_TYPE.link }}
        >
          {t('gardens.createGarden')}
        </Button>
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
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    color: 'text.secondary',
                    py: '4px',
                    borderBottom: '1px solid',
                    borderColor: 'borderSubtle',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {label}
                </Box>
              ))}
              <Box component="th" scope="col" sx={stickyActionsSx}>
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
                language={language}
                showWeatherColumn={showWeatherColumn}
                showHarvestColumn={showHarvestColumn}
                typeLabel={typeLabel(garden)}
                ornamental={ornamentalChip(garden)}
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
          <Button size="small" onClick={onChanged}>
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
  language: string;
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
  language,
  showWeatherColumn,
  showHarvestColumn,
  typeLabel,
  ornamental,
  actions,
  plannerPath,
}: RowProps) {
  const { t, i18n } = useTranslation();

  const cellSx = {
    // >= 44px rows (_spec.md 3): the line is a touch target as much as a row.
    minHeight: 44,
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

  return (
    <Box component="tr">
      <Box component="td" sx={cellSx}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                textDecoration: 'none',
                color: 'inherit',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {garden.name}
            </Box>
            {garden.description && (
              /* V10 — the description is back. « Mes Jardins » printed it on
                 every card (clamped to two lines, with a See more toggle above
                 80 characters); the widget carried it on the wire and edited it
                 in the rename dialog, but showed it nowhere.

                 One truncated line here, the whole text in the tooltip. The
                 table cell is 106 px wide and the row is a comparison line, not
                 a card: two clamped lines would push every other column's
                 baseline down for the sake of a field only one garden in three
                 fills. `enterTouchDelay` / `leaveTouchDelay` make the tooltip
                 open on a long-press and stay open — on a phone there is no
                 hover, and a description nobody can reach is the defect this
                 fixes, not the one it should ship. */
              <Tooltip
                title={garden.description}
                enterTouchDelay={0}
                leaveTouchDelay={6000}
                describeChild
              >
                <Typography
                  sx={{
                    ...subSx,
                    color: 'text.secondary',
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
              </Tooltip>
            )}
            <Typography sx={subSx}>
              {showHarvestColumn
                ? t('dashboard.blocks.gardens.lastModified', {
                    when: formatRelativeDate(
                      new Date(garden.updatedAt),
                      new Date(),
                      language,
                      'short'
                    ),
                  })
                : view?.hasPlan
                  ? t('dashboard.blocks.gardens.dimensions', {
                      cols: garden.width,
                      rows: garden.height,
                    })
                  : t('dashboard.blocks.gardens.noPlan')}
            </Typography>
            {/* V11 — the plan thumbnail is back, at every level.

                It was never missing on the Gardener dashboard: it was tied to
                `!showHarvestColumn`, so it vanished the moment the Harvest
                widget joined the page — which is the Expert preset, and the
                only place the defect was seen. That condition transcribed
                `_spec.md` § 4 and § 10.18 faithfully, and both are a WIDTH
                arbitration: seven labelled columns need 590 px and a Large card
                offers 516, so the design paid for RÉCOLTE with the thumbnail.
                V8 makes the table scroll horizontally with its actions frozen,
                so 516 px is no longer a ceiling and the trade no longer has to
                be made. Documented amendment: the thumbnail is unconditional.

                Inside the wrapping chip row, exactly as the frozen artboard has
                it (`Main.dc.html`: `flex-wrap: wrap`, thumbnail then chips),
                and not to the left of the whole cell where it used to be. That
                placement COSTS NOTHING: a wrapping row's minimum width is its
                widest single item, so the identity column asks for 85 px (the
                ornamental chip) instead of the 211 px the old inline row
                summed. Restoring the thumbnail this way makes the table
                narrower than it was without it. */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                mt: '2px',
                flexWrap: 'wrap',
              }}
            >
              <GardenThumbnail
                garden={garden}
                maxW={TABLE_THUMB_W}
                maxH={TABLE_THUMB_H}
              />
              {typeLabel && (
                <Chip
                  label={typeLabel}
                  size="small"
                  variant="outlined"
                  sx={{
                    height: DASHBOARD_TYPE.chipHeight,
                    fontSize: DASHBOARD_TYPE.chip,
                  }}
                />
              )}
              {ornamental}
            </Box>
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
              language,
              'short'
            )}
          </Typography>
        </Box>
      )}

      <Box component="td" sx={{ ...cellSx, ...stickyActionsSx, px: '8px' }}>
        {actions}
      </Box>
    </Box>
  );
}
