import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import Box from '@mui/material/Box';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import SortableWidget from './SortableWidget';
import { createDashboardSortingStrategy } from './dashboardSortingStrategy';
import { spanFor } from '../../utils/dashboardLayoutGrid';
import { DASHBOARD_SPACING } from '../../theme/dashboardTokens';
import type { DashboardBlock, DashboardBlockKey } from '../../types/Dashboard';

interface Props {
  /** Every block, hidden ones included - the grid renders the visible ones. */
  blocks: DashboardBlock[];
  editing: boolean;
  onReorder: (blocks: DashboardBlock[]) => void;
  onHide: (key: DashboardBlockKey) => void;
  onResize: (key: DashboardBlockKey) => void;
  renderBlock: (block: DashboardBlock) => ReactNode;
  /** A widget's own settings for the Edit-mode gear; undefined when it has none. */
  renderBlockOptions?: (block: DashboardBlock) => ReactNode;
}

/**
 * SMA-336 - the widget grid: four columns from 1200px, two on a tablet, one on
 * a phone (_spec.md 1), a 20px gutter, and the drag-and-drop context that the
 * Edit mode drives.
 *
 * Reordering keeps the HIDDEN blocks in their absolute slots: only the visible
 * ones are permuted, and each hidden block stays at the index it held. A widget
 * brought back from the gallery therefore returns where its level put it,
 * instead of drifting to the end every time its neighbours are rearranged.
 *
 * Both sensors are mounted at all times and the widgets are disabled instead
 * (`useSortable({disabled})`), so leaving Edit mode never remounts a widget -
 * which would re-run the gardens fetch on every toggle.
 */
