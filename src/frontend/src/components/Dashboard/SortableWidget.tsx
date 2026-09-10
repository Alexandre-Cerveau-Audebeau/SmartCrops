import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import Typography from '@mui/material/Typography';
import { keyframes } from '@mui/material/styles';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import OpenInFullOutlinedIcon from '@mui/icons-material/OpenInFullOutlined';
import RemoveRoundedIcon from '@mui/icons-material/RemoveRounded';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import { spanFor } from '../../utils/dashboardLayoutGrid';
import { NON_HIDABLE_BLOCK, type DashboardBlock } from '../../types/Dashboard';

/**
 * The Edit-mode wobble (_spec.md 8): a half-degree rock, the iOS idiom for
 * "these can be moved". Suppressed under `prefers-reduced-motion` below.
 */
const wobble = keyframes`
  0% { transform: rotate(-0.5deg); }
  50% { transform: rotate(0.5deg); }
  100% { transform: rotate(-0.5deg); }
`;

interface Props {
  block: DashboardBlock;
  /** Localized widget name, for every control label. */
  label: string;
  editing: boolean;
  /** Localized current size, so the resize label says where it stands. */
  sizeLabel: string;
  onHide: () => void;
  onResize: () => void;
  /**
   * The widget's own settings, rendered inside the gear menu (SMA-336 PR 2/5).
   *
   * Absent for a widget that has none, and the menu then says so rather than
   * drawing an empty panel — PR 1/5 shipped every widget that way, and five of
   * the eight still are.
   */
  options?: ReactNode;
  children: ReactNode;
}

/**
 * SMA-336 - one cell of the dashboard grid: its footprint, and in Edit mode the
 * four controls the frozen design puts INSIDE the card (_spec.md 8, point 5) -
 * hide (or the lock, on Gardens), the drag handle, the options gear and the
 * corner resize handle.
 *
 * The controls are an overlay on the grid cell rather than props threaded
 * through every widget: the cell is the one element that knows the block, and
 * `DashboardBlock` already reserves the top padding they sit in, so a widget
 * body never has to know that an Edit mode exists.
 *
 * Keyboard reordering is dnd-kit's, not ours: the handle carries the sortable
 * `attributes` (role="button", tabindex, aria-roledescription) and `listeners`,
 * so Space or Enter picks the widget up, the arrow keys move it, Space or Enter
 * drops it and Escape cancels - announced through the translated announcements
 * the grid passes to `DndContext`.
 */
