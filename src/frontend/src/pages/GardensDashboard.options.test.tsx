import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import { presetFor } from '../constants/dashboardPresets';

vi.mock('../services/gardenApi', () => ({
  createGarden: vi.fn(),
  updateGarden: vi.fn(),
  deleteGarden: vi.fn(),
}));

vi.mock('../services/dashboardApi', () => ({
  fetchDashboardPreferences: vi.fn(),
  saveDashboardPreferences: vi.fn(),
  fetchDashboardData: vi.fn(),
}));

import type {
  DashboardData,
  DashboardGardenData,
  DashboardVarietyData,
} from '../types/DashboardData';
import GardensDashboard from './GardensDashboard';
import {
  fetchDashboardData,
  fetchDashboardPreferences,
  saveDashboardPreferences,
} from '../services/dashboardApi';

// SMA-336 PR 2/5 (B7) — the gear stops opening on an empty panel. The two
// entries of artboard A8 write to `DashboardBlock.options`, the document PR 1/5
// stored and round-tripped without ever writing to it.

const garden = (id: string, name: string): DashboardGardenData => ({
  id,
  name,
  description: null,
  width: 4,
  height: 3,
  cellSize: '50cm',
  cellsJson: null,
  config: {
    orientation: null,
    gardenType: null,
    lightSchedule: null,
    hemisphere: 'N',
    latitudeBand: 'mid',
  },
  updatedAt: '2026-05-01T00:00:00Z',
  placements: [],
  placementCount: 1,
  varietyCount: 1,
  occupiedCells: 1,
  isEdible: true,
});

const variety = (
  plantId: string,
  commonName: string,
  gardenIds: string[]
): DashboardVarietyData => ({
  plantId,
  scientificName: 'Ocimum basilicum',
  commonName,
  plantType: 'Herb',
  isEdible: true,
  imageUrl: 'https://bs.plantnet.org/habit.jpg',
  imageAttribution: 'Credit',
  count: 2,
  cells: 2,
  gardenIds,
});

const data: DashboardData = {
  gardens: [garden('g1', 'Terrasse'), garden('g2', 'Balcon')],
  varieties: [
    variety('p-1', 'Basil', ['g1']),
    variety('p-2', 'Aubergine', ['g2']),
  ],
  totals: {
    gardenCount: 2,
    placementCount: 4,
    varietyCount: 2,
    catalogPlantCount: 536,
  },
};

/** The last layout the debounced save sent. */
const lastSaved = () => {
  const calls = vi.mocked(saveDashboardPreferences).mock.calls;
  return calls[calls.length - 1]![0];
};

const countersOptionsOf = (
  blocks: { key: string; options?: Record<string, unknown> | null }[]
) => blocks.find((block) => block.key === 'counters')?.options;

beforeEach(() => {
  localStorage.setItem('smartcrops-language', 'en');
  vi.mocked(fetchDashboardPreferences).mockResolvedValue({
    schemaVersion: 1,
    level: 'expert',
    isPreset: true,
    blocks: presetFor('expert'),
    updatedAt: null,
  });
  vi.mocked(saveDashboardPreferences).mockClear();
  vi.mocked(saveDashboardPreferences).mockResolvedValue(undefined);
  vi.mocked(fetchDashboardData).mockResolvedValue(data);
});

afterEach(() => vi.clearAllMocks());

function renderPage() {
  render(
    <LanguageProvider>
      <MemoryRouter>
        <GardensDashboard />
      </MemoryRouter>
    </LanguageProvider>
  );
}

/** The same allowance `GardensDashboard.edit.test.tsx` gives its own helper. */
const RENDER_TIMEOUT = { timeout: 10000 };

