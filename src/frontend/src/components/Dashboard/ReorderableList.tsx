import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { useDashboardTokens } from '../../theme/useDashboardTokens';

interface Props<T> {
  /** The rows, in their order. */
  items: readonly T[];
  /** A row's stable identity — the React key and the dnd-kit id. */
  getId: (item: T) => string;
  /** A row's name, for its controls' labels and for what is said when it moves. */
  getName: (item: T) => string;
  /** What a place is called in this list: « 2ᵉ place » for the band's emplacements, « 4ᵉ position » for the gardens' order. */
  placeOf: (index: number) => string;
  /** The row's own content, between its handle and its ▲ ▼. */
  renderRow: (item: T, index: number) => ReactNode;
  /** The list's accessible name. */
  label: string;
  /** A row moved from `from` to `to` — by ▲, ▼ or a drop. */
  onMove: (from: number, to: number) => void;
  /**
   * What the list has to say — a move, a drag under way, a cancel. The OWNER
   * says it, in its one `role="status"` region: a panel that also announces
   * other gestures (the band's replacements) keeps one live region, not two.
   */
  onAnnounce: (message: string) => void;
  /**
   * True while a row is being dragged, false once dropped or cancelled — so an
   * owner that closes on Escape (a `Popover`) can leave Escape to the drag,
   * which it CANCELS (contract § 4.5, pre-flight C.9).
   */
  onDraggingChange?: (dragging: boolean) => void;
}

/** The 30 px ▲ ▼ of V3-04 (`.ol-b`): a bordered square, the chip border's colour. */
function useArrowSx() {
  const tk = useDashboardTokens();
  return {
    width: 30,
    height: 30,
    flexShrink: 0,
    borderRadius: '8px',
    border: `1px solid ${tk.chipBorder}`,
    color: 'text.primary',
    '&[aria-disabled="true"]': { color: 'text.disabled', borderColor: 'divider', cursor: 'default' },
  } as const;
}

interface RowProps {
  id: string;
  name: string;
  first: boolean;
  last: boolean;
  onUp: () => void;
  onDown: () => void;
  children: ReactNode;
}

function Row({ id, name, first, last, onUp, onDown, children }: RowProps) {
  const { t } = useTranslation();
  const arrowSx = useArrowSx();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <Box
      component="li"
      ref={setNodeRef}
      // Translation only — a row never deforms (the round-2 rule of the grid).
      style={{ transform: CSS.Translate.toString(transform), transition }}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        minHeight: 42,
        p: '4px 6px 4px 2px',
        backgroundColor: 'background.paper',
        '& + &': { borderTop: '1px solid', borderTopColor: 'divider' },
        position: 'relative',
        // The row being moved: lifted, and its place outlined in the green
        // dashes of the grid's own drop preview (V3-04, « arrivée en
        // pointillés verts »).
        ...(isDragging && {
          zIndex: 2,
          outline: '2px dashed',
          outlineColor: 'primary.main',
          outlineOffset: '-2px',
          borderRadius: '9px',
          backgroundColor: 'action.hover',
          boxShadow: 3,
        }),
      }}
    >
      {/* The handle: dnd-kit's own button — Space or Enter picks the row up,
          the arrows move it, Space or Enter drop it, Escape cancels. */}
      <IconButton
        ref={setActivatorNodeRef}
        aria-label={t('dashboard.reorder.handle', { name })}
        {...attributes}
        {...listeners}
        sx={{ width: 28, height: 32, flexShrink: 0, borderRadius: '6px', color: 'text.secondary', cursor: 'grab', touchAction: 'none' }}
      >
        <DragIndicatorIcon sx={{ fontSize: 20 }} />
      </IconButton>
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>{children}</Box>
      {/* ▲ ▼ are `aria-disabled` at the ends, never `disabled`: a disabled
          button drops the focus, and the focus has to stay on ▲ when the row
          it moves reaches the top (contract § 4.5). */}
      <IconButton
        aria-label={t('dashboard.reorder.up', { name })}
        aria-disabled={first || undefined}
        onClick={() => {
          if (!first) onUp();
        }}
        sx={arrowSx}
      >
        <KeyboardArrowUpIcon sx={{ fontSize: 20 }} />
      </IconButton>
      <IconButton
        aria-label={t('dashboard.reorder.down', { name })}
        aria-disabled={last || undefined}
        onClick={() => {
          if (!last) onDown();
        }}
        sx={arrowSx}
      >
        <KeyboardArrowDownIcon sx={{ fontSize: 20 }} />
      </IconButton>
    </Box>
  );
}

