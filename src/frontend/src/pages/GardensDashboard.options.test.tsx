import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import { presetFor } from '../constants/dashboardPresets';
import {
  dashboardFixture,
  gardenFixture,
  varietyFixture,
} from '../test/fixtures/dashboard';

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

// One placed edible variety per garden — the overrides that carry meaning
// for the options tests stay here (round 6, Extension #4-6).
const garden = (id: string, name: string): DashboardGardenData =>
  gardenFixture({
    id,
    name,
    placementCount: 1,
    varietyCount: 1,
    occupiedCells: 1,
    isEdible: true,
  });

// A photographed variety, planted twice — the photos option is what these
// tests toggle, so the image is the override that carries meaning here.
const variety = (
  plantId: string,
  commonName: string,
  gardenIds: string[]
): DashboardVarietyData =>
  varietyFixture({
    plantId,
    commonName,
    imageUrl: 'https://bs.plantnet.org/habit.jpg',
    imageAttribution: 'Credit',
    count: 2,
    cells: 2,
    gardenIds,
  });

const GARDENS = [garden('g1', 'Terrasse'), garden('g2', 'Balcon')];
const VARIETIES = [
  variety('p-1', 'Basil', ['g1']),
  variety('p-2', 'Aubergine', ['g2']),
];

// Totals DERIVED, never restated (round 7, S18 — Extension #6-15): the fixture
// used to say four placements over two gardens holding one each, and
// `resolveCountersFigures` reads both sides. FROZEN for the reason
// `EMPTY_DASHBOARD_DATA` is: one reference reaches every test in this file and
// every widget of the page it renders, and nothing else enforced that no test
// writes into it.
const data: DashboardData = Object.freeze(
  dashboardFixture(Object.freeze(GARDENS) as DashboardGardenData[], {
    varieties: Object.freeze(VARIETIES) as DashboardVarietyData[],
  })
);

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

  it('opens each option on its own glyph (round 4, A7)', async () => {
    // `.pop-r` starts on a 22 px icon: `PhotoCameraOutlined` for the photos
    // switch and `YardOutlined` for the garden filter, both matched
    // path-for-path against the artboard. Without them a switch and a whole
    // garden filter read as one undifferentiated column.
    const menu = await openCountersOptions();

    expect(
      menu.querySelector('svg[data-testid="PhotoCameraOutlinedIcon"]')
    ).not.toBeNull();
    expect(
      menu.querySelector('svg[data-testid="YardOutlinedIcon"]')
    ).not.toBeNull();
  });

  it('a widget with no settings still says so', async () => {
    renderPage();
    // Same enabled-state wait as the helper above (round 1, E17).
    const edit = await screen.findByRole('button', { name: 'Edit' }, RENDER_TIMEOUT);
    await waitFor(() => expect(edit).toBeEnabled(), RENDER_TIMEOUT);
    fireEvent.click(edit);
    await screen.findByRole('button', { name: 'Done' }, RENDER_TIMEOUT);

    fireEvent.click(screen.getByRole('button', { name: 'Tips options' }));

    const menu = await screen.findByRole('dialog', { name: 'Tips Widget options' });
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

  it('writes the RESOLVED garden back, never a dead id (round 6, #4-8 / #5-8)', async () => {
    // The select already showed « All gardens » for a stored id no garden
    // answers to; the switch handler spread the parsed document and persisted
    // the dead id again on every toggle. The document a reader gets back now
    // names a garden that exists.
    const blocks = presetFor('expert');
    blocks.find((block) => block.key === 'counters')!.options = { garden: 'gone' };
    vi.mocked(fetchDashboardPreferences).mockResolvedValue({
      schemaVersion: 1,
      level: 'expert',
      isPreset: false,
      blocks,
      updatedAt: null,
    });
    const menu = await openCountersOptions();

    fireEvent.click(within(menu).getByRole('switch', { name: 'Plant photos' }));

    await waitFor(() =>
      expect(countersOptionsOf(lastSaved().blocks)).toEqual({
        photos: true,
        garden: 'all',
      })
    );
  });

  it.each([
    ['still loading', () => new Promise<DashboardData>(() => {})],
    ['failed', () => Promise.reject(new Error('boom'))],
  ])(
    'keeps the STORED garden while the aggregate is %s (round 7, S13 — Extension #6-5)',
    async (_state, answer) => {
      // Edit mode opens on the LAYOUT being loaded, not on the aggregate, so the
      // gear is reachable while `gardens` is the hook's empty list — during the
      // first load, and after a failed replacement. `resolveCountersGarden` can
      // only answer « all » from an empty list, and the photos toggle used to
      // persist that answer over the garden the user had chosen.
      const blocks = presetFor('expert');
      blocks.find((block) => block.key === 'counters')!.options = {
        photos: false,
        garden: 'g1',
      };
      vi.mocked(fetchDashboardPreferences).mockResolvedValue({
        schemaVersion: 1,
        level: 'expert',
        isPreset: false,
        blocks,
        updatedAt: null,
      });
      vi.mocked(fetchDashboardData).mockImplementation(answer);
      const menu = await openCountersOptions();

      fireEvent.click(within(menu).getByRole('switch', { name: 'Plant photos' }));

      await waitFor(() =>
        expect(countersOptionsOf(lastSaved().blocks)).toEqual({
          photos: true,
          garden: 'g1',
        })
      );
    }
  );

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
    // Named by its OWN two title lines through `aria-labelledby` (round 6,
    // Extension #5-5), not by an `aria-label` repeating the widget name the
    // `h3` inside already renders — one source of truth for the panel's name.
    expect(panel).toHaveAccessibleName('Counts by variety Widget options');
    expect(panel).not.toHaveAttribute('aria-label');
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