export default function SortableWidget({
  block,
  label,
  editing,
  sizeLabel,
  onHide,
  onResize,
  options,
  children,
}: Props) {
  const { t } = useTranslation();
  const [optionsAnchor, setOptionsAnchor] = useState<HTMLElement | null>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.key, disabled: !editing });

  // The footprint comes from the SAME table the sorting strategy packs with
  // (round 3, V6): a span declared here and modelled there would drift, and a
  // drag preview computed from a stale span lands on the wrong cell. CSS
  // clamps a span to the column count and `spanFor` says so explicitly, so
  // ONE call per breakpoint DashboardGrid declares — one column on a phone,
  // two on a tablet, four from `lg` up (round 4, E'''1). The three sizes cap
  // at two columns today, so the `lg` value equals the `sm` one; declaring it
  // anyway is what keeps CSS and packing from diverging the day a size takes
  // three or four.
  const phone = spanFor(block.size, 1);
  const tablet = spanFor(block.size, 2);
  const desktop = spanFor(block.size, 4);
  const locked = block.key === NON_HIDABLE_BLOCK;

  return (
    <Box
      ref={setNodeRef}
      // TRANSLATION ONLY (round 2, V4). `rectSortingStrategy` returns
      // `scaleX: newRect.width / oldRect.width` and the same for the height, and
      // `CSS.Transform.toString` appends both to the translation. On a uniform
      // list those ratios are 1; this grid mixes 1x1, 2x1 and 2x2 footprints, so
      // a Small pushed aside by a Large was drawn stretched to the Large's
      // proportions for the length of the drag. `CSS.Translate.toString` emits
      // the `translate3d` alone — the widget moves, it does not deform.
      style={{ transform: CSS.Translate.toString(transform), transition }}
      sx={{
        minWidth: 0,
        // V7 — the widget's content STAYS in its card, at every size.
        //
        // A grid item's automatic minimum size in the block axis is
        // `min-height: auto`, which resolves to its content's min-content
        // height. The rows of this grid are fixed tracks (`gridAutoRows`,
        // 200 px on a phone and 273 px above), so an item whose content was
        // taller than its track grew PAST the track instead of being clipped by
        // it: the Statistics card's last line — « N cases libres, dont M en
        // plein soleil » — was drawn below the card's own border and over the
        // header of whichever widget sat underneath.
        //
        // `minHeight: 0` is the block-axis twin of the `minWidth: 0` above it,
        // and it is what lets `DashboardBlock`'s `overflow: hidden` and each
        // body's own bounded scroll actually apply. Fixing it here fixes it for
        // all eight widgets at once, which is why it is not in a widget.
        minHeight: 0,
        gridColumn: {
          xs: `span ${phone.cols}`,
          sm: `span ${tablet.cols}`,
          lg: `span ${desktop.cols}`,
        },
        gridRow: `span ${desktop.rows}`,
        zIndex: isDragging ? 2 : 'auto',
        // The dragged widget is carried by the DragOverlay; its slot stays in
        // the grid, and since round 3 (V6) the sorting strategy translates it
        // to the cell the drop will give it — so this outline is the DROP
        // PREVIEW, on an area the packing leaves free, not a hole left behind.
        //
        // The CARD goes transparent, not the slot (round 2, N3): dnd-kit keeps
        // DOM focus on the drag handle inside it for the whole of a keyboard
        // move, and `opacity: 0` on the slot took the focus indicator with it —
        // a keyboard user had nothing on screen telling them what they held.
        // The slot itself keeps a dashed outline where that focus is.
        ...(isDragging && {
          '& > *': { opacity: 0 },
          borderRadius: '12px',
          outline: '2px dashed',
          outlineColor: 'primary.main',
        }),
      }}
    >
      {/* The wobble lives on an INNER wrapper (round 1, G6): keyframes outrank
          a normal inline style in the cascade, so animating the sortable node
          itself replaced the `transform` dnd-kit writes there and the widget
          stopped following the drag. The outer node keeps the transform, this
          one carries the animation. */}
      <Box
        sx={{
          position: 'relative',
          height: '100%',
          ...(editing && {
            animation: `${wobble} 0.5s ease-in-out infinite`,
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }),
        }}
      >
        {children}

        {editing && (
          <>
            <Box
              sx={{
                position: 'absolute',
                top: 4,
                left: 6,
                right: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                zIndex: 3,
              }}
            >
              {locked ? (
                // A generic div forbids an author-supplied name, so assistive
                // technology may ignore the aria-label; role="img" makes it a
                // graphic WITH a text alternative (round 1, E6 / G7). The lock
                // is the only signal that this widget cannot be hidden.
                <Box
                  role="img"
                  aria-label={t('dashboard.editMode.locked', { widget: label })}
                  sx={{
                    display: 'flex',
                    p: '5px',
                    color: 'text.disabled',
                  }}
                >
                  <LockOutlinedIcon fontSize="small" aria-hidden />
                </Box>
              ) : (
                <IconButton
                  size="small"
                  onClick={onHide}
                  aria-label={t('dashboard.editMode.hide', { widget: label })}
                >
                  <RemoveRoundedIcon fontSize="small" />
                </IconButton>
              )}

              <IconButton
                size="small"
                ref={setActivatorNodeRef}
                aria-label={t('dashboard.editMode.drag', { widget: label })}
                sx={{ cursor: 'grab', touchAction: 'none' }}
                {...attributes}
                {...listeners}
              >
                <DragIndicatorIcon fontSize="small" />
              </IconButton>

              <IconButton
                size="small"
                onClick={(event) => setOptionsAnchor(event.currentTarget)}
                aria-label={t('dashboard.editMode.options', { widget: label })}
              >
                <SettingsOutlinedIcon fontSize="small" />
              </IconButton>
            </Box>

            <IconButton
              size="small"
              onClick={onResize}
              aria-label={t('dashboard.editMode.resize', {
                widget: label,
                size: sizeLabel,
              })}
              sx={{ position: 'absolute', bottom: 4, right: 4, zIndex: 3 }}
            >
              <OpenInFullOutlinedIcon fontSize="small" />
            </IconButton>

            {/* Generic options shell (_spec.md 8, A8). PR 1/5 shipped the frame
                and nothing in it; PR 2/5 drops the Counters entries in. A widget
                with no settings still says so rather than opening on a blank
                panel.

                A POPOVER, not a Menu (round 1, G6). What this surface holds is
                a switch and a select — form controls, not `MenuItem`s — and
                `Menu` wraps its children in a `MenuList`, which owns the arrow
                keys and adds character typeahead. Inside it, Up and Down moved
                the menu's own focus instead of opening the garden select, and
                typing in a field could jump focus to whatever child started
                with that letter. `Popover` is the same anchored, focus-trapping,
                Escape-closing surface with none of the list behaviour, so the
                controls behave the way they do everywhere else in the product.

                What is preserved: the gear still opens it with Enter or Space
                (it is an `IconButton`), the popover still moves focus into
                itself, Escape and a click outside still close it, and closing
                still returns focus to the gear — `Popover` restores it the same
                way `Menu` did. « Terminé » is now a `Button`, which is what it
                always was semantically. */}
            <Popover
              anchorEl={optionsAnchor}
              open={optionsAnchor !== null}
              onClose={() => setOptionsAnchor(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              slotProps={{
                paper: {
                  sx: { width: 320 },
                  // NAMED, and named after the widget: `Menu` gave this surface
                  // a `menu` role for free, and dropping to a `Popover` would
                  // otherwise leave a focus-trapping panel with no role and no
                  // name at all. It traps focus, closes on Escape and returns
                  // focus to the gear — that is a dialog — and the label says
                  // which widget's settings a user is standing in.
                  role: 'dialog',
                  'aria-label': t('dashboard.editMode.options', { widget: label }),
                },
              }}
            >
              <Box sx={{ px: 2, pt: 1, pb: 0.5 }}>
                <Typography
                  component="h3"
                  sx={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'text.secondary',
                    m: 0,
                  }}
                >
                  {t('dashboard.editMode.optionsTitle')}
                </Typography>
              </Box>
              <Box sx={{ px: 2, pb: 1 }}>
                {options ?? (
                  <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>
                    {t('dashboard.editMode.optionsEmpty')}
                  </Typography>
                )}
              </Box>
              <Divider />
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 1 }}>
                <Button size="small" onClick={() => setOptionsAnchor(null)}>
                  {t('dashboard.editMode.optionsDone')}
                </Button>
              </Box>
            </Popover>
          </>
        )}
      </Box>
    </Box>
  );
}