/**
 * SMA-437 lot 1, PR B, step B5 (contract § 4.5, § 4.7 d, § 7.3; pre-flight
 * D14) — THE reorderable list of the dashboard: one gesture to learn, three
 * places to use it. It is born here, for the four emplacements of the Key
 * figures band, as a brick the Customize panel (its widgets, « en liste ») and
 * the gardens' own order will reuse — V3-04 draws the three with the same
 * rows.
 *
 * A row is a handle ⠿, its content, and ▲ ▼. The mouse drags by the handle
 * (the dragged row lifted, its place outlined in green dashes); the keyboard
 * either takes the handle (Space, arrows, Space — Escape cancels), or presses
 * ▲ ▼, which keep the focus on themselves and have the new place said. What
 * is said goes to the owner (`onAnnounce`), who owns the one live region of
 * its panel; dnd-kit's own announcements are silenced so nothing is said
 * twice.
 */
export default function ReorderableList<T>({
  items,
  getId,
  getName,
  placeOf,
  renderRow,
  label,
  onMove,
  onAnnounce,
  onDraggingChange,
}: Props<T>) {
  const { t } = useTranslation();
  const ids = useMemo(() => items.map(getId), [items, getId]);
  const nameOf = (id: string) => {
    const item = items.find((candidate) => getId(candidate) === id);
    return item === undefined ? id : getName(item);
  };

  const sensors = useSensors(
    // A few pixels before a drag starts: the row's buttons are clicked, not dragged.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  /** « … relâchez pour le placer en 2ᵉ place, après « Cases libres ». » — where the row would land. */
  const landing = (activeId: string, overId: string | null) => {
    const from = ids.indexOf(activeId);
    const to = overId === null ? from : ids.indexOf(overId);
    const after = to > 0 ? arrayMove([...ids], from, to)[to - 1] : undefined;
    const name = nameOf(activeId);
    return after === undefined
      ? t('dashboard.reorder.dragging', { name, place: placeOf(to) })
      : t('dashboard.reorder.draggingAfter', { name, place: placeOf(to), previous: nameOf(after) });
  };

  const moveBy = (index: number, delta: number) => {
    const to = index + delta;
    onMove(index, to);
    onAnnounce(t('dashboard.reorder.moved', { name: getName(items[index]!), place: placeOf(to) }));
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    onDraggingChange?.(true);
    onAnnounce(landing(String(active.id), null));
  };
  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (over) onAnnounce(landing(String(active.id), String(over.id)));
  };
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    onDraggingChange?.(false);
    const from = ids.indexOf(String(active.id));
    const to = over ? ids.indexOf(String(over.id)) : from;
    const name = nameOf(String(active.id));
    if (from < 0 || to < 0 || from === to) {
      onAnnounce(t('dashboard.reorder.stayed', { name, place: placeOf(Math.max(from, 0)) }));
      return;
    }
    onMove(from, to);
    onAnnounce(t('dashboard.reorder.moved', { name, place: placeOf(to) }));
  };
  const handleDragCancel = ({ active }: { active: { id: string | number } }) => {
    onDraggingChange?.(false);
    onAnnounce(t('dashboard.reorder.cancelled', { name: nameOf(String(active.id)) }));
  };

  // Silenced: the owner's live region says it, once (see `onAnnounce`).
  const silent: Announcements = {
    onDragStart: () => undefined,
    onDragOver: () => undefined,
    onDragEnd: () => undefined,
    onDragCancel: () => undefined,
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      accessibility={{
        announcements: silent,
        screenReaderInstructions: { draggable: t('dashboard.reorder.instructions') },
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <Box
          component="ul"
          role="list"
          aria-label={label}
          sx={{
            listStyle: 'none',
            m: 0,
            p: 0,
            border: '1px solid',
            borderColor: 'borderSubtle',
            borderRadius: '10px',
            overflow: 'hidden',
          }}
        >
          {items.map((item, index) => {
            const id = getId(item);
            return (
              <Row
                key={id}
                id={id}
                name={getName(item)}
                first={index === 0}
                last={index === items.length - 1}
                onUp={() => moveBy(index, -1)}
                onDown={() => moveBy(index, 1)}
              >
                {renderRow(item, index)}
              </Row>
            );
          })}
        </Box>
      </SortableContext>
    </DndContext>
  );
}
