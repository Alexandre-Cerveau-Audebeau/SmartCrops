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

  const strategy = useMemo(
    () =>
      createDashboardSortingStrategy({
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
            gridAutoRows: { xs: '200px', sm: '273px' },
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
