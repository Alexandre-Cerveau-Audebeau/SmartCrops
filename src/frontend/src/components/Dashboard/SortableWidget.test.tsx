import { render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { ThemeProvider } from '@mui/material/styles';
import { beforeEach, describe, expect, it } from 'vitest';
import i18next from '../../i18n/i18n';
import { createAppTheme } from '../../theme';
import SortableWidget from './SortableWidget';
import type { DashboardBlock } from '../../types/Dashboard';

// SMA-437 lot 1, PR A, step A2 (pre-flight D3) — the corner handle is drawn
// only for a widget that has more than one size at its formula. A-N11: « Chiffres
// clés — une seule taille, pas de poignée ». No widget of PR A has one size, so
// the rule is pinned on the cell itself, whatever list it is given.

/** One grid cell in Edit mode, inside the drag context the grid gives it. */
function renderCell(block: DashboardBlock, resizable: boolean) {
  return render(
    <ThemeProvider theme={createAppTheme('light')}>
      <DndContext>
        <SortableContext items={[block.key]}>
          <SortableWidget
            block={block}
            label="Tips"
            editing
            sizeLabel="Medium"
            resizable={resizable}
            onHide={() => {}}
            onResize={() => {}}
          >
            <div data-widget={block.key}>Tips body</div>
          </SortableWidget>
        </SortableContext>
      </DndContext>
    </ThemeProvider>
  );
}

describe('SortableWidget — the corner handle follows the sizes of the formula (SMA-437, A-N11)', () => {
  const tips: DashboardBlock = { key: 'tips', size: 'medium', hidden: false };

  beforeEach(async () => {
    await i18next.changeLanguage('en');
  });

  it('draws no size button for a widget that has one size: three controls, hide, move and options', () => {
    renderCell(tips, false);

    expect(screen.queryByRole('button', { name: /^Change the size of Tips/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Hide Tips' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move Tips' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tips options' })).toBeInTheDocument();
  });

  it('draws it for a widget that has several', () => {
    renderCell(tips, true);

    expect(
      screen.getByRole('button', { name: 'Change the size of Tips — currently Medium' })
    ).toBeInTheDocument();
  });
});
