import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../i18n/i18n';
import { LanguageProvider } from '../../contexts/LanguageContext';
import { createAppTheme } from '../../theme';
import { capabilitiesFor, presetFor } from '../../test/fixtures/formulas';
import CustomizePanel from './CustomizePanel';
import type { DashboardBlock, DashboardBlockKey, DashboardLevel, DashboardSize } from '../../types/Dashboard';

// SMA-437, lot V3-07, P1 (contract A-16, decided by Alexandre on 28/09) — the
// Customize panel as ONE list: every widget of the formula, in the page's
// order, each with its handle and ▲ ▼, its glyph and name, its switch — the
// lock on Gardens —, and on a second line the sizes the formula serves it.
// The page's own tests prove the page follows (`GardensDashboard.test.tsx`);
// these pin the panel: what it offers, what it writes, what it says.

interface PanelProps {
  level: DashboardLevel;
  initial: DashboardBlock[];
  switching?: boolean;
  onClose?: () => void;
  onReorder?: (blocks: DashboardBlock[]) => void;
  onVisibilityChange?: (key: DashboardBlockKey, hidden: boolean) => void;
  onSizeChange?: (key: DashboardBlockKey, size: DashboardSize) => void;
}

/** The panel over a layout it writes back, as the page's `setBlocks` and `patchBlock` do. */
function Panel({ level, initial, switching = false, onClose = () => {}, onReorder, onVisibilityChange, onSizeChange }: PanelProps) {
  const [blocks, setBlocks] = useState(initial);
  const patch = (key: DashboardBlockKey, change: Partial<DashboardBlock>) =>
    setBlocks((current) => current.map((block) => (block.key === key ? { ...block, ...change } : block)));
  return (
    <ThemeProvider theme={createAppTheme('light')}>
      <LanguageProvider>
        <CustomizePanel
          open
          level={level}
          capabilities={capabilitiesFor(level)}
          blocks={blocks}
          switching={switching}
          onClose={onClose}
          onChangeFormula={() => {}}
          onReset={() => {}}
          onReorder={(next) => {
            onReorder?.(next);
            setBlocks(next);
          }}
          onVisibilityChange={(key, hidden) => {
            onVisibilityChange?.(key, hidden);
            patch(key, { hidden });
          }}
          onSizeChange={(key, size) => {
            onSizeChange?.(key, size);
            patch(key, { size });
          }}
        />
      </LanguageProvider>
    </ThemeProvider>
  );
}

const panel = () => screen.getByRole('dialog', { name: /Customize|Personnaliser/ });
/** The panel's own region — by its attribute: dnd-kit renders a silenced region of its own. */
const said = () => panel().querySelector('[data-customize-said]') as HTMLElement;
const rowOf = (key: DashboardBlockKey) =>
  panel().querySelector(`[data-panel-widget="${key}"]`)!.closest('li') as HTMLElement;

// jsdom implements no `scrollIntoView`; dnd-kit's keyboard sensor calls it
// when a row is picked up (the `ReorderableList.test.tsx` idiom).
const originalScrollIntoView = Element.prototype.scrollIntoView;
beforeEach(() => {
  localStorage.setItem('smartcrops-language', 'en');
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  // Unmount FIRST (SMA-452 § 13): this hook runs before Testing Library's
  // automatic cleanup; what it puts back stays until the tree that reads it
  // is gone.
  cleanup();
  Element.prototype.scrollIntoView = originalScrollIntoView;
  vi.restoreAllMocks();
});