export default function DashboardGrid({
  blocks,
  editing,
  onReorder,
  onHide,
  onResize,
  renderBlock,
  renderBlockOptions,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();

  // The column count the CSS below resolves to, in JavaScript (round 3, V6):
  // the sorting strategy has to lay the grid out to know where a widget lands,
  // and CSS Grid cannot tell it. Same two breakpoints as `gridTemplateColumns`,
  // so the model and the browser cannot disagree.
  const atLeastFourColumns = useMediaQuery(theme.breakpoints.up('lg'));
  const atLeastTwoColumns = useMediaQuery(theme.breakpoints.up('sm'));
  const columns = atLeastFourColumns ? 4 : atLeastTwoColumns ? 2 : 1;

  const sensors = useSensors(
    // 8px before a drag starts: the four Edit-mode controls live inside the
    // card, and a click on one of them must not be read as the start of a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const [activeKey, setActiveKey] = useState<DashboardBlockKey | null>(null);

  const visible = useMemo(() => blocks.filter((block) => !block.hidden), [blocks]);
  const visibleKeys = useMemo(() => visible.map((block) => block.key), [visible]);
  const activeBlock = visible.find((block) => block.key === activeKey) ?? null;

  // The visible widgets with the footprint they have HERE — a Medium is two
  // columns wide on a tablet and one on a phone, and the model has to know it.
  const gridItems = useMemo(
    () => visible.map((block) => ({ key: block.key, ...spanFor(block.size, columns) })),
    [visible, columns]
  );

  // ONE column is a LIST, not a grid (SMA-336 mobile lot, step 2 — pre-flight
  // D6). The dashboard's own strategy packs logical cells and translates every
  // widget by `rows × (cell height + gap)`, with ONE cell height derived from
  // the first measured widget (`dashboardSortingStrategy.ts`, `cellSizeFrom`).
  // That is exact while every row is the same track — 273 px from `sm` up —
  // and false the moment the phone rows are `minmax(200px, auto)` (step 1):
  // a 338 px To-do above a 792 px calendar would be shown landing 716 px down
  // where the drop puts it 812. dnd-kit's `verticalListSortingStrategy` reads
  // the MEASURED rect of each item and the gaps between them, which is the
  // right model for a column of unequal heights, and it is only ever used
  // here: two and four columns keep the packing strategy, unchanged.
  const strategy = useMemo(
    () =>
      columns === 1
        ? verticalListSortingStrategy
        : createDashboardSortingStrategy({
            items: gridItems,
            columns,
            gap: DASHBOARD_SPACING.gutter,
          }),
    [gridItems, columns]
  );

  const label = (key: DashboardBlockKey) => t(`dashboard.blocks.${key}.title`);

  const announcements: Announcements = useMemo(() => {
    const name = (id: string) => t(`dashboard.blocks.${id}.title`);
    const rank = (id: string) =>
      visibleKeys.indexOf(id as DashboardBlockKey) + 1;
    const total = visibleKeys.length;
    return {
      onDragStart: ({ active }) =>
        t('dashboard.a11y.dragStart', {
          widget: name(String(active.id)),
          position: rank(String(active.id)),
          total,
        }),
      onDragOver: ({ active, over }) =>
        over
          ? t('dashboard.a11y.dragOver', {
              widget: name(String(active.id)),
              position: rank(String(over.id)),
              total,
            })
          : undefined,
      onDragEnd: ({ active, over }) =>
        over
          ? t('dashboard.a11y.dragEnd', {
              widget: name(String(active.id)),
              position: rank(String(over.id)),
              total,
            })
          : undefined,
      onDragCancel: ({ active }) =>
        t('dashboard.a11y.dragCancel', { widget: name(String(active.id)) }),
    };
  }, [t, visibleKeys]);

  const handleDragStart = ({ active }: DragStartEvent) =>
    setActiveKey(active.id as DashboardBlockKey);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveKey(null);
    if (!over || active.id === over.id) return;
    const from = visibleKeys.indexOf(active.id as DashboardBlockKey);
    const to = visibleKeys.indexOf(over.id as DashboardBlockKey);
    if (from < 0 || to < 0) return;

    const moved = arrayMove(visible, from, to);
    let next = 0;
    onReorder(blocks.map((block) => (block.hidden ? block : moved[next++]!)));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveKey(null)}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: t('dashboard.a11y.instructions') },
      }}
    >
      <SortableContext items={visibleKeys} strategy={strategy}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              lg: 'repeat(4, 1fr)',
            },
            // SMA-336 mobile lot, step 1 (pre-flight D1): on a phone the rows
            // are `minmax(200px, auto)` — never shorter than the 200 px the
            // design freezes (`_spec.md` § 1, the « verrou 13 » of the visual
            // pass), as tall as their content needs. In four or two columns a
            // fixed track protects the tiling: a Medium beside a Small must
            // share one row height. In ONE column every card is alone on its
            // row, so the fixed 200 px protected nothing and clipped everything
            // — measured on `5282852`: four two-line tasks in a 120 px body
            // (V34), the invitation printed over the first tip (V37), the
            // band over the min / max (V36), three calendar rows visible out
            // of ten (V38). From `sm` up the 273 px track is untouched.
            gridAutoRows: { xs: 'minmax(200px, auto)', sm: '273px' },
            gap: `${DASHBOARD_SPACING.gutter}px`,
          }}
        >
          {visible.map((block) => (
            <SortableWidget
              key={block.key}
              block={block}
              label={label(block.key)}
              editing={editing}
              sizeLabel={t(`dashboard.sizes.${block.size}`)}
              onHide={() => onHide(block.key)}
              onResize={() => onResize(block.key)}
              options={renderBlockOptions?.(block)}
            >
              {renderBlock(block)}
            </SortableWidget>
          ))}
        </Box>
      </SortableContext>

      {/* The widget under the pointer, lifted out of the grid (round 1, G6):
          the overlay follows the cursor one-to-one while the neighbours reflow
          into the hole its slot leaves behind. */}
      <DragOverlay>
        {activeBlock ? (
          <Box data-drag-overlay sx={{ height: '100%', cursor: 'grabbing' }}>
            {renderBlock(activeBlock)}
          </Box>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
