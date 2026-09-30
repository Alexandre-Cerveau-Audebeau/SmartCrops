import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../i18n/i18n';
import { LanguageProvider } from '../../contexts/LanguageContext';
import { createAppTheme } from '../../theme';
import { isAdjusted } from '../../constants/dashboardCapabilities';
import { capabilitiesFor, presetFor } from '../../test/fixtures/formulas';
import { contrast, hex, over, type Rgb } from '../../test/contrast';
import { rulesFor } from '../../test/dashboardDom';
import { LIVE_REGION_CLEAR_MS } from '../../hooks/useLiveRegion';
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
  /** The drawer open — the default — or closed. */
  open?: boolean;
  mode?: 'light' | 'dark';
  switching?: boolean;
  onClose?: () => void;
  onReset?: () => void;
  onReorder?: (blocks: DashboardBlock[]) => void;
  onVisibilityChange?: (key: DashboardBlockKey, hidden: boolean) => void;
  onSizeChange?: (key: DashboardBlockKey, size: DashboardSize) => void;
}

/**
 * The panel over a layout it writes back, as the page's `setBlocks` and
 * `patchBlock` do — its reset brings the preset's layout back, and
 * « adjusted » is the page's own `isAdjusted`.
 */
function Panel({ level, initial, open = true, mode = 'light', switching = false, onClose = () => {}, onReset, onReorder, onVisibilityChange, onSizeChange }: PanelProps) {
  const [blocks, setBlocks] = useState(initial);
  const patch = (key: DashboardBlockKey, change: Partial<DashboardBlock>) =>
    setBlocks((current) => current.map((block) => (block.key === key ? { ...block, ...change } : block)));
  return (
    <ThemeProvider theme={createAppTheme(mode)}>
      <LanguageProvider>
        <CustomizePanel
          open={open}
          level={level}
          capabilities={capabilitiesFor(level)}
          blocks={blocks}
          adjusted={isAdjusted(blocks, capabilitiesFor(level))}
          switching={switching}
          onClose={onClose}
          onChangeFormula={() => {}}
          onReset={() => {
            onReset?.();
            setBlocks(presetFor(level));
          }}
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
  // is gone — the clock a test ran on included: the real one comes back here,
  // the one owner of the timer mode, whether a test faked it or not.
  cleanup();
  vi.useRealTimers();
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

  // SMA-437, lot V3-07, P2 (contract A-17; V3-07 § 6) — « Réinitialiser la
  // disposition X »: inert on the preset, saying why; otherwise it puts the
  // layout back and the region says so, in the panel's one region.
  it('names the reset after the formula; inert on the preset, it says why and does nothing; once the layout moves, it resets and says so', () => {
    const onReset = vi.fn();
    render(<Panel level="expert" initial={presetFor('expert')} onReset={onReset} />);
    const reset = screen.getByRole('button', { name: 'Reset the Expert layout' });
    expect(reset).toHaveAttribute('aria-disabled', 'true');
    expect(panel()).toHaveTextContent('This is already the starting layout.');
    fireEvent.click(reset);
    expect(onReset).not.toHaveBeenCalled();
    expect(said().textContent).toBe('');

    fireEvent.click(within(rowOf('stats')).getByRole('switch', { name: 'Show — Statistics' }));
    expect(reset).not.toHaveAttribute('aria-disabled');
    expect(panel()).toHaveTextContent('Each widget’s own settings (key figures, sorts, photos) are kept.');

    fireEvent.click(reset);
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(said().textContent).toBe('The Expert layout is restored.');
    expect(reset).toHaveAttribute('aria-disabled', 'true');
    expect(within(rowOf('stats')).getByRole('switch', { name: 'Show — Statistics' })).toBeChecked();
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

/** The LAST value a node's emitted rules give a property — the one the cascade keeps. */
function lastDeclared(node: Element, property: string): string | undefined {
  const found = [...rulesFor(node).matchAll(new RegExp(`[{;]\\s*${property}:\\s*([^;}]+)`, 'g'))];
  return found.at(-1)?.[1]!.trim();
}

/** The veil MUI writes inline on a Paper at night — `linear-gradient(rgba(255, 255, 255, a), …)` —, its colour. */
function nightVeil(paper: HTMLElement): string {
  const veil = /rgba\([^)]*\)/.exec(paper.style.getPropertyValue('--Paper-overlay'));
  if (!veil) throw new Error('No --Paper-overlay written inline on the drawer’s Paper');
  return veil[0];
}

/**
 * What the drawer paints behind its text: the Paper's colour, under the last
 * background image its rules give it — `none`, or the veil MUI declares,
 * `var(--Paper-overlay)`.
 */
function paintedBehindText(paper: HTMLElement): Rgb {
  const colour = lastDeclared(paper, 'background-color');
  if (!colour || !/^#[0-9a-f]{6}$/i.test(colour)) throw new Error(`Unexpected background-color on the drawer: ${colour}`);
  const image = lastDeclared(paper, 'background-image');
  if (image === 'none') return hex(colour);
  if (image !== 'var(--Paper-overlay)') throw new Error(`Unexpected background-image on the drawer: ${image}`);
  return over(nightVeil(paper), hex(colour));
}

// SMA-437, lot V3-07, P4 (contract A-18 — Alexandre, 28/09: « le tiroir de
// nuit sans le voile MUI »; SMA-450) — at night MUI lightens a Paper by its
// elevation: the temporary Drawer's 16 lays 14.7 % of white over its colour,
// and the panel's secondary text fell to 3.9:1, under the 4.5 of V14. The
// veil goes on THIS drawer only, as on the options Popover (D15) — the
// theme's `MuiPaper` keeps it for every other dialog and menu.
describe('CustomizePanel — the drawer at night (A-18)', () => {
  it('paints the drawer WITHOUT the elevation veil: its secondary text holds 4.5:1 on what is painted', () => {
    const theme = createAppTheme('dark');
    render(<Panel level="gardener" initial={presetFor('gardener')} mode="dark" />);
    const paper = (panel().closest('.MuiPaper-root') ?? panel()) as HTMLElement;
    const secondary = hex(theme.palette.text.secondary);

    expect(contrast(secondary, paintedBehindText(paper))).toBeGreaterThanOrEqual(4.5);
    // The veil MUI still writes inline, painted, would hold it under 4.5.
    expect(contrast(secondary, over(nightVeil(paper), hex(theme.palette.background.paper)))).toBeLessThan(4.5);
  });
});

// SMA-437, PR #303, fix round 1, R1 — Alexandre, 30/09, on the [P] n° 14
// (« ok »): the panel's note is ON SCREEN, so it stays until the next
// sentence replaces it or the drawer closes with it. Emptied 5 s after its
// sentence, it folded, and « Réinitialiser » under it moved up with no
// gesture — « un bouton ne change jamais de place sous le doigt ». Where the
// button stands is measured in Chrome (`pageLayout.test.tsx`); here, what
// the region holds.
describe('CustomizePanel — the note stays until the next sentence (PR #303, fix round 1, R1)', () => {
  /** Six seconds: past the five after which the note used to be emptied. */
  const LATER = LIVE_REGION_CLEAR_MS + 1000;

  it('keeps the switch’s sentence on screen: six seconds on, the note still says it', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    render(<Panel level="gardener" initial={presetFor('gardener')} />);
    fireEvent.click(within(rowOf('tips')).getByRole('switch', { name: 'Show — Tips' }));
    expect(said().textContent).toBe('“Tips” hidden.');

    act(() => {
      vi.advanceTimersByTime(LATER);
    });
    expect(said().textContent).toBe('“Tips” hidden.');
  });

  it('the next gesture’s sentence replaces the note in ONE write — the old one taken out, the new one put in, the old never said again', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    render(<Panel level="gardener" initial={presetFor('gardener')} />);
    fireEvent.click(within(rowOf('tips')).getByRole('switch', { name: 'Show — Tips' }));
    act(() => {
      vi.advanceTimersByTime(LATER);
    });

    const region = said();
    const observer = new MutationObserver(() => {});
    observer.observe(region, { childList: true, characterData: true, subtree: true });
    fireEvent.click(within(rowOf('tips')).getByRole('switch', { name: 'Show — Tips' }));
    const records = observer.takeRecords();
    observer.disconnect();

    expect(region.textContent).toBe('“Tips” shown.');
    expect(records).toHaveLength(1);
    expect([...records[0]!.removedNodes].map((node) => node.textContent)).toEqual(['“Tips” hidden.']);
    expect([...records[0]!.addedNodes].map((node) => node.textContent)).toEqual(['“Tips” shown.']);
  });

  it('goes with the drawer: closed, the note is gone with its region; opened again, the region is born empty', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const initial = presetFor('gardener');
    const { rerender } = render(<Panel level="gardener" initial={initial} />);
    const region = said();
    fireEvent.click(within(rowOf('tips')).getByRole('switch', { name: 'Show — Tips' }));
    expect(region.textContent).toBe('“Tips” hidden.');

    rerender(<Panel level="gardener" initial={initial} open={false} />);
    // The drawer's slide out, which MUI's transition ends on a timer; the
    // proof it is gone is its region out of the document — MUI hides a
    // closing drawer from the accessibility tree at once, and unmounts it
    // only once the slide has run.
    act(() => {
      vi.advanceTimersByTime(LATER);
    });
    expect(region.isConnected).toBe(false);

    rerender(<Panel level="gardener" initial={initial} />);
    expect(said()).not.toBe(region);
    expect(said().childNodes).toHaveLength(0);
  });
});