describe('CustomizePanel — the list of the formula’s widgets (A-16)', () => {
  it('moves a widget among the formula’s own: a block the formula does not list keeps its index, as the grid keeps a hidden one', () => {
    // A Gardener layout still carrying Statistics — a widget the formula does
    // not have (R1): never offered, never moved, never dropped.
    const initial: DashboardBlock[] = [
      ...presetFor('gardener').slice(0, 2),
      { key: 'stats', size: 'large', hidden: true },
      ...presetFor('gardener').slice(2),
    ];
    const onReorder = vi.fn();
    render(<Panel level="gardener" initial={initial} onReorder={onReorder} />);

    expect(panel().querySelector('[data-panel-widget="stats"]')).toBeNull();
    fireEvent.click(within(rowOf('tips')).getByRole('button', { name: 'Move “Tips” up' }));

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder.mock.calls[0]![0].map((block: DashboardBlock) => block.key)).toEqual([
      'weather',
      'tips',
      'stats',
      'gardens',
      'month',
      'todo',
      'counters',
      'harvest',
    ]);
  });

  it('offers each widget the sizes the formula serves it: three at the Gardener, four to the Expert’s Weather, the band’s one size said', () => {
    render(<Panel level="gardener" initial={presetFor('gardener')} />);
    const gardenerWeather = within(rowOf('weather')).getByRole('group', { name: 'Size of “Weather”' });
    expect(within(gardenerWeather).getAllByRole('button').map((pill) => [pill.textContent, pill.getAttribute('aria-pressed')])).toEqual([
      ['Small', 'false'],
      ['Medium', 'true'],
      ['Large', 'false'],
    ]);
    cleanup();

    render(<Panel level="expert" initial={presetFor('expert')} />);
    const expertWeather = within(rowOf('weather')).getByRole('group', { name: 'Size of “Weather”' });
    expect(within(expertWeather).getAllByRole('button').map((pill) => pill.textContent)).toEqual(['Small', 'Medium', 'Large', 'Full width']);
    expect(within(rowOf('keyfigures')).queryByRole('group')).toBeNull();
    expect(rowOf('keyfigures')).toHaveTextContent('Full width — its only size');
  });

  it('writes a size chosen and says it; the size already chosen writes nothing and says nothing', () => {
    const onSizeChange = vi.fn();
    render(<Panel level="gardener" initial={presetFor('gardener')} onSizeChange={onSizeChange} />);
    const group = within(rowOf('weather')).getByRole('group', { name: 'Size of “Weather”' });

    fireEvent.click(within(group).getByRole('button', { name: 'Medium' }));
    expect(onSizeChange).not.toHaveBeenCalled();
    expect(said().textContent).toBe('');

    fireEvent.click(within(group).getByRole('button', { name: 'Large' }));
    expect(onSizeChange).toHaveBeenCalledWith('weather', 'large');
    expect(within(group).getByRole('button', { name: 'Large' })).toHaveAttribute('aria-pressed', 'true');
    expect(said().textContent).toBe('“Weather” set to Large.');
  });

  it('puts the lock on Gardens — never a switch — with « always shown » under its name (V9)', () => {
    render(<Panel level="gardener" initial={presetFor('gardener')} />);
    const gardens = rowOf('gardens');
    expect(within(gardens).queryByRole('switch')).toBeNull();
    expect(within(gardens).getByRole('img', { name: 'Gardens can’t be hidden' })).toBeInTheDocument();
    expect(gardens).toHaveTextContent('always shown');
    expect(within(rowOf('tips')).getByRole('switch', { name: 'Show — Tips' })).toBeChecked();
  });

  it('keeps a hidden widget at its place, switched off and « Hidden » — Harvest « Coming soon » —; the switch shows it and says so, the row where it was', () => {
    const initial = presetFor('gardener').map((block) => (block.key === 'month' ? { ...block, hidden: true } : block));
    const onVisibilityChange = vi.fn();
    render(<Panel level="gardener" initial={initial} onVisibilityChange={onVisibilityChange} />);
    const order = () => [...panel().querySelectorAll('[data-panel-widget]')].map((node) => node.getAttribute('data-panel-widget'));
    const before = order();
    expect(rowOf('month')).toHaveTextContent('Hidden');
    expect(rowOf('harvest')).toHaveTextContent('Coming soon');

    fireEvent.click(within(rowOf('month')).getByRole('switch', { name: 'Show — This month' }));

    expect(onVisibilityChange).toHaveBeenCalledWith('month', false);
    expect(within(rowOf('month')).getByRole('switch', { name: 'Show — This month' })).toBeChecked();
    expect(rowOf('month')).not.toHaveTextContent('Hidden');
    expect(order()).toEqual(before);
    expect(said().textContent).toBe('“This month” shown.');

    fireEvent.click(within(rowOf('month')).getByRole('switch', { name: 'Show — This month' }));
    expect(onVisibilityChange).toHaveBeenLastCalledWith('month', true);
    expect(said().textContent).toBe('“This month” hidden.');
  });

  it('has ONE region of its own, born empty — no text node at all — and polite; dnd-kit’s own stays silent', () => {
    render(<Panel level="gardener" initial={presetFor('gardener')} />);
    const region = said();
    expect(region).toHaveAttribute('role', 'status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region.childNodes).toHaveLength(0);
    expect(panel().querySelectorAll('[data-customize-said]')).toHaveLength(1);

    fireEvent.click(within(rowOf('tips')).getByRole('button', { name: 'Move “Tips” down' }));
    expect(region.textContent).toBe('“Tips” moves to 4th place.');
    // dnd-kit's region is announced nothing: `ReorderableList` hands every sentence to the owner.
    const dndKit = [...panel().querySelectorAll('[role="status"]')].filter((node) => node !== region);
    for (const node of dndKit) expect(node.textContent).toBe('');
  });

  it('says it in French, the guillemets held by no-break spaces', () => {
    localStorage.setItem('smartcrops-language', 'fr');
    render(<Panel level="gardener" initial={presetFor('gardener')} />);
    fireEvent.click(within(rowOf('weather')).getByRole('switch', { name: 'Afficher — Météo' }));
    expect(said().textContent).toBe('« Météo » masqué.');
    fireEvent.click(within(rowOf('tips')).getByRole('button', { name: 'Grand' }));
    expect(said().textContent).toBe('« Conseils » en Grand.');
    expect(within(rowOf('gardens')).getByRole('img', { name: 'Jardins ne peut pas être masqué' })).toBeInTheDocument();
  });

  it('takes no gesture while a switch of formula is in flight: the switches, the sizes, the handles and ▲ ▼ disabled (S5)', () => {
    render(<Panel level="gardener" initial={presetFor('gardener')} switching />);
    const row = rowOf('tips');
    expect(within(row).getByRole('switch', { name: 'Show — Tips' })).toBeDisabled();
    for (const pill of within(within(row).getByRole('group', { name: 'Size of “Tips”' })).getAllByRole('button')) {
      expect(pill).toBeDisabled();
    }
    expect(within(row).getByRole('button', { name: 'Move “Tips” up' })).toBeDisabled();
    expect(within(row).getByRole('button', { name: 'Move “Tips” down' })).toBeDisabled();
    expect(within(row).getByRole('button', { name: 'Drag “Tips”' })).toBeDisabled();
  });

  it('Escape CANCELS a row held at the keyboard and leaves the drawer open; with no row held, Escape closes it', async () => {
    const onClose = vi.fn();
    render(<Panel level="gardener" initial={presetFor('gardener')} onClose={onClose} />);
    const handle = within(rowOf('tips')).getByRole('button', { name: 'Drag “Tips”' });
    handle.focus();

    await act(async () => {
      fireEvent.keyDown(handle, { code: 'Space', key: ' ' });
      // dnd-kit's keyboard sensor listens for the next key a tick AFTER the
      // one that picked the row up (the `ReorderableList.test.tsx` idiom).
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(said().textContent).toContain('“Tips” is being moved');

    await act(async () => {
      fireEvent.keyDown(handle, { code: 'Escape', key: 'Escape' });
    });
    expect(said().textContent).toBe('Moving “Tips” cancelled.');
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(handle, { code: 'Escape', key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