async function openCountersOptions() {
  renderPage();
  const edit = await screen.findByRole('button', { name: 'Edit' }, RENDER_TIMEOUT);
  // ENABLED, not merely present (round 1, E17 — the same trap round 3 of PR ①
  // caught in `edit.test.tsx`). `GardensDashboard` renders Edit
  // `disabled={loading || loadError}`, so `findByRole` can hand back a button
  // that is still disabled: the click is swallowed, « Done » never arrives, and
  // the failure reads as a bare timeout that names nothing.
  await waitFor(() => expect(edit).toBeEnabled(), RENDER_TIMEOUT);
  fireEvent.click(edit);
  await screen.findByRole('button', { name: 'Done' }, RENDER_TIMEOUT);
  fireEvent.click(
    screen.getByRole('button', { name: 'Counts by variety options' })
  );
  // A `dialog` since round 1 (G6): the settings surface is a Popover now, not
  // a Menu, so its content stops being treated as a MenuList.
  return await screen.findByRole('dialog');
}

describe('the Counters widget options (artboard A8)', () => {
  it('offers the two entries the frozen design draws', async () => {
    const menu = await openCountersOptions();

    expect(within(menu).getByText('Widget options')).toBeInTheDocument();
    expect(
      within(menu).getByRole('switch', { name: 'Plant photos' })
    ).toBeInTheDocument();
    expect(within(menu).getByRole('combobox', { name: 'Garden' })).toBeInTheDocument();
    // And no longer the sentence that stood in for them.
    expect(within(menu).queryByText('No option for this widget yet.')).toBeNull();
  });

  it('a widget with no settings still says so', async () => {
    renderPage();
    // Same enabled-state wait as the helper above (round 1, E17).
    const edit = await screen.findByRole('button', { name: 'Edit' }, RENDER_TIMEOUT);
    await waitFor(() => expect(edit).toBeEnabled(), RENDER_TIMEOUT);
    fireEvent.click(edit);
    await screen.findByRole('button', { name: 'Done' }, RENDER_TIMEOUT);

    fireEvent.click(screen.getByRole('button', { name: 'Tips options' }));

    const menu = await screen.findByRole('dialog', { name: 'Tips options' });
    expect(
      within(menu).getByText('No option for this widget yet.')
    ).toBeInTheDocument();
  });

  it('turning photos on persists it on the block', async () => {
    const menu = await openCountersOptions();

    fireEvent.click(within(menu).getByRole('switch', { name: 'Plant photos' }));

    await waitFor(() =>
      expect(countersOptionsOf(lastSaved().blocks)).toEqual({
        photos: true,
        garden: 'all',
      })
    );
  });

  it('turning photos on draws them, and leaves the other widgets alone', async () => {
    const menu = await openCountersOptions();

    fireEvent.click(within(menu).getByRole('switch', { name: 'Plant photos' }));

    const widget = document.querySelector('[data-widget="counters"]')!;
    await waitFor(() =>
      expect(widget.querySelectorAll('img').length).toBeGreaterThan(0)
    );

    // And the setting lands on THAT block only: a document written onto the
    // wrong one would be stored, round-tripped and never noticed, because seven
    // of the eight widgets read no options at all.
    await waitFor(() => expect(saveDashboardPreferences).toHaveBeenCalled());
    const others = lastSaved().blocks.filter((block) => block.key !== 'counters');
    expect(others.every((block) => !block.options)).toBe(true);
  });

  it('does NOT mark the layout « adjusted »', async () => {
    // The level chip tracks what the user REARRANGED — order, size, visibility.
    // Turning plant photos on is not a rearrangement, and `isAdjusted` excludes
    // options for exactly this reason.
    const menu = await openCountersOptions();
    expect(screen.getByText('Expert view')).toBeInTheDocument();

    fireEvent.click(within(menu).getByRole('switch', { name: 'Plant photos' }));

    await waitFor(() => expect(saveDashboardPreferences).toHaveBeenCalled());
    expect(screen.getByText('Expert view')).toBeInTheDocument();
    expect(screen.queryByText('Expert view · adjusted')).toBeNull();
  });

  it('picking a garden filters the widget and persists the choice', async () => {
    const menu = await openCountersOptions();

    fireEvent.mouseDown(within(menu).getByRole('combobox', { name: 'Garden' }));
    const listbox = await screen.findByRole('listbox');
    fireEvent.click(within(listbox).getByRole('option', { name: 'Balcon' }));

    await waitFor(() =>
      expect(countersOptionsOf(lastSaved().blocks)).toEqual({
        photos: false,
        garden: 'g2',
      })
    );
    const widget = within(
      document.querySelector('[data-widget="counters"]') as HTMLElement
    );
    await waitFor(() => expect(widget.queryByText('Basil')).toBeNull());
    expect(widget.getByText('Aubergine')).toBeInTheDocument();
  });
});

