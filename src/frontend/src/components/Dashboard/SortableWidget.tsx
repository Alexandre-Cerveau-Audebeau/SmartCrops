import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import { keyframes } from '@mui/material/styles';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import OpenInFullOutlinedIcon from '@mui/icons-material/OpenInFullOutlined';
import RemoveRoundedIcon from '@mui/icons-material/RemoveRounded';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
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

/** Column and row spans per footprint, per breakpoint (_spec.md 1). */
const SPANS = {
  small: { columns: { xs: 1, sm: 1 }, rows: 1 },
  medium: { columns: { xs: 1, sm: 2 }, rows: 1 },
  large: { columns: { xs: 1, sm: 2 }, rows: 2 },
} as const;

interface Props {
  block: DashboardBlock;
  /** Localized widget name, for every control label. */
  label: string;
  editing: boolean;
  /** Localized current size, so the resize label says where it stands. */
  sizeLabel: string;
  onHide: () => void;
  onResize: () => void;
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

  const span = SPANS[block.size];
  const locked = block.key === NON_HIDABLE_BLOCK;

  return (
    <Box
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      sx={{
        minWidth: 0,
        gridColumn: {
          xs: `span ${span.columns.xs}`,
          sm: `span ${span.columns.sm}`,
        },
        gridRow: `span ${span.rows}`,
        zIndex: isDragging ? 2 : 'auto',
        // The dragged widget is carried by the DragOverlay; its slot stays in
        // the grid so the neighbours reflow around a hole of the right size.
        opacity: isDragging ? 0 : 1,
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

            {/* Generic options shell (_spec.md 8, A8): the frame exists so a
                later lot drops its real entries in. PR 1/5 ships none, and says
                so rather than drawing a switch that toggles nothing. */}
            <Menu
              anchorEl={optionsAnchor}
              open={optionsAnchor !== null}
              onClose={() => setOptionsAnchor(null)}
              slotProps={{ paper: { sx: { width: 320 } } }}
            >
              <Box sx={{ px: 2, pt: 1, pb: 0.5 }}>
                <Typography
                  sx={{ fontSize: 13, fontWeight: 700, color: 'text.secondary' }}
                >
                  {t('dashboard.editMode.optionsTitle')}
                </Typography>
              </Box>
              <Box sx={{ px: 2, pb: 1 }}>
                <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>
                  {t('dashboard.editMode.optionsEmpty')}
                </Typography>
              </Box>
              <Divider />
              <MenuItem onClick={() => setOptionsAnchor(null)}>
                {t('dashboard.editMode.optionsDone')}
              </MenuItem>
            </Menu>
          </>
        )}
      </Box>
    </Box>
  );
}