// ── G6: the settings surface stopped being a Menu.
//
// `CountersOptionsPanel` holds a switch and a select — form controls, not
// `MenuItem`s — and `Menu` wraps its children in a `MenuList`, which owns the
// arrow keys and adds character typeahead. Inside it, Up and Down moved the
// menu's focus instead of operating the control under it.
describe('the widget settings surface is a Popover, not a Menu (round 1, G6)', () => {
  it('is not a menu, and its controls are not menu items', async () => {
    const panel = await openCountersOptions();

    expect(screen.queryByRole('menu')).toBeNull();
    expect(within(panel).queryAllByRole('menuitem')).toHaveLength(0);
    // « Terminé » is a button, which is what it always was semantically.
    expect(within(panel).getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  it('names the surface, so a screen reader says whose settings these are', async () => {
    // `Menu` gave it a `menu` role for free; a bare Popover would have left a
    // focus-trapping panel with no role and no name at all.
    const panel = await openCountersOptions();

    expect(panel).toHaveAttribute('role', 'dialog');
    expect(panel).toHaveAccessibleName('Counts by variety options');
  });

  it('opens from the keyboard and gives the focus to its content', async () => {
    renderPage();
    const edit = await screen.findByRole('button', { name: 'Edit' }, RENDER_TIMEOUT);
    await waitFor(() => expect(edit).toBeEnabled(), RENDER_TIMEOUT);
    fireEvent.click(edit);
    await screen.findByRole('button', { name: 'Done' }, RENDER_TIMEOUT);

    const gear = screen.getByRole('button', { name: 'Counts by variety options' });
    gear.focus();
    const user = userEvent.setup();
    await user.keyboard('{Enter}');

    const panel = await screen.findByRole('dialog');
    await waitFor(() => expect(panel.contains(document.activeElement)).toBe(true));
  });

  it('Escape closes it and hands the focus back to the gear', async () => {
    // The gear is captured BEFORE the panel opens: `Popover` is a Modal, so it
    // marks the rest of the document `aria-hidden` while it is up and the
    // button is no longer reachable by role.
    renderPage();
    const edit = await screen.findByRole('button', { name: 'Edit' }, RENDER_TIMEOUT);
    await waitFor(() => expect(edit).toBeEnabled(), RENDER_TIMEOUT);
    fireEvent.click(edit);
    await screen.findByRole('button', { name: 'Done' }, RENDER_TIMEOUT);
    const gear = screen.getByRole('button', { name: 'Counts by variety options' });

    // Focused first, the way a browser focuses a button it is given a click on
    // and the way a keyboard user reaches it — `fireEvent.click` alone moves no
    // focus in jsdom, so the Modal would have `body` to restore to and the test
    // would prove nothing about the gear.
    gear.focus();
    fireEvent.click(gear);
    const panel = await screen.findByRole('dialog');

    fireEvent.keyDown(panel, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(gear));
  });

  it('the arrow keys stay with the control, not with a list', async () => {
    // The behaviour `MenuList` added and `Popover` does not: an arrow key
    // inside the panel used to move the menu's own focus off the switch.
    const panel = await openCountersOptions();
    const toggle = within(panel).getByRole('switch', { name: 'Plant photos' });
    toggle.focus();

    fireEvent.keyDown(toggle, { key: 'ArrowDown' });

    expect(document.activeElement).toBe(toggle);
  });

  it('« Terminé » closes the panel', async () => {
    const panel = await openCountersOptions();

    fireEvent.click(within(panel).getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
