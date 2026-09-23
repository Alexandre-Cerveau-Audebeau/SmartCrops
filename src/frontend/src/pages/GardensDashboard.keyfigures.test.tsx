import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import { UnitSystemProvider } from '../contexts/UnitSystemContext';
import { EMPTY_WEATHER_DATA } from '../types/DashboardWeather';
import { presetFor } from '../constants/dashboardPresets';
import { dashboardFixture, gardenFixture } from '../test/fixtures/dashboard';

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

// Never a real provider call: the weather service is mocked whole.
vi.mock('../services/weatherApi', () => ({
  fetchDashboardWeather: vi.fn(),
  searchLocations: vi.fn(),
  saveGardenLocation: vi.fn(),
  clearGardenLocation: vi.fn(),
  saveProfileLocation: vi.fn(),
  clearProfileLocation: vi.fn(),
}));

vi.mock('../services/profileApi', () => ({ fetchProfile: vi.fn() }));

import { fetchDashboardWeather } from '../services/weatherApi';
import { fetchProfile } from '../services/profileApi';
import GardensDashboard from './GardensDashboard';
import {
  fetchDashboardData,
  fetchDashboardPreferences,
  saveDashboardPreferences,
} from '../services/dashboardApi';
import type { DashboardBlock } from '../types/Dashboard';

// SMA-437 lot 1, PR B, step B5 (contract § 4.5; A-N23) — the gear of the Key
// figures band, in the real `Popover` of the page: four numbered emplacements,
// one REPLACES a figure and never adds nor removes one, choosing a figure
// already shown SWAPS the two places, the order moves by the handle and by
// ▲ ▼ with the new place said, « Rétablir » is inert at the defaults — and
// Escape, in the catalogue or during a keyboard drag, never closes the panel.

/** One garden, 10 × 8, nothing planted: eighty free cells. */
const data = dashboardFixture([gardenFixture({ id: 'g1', name: 'Terrasse', width: 10, height: 8 })]);

function serve(blocks: DashboardBlock[] = presetFor('expert')) {
  vi.mocked(fetchDashboardPreferences).mockResolvedValue({
    schemaVersion: 1,
    level: 'expert',
    isPreset: false,
    blocks,
    updatedAt: null,
  });
}

function renderPage() {
  return render(
    <LanguageProvider>
      <UnitSystemProvider>
        <MemoryRouter>
          <GardensDashboard />
        </MemoryRouter>
      </UnitSystemProvider>
    </LanguageProvider>
  );
}

/** Edit mode, then the band's gear: the panel. */
async function openPanel(language: 'en' | 'fr' = 'en') {
  localStorage.setItem('smartcrops-language', language);
  renderPage();
  // « Edit » is drawn, DISABLED, while the layout loads: a click then is lost.
  const edit = await screen.findByRole('button', { name: language === 'en' ? 'Edit' : 'Modifier' });
  await waitFor(() => expect(edit).toBeEnabled());
  fireEvent.click(edit);
  fireEvent.click(await screen.findByRole('button', { name: language === 'en' ? 'Key figures options' : 'Options de Chiffres clés' }));
  const panel = await screen.findByRole('dialog');
  // The figures' values arrive with the gardens.
  await within(panel).findByText('80');
  return panel;
}

/** The emplacement buttons, top to bottom. */
const slots = (panel: HTMLElement) =>
  within(within(panel).getByRole('list', { name: 'Your four figures, in the order of the tiles' })).getAllByRole('button', {
    name: /^Replace/,
  });

/**
 * The panel's own live region — by its attribute: dnd-kit renders a
 * `role="status"` of its own inside the list's drag context.
 */
const said = (panel: HTMLElement) => panel.querySelector('[data-key-figures-said]') as HTMLElement;

/** The figures the last debounced save carried for the band. */
async function savedFigures() {
  await waitFor(() => expect(saveDashboardPreferences).toHaveBeenCalled(), { timeout: 3000 });
  const calls = vi.mocked(saveDashboardPreferences).mock.calls;
  const last = calls[calls.length - 1]![0];
  return last.blocks.find((block) => block.key === 'keyfigures')?.options?.figures;
}

beforeEach(() => {
  vi.mocked(fetchDashboardWeather).mockResolvedValue(EMPTY_WEATHER_DATA);
  vi.mocked(fetchProfile).mockResolvedValue({
    email: 'a@example.test',
    displayName: null,
    firstName: null,
    lastName: null,
    city: null,
    hasPassword: true,
  });
  vi.mocked(fetchDashboardData).mockResolvedValue(data);
  vi.mocked(saveDashboardPreferences).mockResolvedValue(undefined);
  serve();
});

// jsdom implements no `scrollIntoView`; dnd-kit's keyboard sensor calls it
// when a row is picked up (the `Contact.test.tsx` idiom).
const originalScrollIntoView = Element.prototype.scrollIntoView;
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
  vi.clearAllMocks();
});

describe('the band’s gear — four emplacements, « Toujours quatre »', () => {
  it('lists the four figures, numbered in the order of the tiles, each with its value', async () => {
    const panel = await openPanel();
    expect(within(panel).getByText('Your four figures')).toBeInTheDocument();
    expect(within(panel).getByText('Always four.')).toBeInTheDocument();
    expect(slots(panel).map((slot) => slot.getAttribute('aria-label'))).toEqual([
      'Replace “Free cells”, 1st place',
      'Replace “Occupancy”, 2nd place',
      'Replace “Varieties”, 3rd place',
      'Replace “To do today”, 4th place',
    ]);
    expect(slots(panel)[0]).toHaveTextContent('80');
    // No button adds a figure, none removes one: three or five cannot be formed.
    expect(within(panel).queryByRole('button', { name: /^(Add|Remove)/ })).toBeNull();
  });

  it('▲ moves a figure up a place, says the new place, keeps the focus — and writes the order', async () => {
    const panel = await openPanel();
    const up = within(panel).getByRole('button', { name: 'Move “Varieties” up' });
    up.focus();
    fireEvent.click(up);

    expect(said(panel)).toHaveTextContent('“Varieties” moves to 2nd place.');
    expect(document.activeElement).toBe(within(panel).getByRole('button', { name: 'Move “Varieties” up' }));
    expect(slots(panel)[1]).toHaveAccessibleName('Replace “Varieties”, 2nd place');
    expect(await savedFigures()).toEqual(['free', 'varieties', 'occupancy', 'todo']);
  });

  it('opens the catalogue IN the panel on « Replace »: the 22 figures in five groups, the emplacement’s own checked and marked', async () => {
    const panel = await openPanel();
    fireEvent.click(slots(panel)[1]!);

    expect(within(panel).getByRole('heading', { name: 'Replace “Occupancy” — 2nd place' })).toBeInTheDocument();
    const group = within(panel).getByRole('radiogroup', { name: 'Choose a figure' });
    expect(within(group).getAllByRole('radio')).toHaveLength(22);
    for (const heading of ['Your gardens', 'The space', 'This month', 'Today', 'To complete']) {
      expect(within(group).getByText(heading)).toBeInTheDocument();
    }
    expect(within(group).getByRole('radio', { name: /Occupancy/ })).toBeChecked();
    expect(within(group).getByRole('radio', { name: /Occupancy/ }).closest('label')).toHaveTextContent('the place to replace');
    expect(within(group).getByRole('radio', { name: /^Free cells(?! in full sun)/ }).closest('label')).toHaveTextContent('already in 1st place');
  });

  it('SWAPS the two places when the figure chosen is already shown — no duplicate, no hole, no error', async () => {
    const panel = await openPanel();
    fireEvent.click(slots(panel)[1]!);
    fireEvent.click(within(panel).getByRole('radio', { name: /^Free cells(?! in full sun)/ }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Replace' }));

    expect(slots(panel).map((slot) => slot.getAttribute('aria-label'))).toEqual([
      'Replace “Occupancy”, 1st place',
      'Replace “Free cells”, 2nd place',
      'Replace “Varieties”, 3rd place',
      'Replace “To do today”, 4th place',
    ]);
    expect(said(panel)).toHaveTextContent('“Free cells” and “Occupancy” swap places.');
    // The focus comes back to the emplacement it left.
    await waitFor(() => expect(document.activeElement).toBe(slots(panel)[1]));
    expect(await savedFigures()).toEqual(['occupancy', 'free', 'varieties', 'todo']);
  });

  it('REPLACES with a figure not shown yet — still four', async () => {
    const panel = await openPanel();
    fireEvent.click(slots(panel)[3]!);
    fireEvent.click(within(panel).getByRole('radio', { name: /^Cities/ }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Replace' }));

    expect(slots(panel)).toHaveLength(4);
    expect(slots(panel)[3]).toHaveAccessibleName('Replace “Cities”, 4th place');
    expect(said(panel)).toHaveTextContent('“Cities” replaces “To do today” in 4th place.');
    expect(await savedFigures()).toEqual(['free', 'occupancy', 'varieties', 'cities']);
  });

  it('comes back to the four on Escape in the catalogue — the panel stays open', async () => {
    const panel = await openPanel();
    fireEvent.click(slots(panel)[2]!);
    const checked = within(panel).getByRole('radio', { name: /^Varieties/ });

    fireEvent.keyDown(checked, { key: 'Escape', code: 'Escape' });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(panel).queryByRole('radiogroup')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(slots(panel)[2]));
  });

  it('cancels a keyboard drag on Escape — the panel stays open, nothing moves', async () => {
    const panel = await openPanel();
    const handle = within(panel).getByRole('button', { name: 'Drag “Occupancy”' });
    handle.focus();
    await act(async () => {
      fireEvent.keyDown(handle, { key: ' ', code: 'Space' });
      // dnd-kit's keyboard sensor listens for the next key a tick AFTER the
      // one that picked the row up.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(said(panel)).toHaveTextContent('“Occupancy” is being moved');

    await act(async () => {
      fireEvent.keyDown(handle, { key: 'Escape', code: 'Escape' });
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(said(panel)).toHaveTextContent('Moving “Occupancy” cancelled.');
    expect(slots(panel)[1]).toHaveAccessibleName('Replace “Occupancy”, 2nd place');
  });

  it('keeps « Restore the default figures » inert at the defaults, with its note — and restores them once they differ', async () => {
    const panel = await openPanel();
    const restore = within(panel).getByRole('button', { name: 'Restore the default figures' });
    expect(restore).toHaveAttribute('aria-disabled', 'true');
    expect(within(panel).getByText('These are already the default figures.')).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole('button', { name: 'Move “Occupancy” up' }));
    expect(within(panel).getByRole('button', { name: 'Restore the default figures' })).not.toHaveAttribute('aria-disabled');

    fireEvent.click(within(panel).getByRole('button', { name: 'Restore the default figures' }));
    expect(slots(panel)[0]).toHaveAccessibleName('Replace “Free cells”, 1st place');
    expect(said(panel)).toHaveTextContent('The four default figures are back.');
  });

  it('never turns the chip « · adjusted »: the figures are options, and `isAdjusted` reads none (V19)', async () => {
    const panel = await openPanel();
    fireEvent.click(slots(panel)[3]!);
    fireEvent.click(within(panel).getByRole('radio', { name: /^Cities/ }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Replace' }));
    await savedFigures();

    expect(screen.getByText('Expert view')).toBeInTheDocument();
    expect(screen.queryByText('Expert view · adjusted')).toBeNull();
  });

  it('writes the French ordinals — « 1ʳᵉ place », « 2ᵉ place »', async () => {
    localStorage.setItem('smartcrops-language', 'fr');
    renderPage();
    const edit = await screen.findByRole('button', { name: 'Modifier' });
    await waitFor(() => expect(edit).toBeEnabled());
    fireEvent.click(edit);
    fireEvent.click(await screen.findByRole('button', { name: 'Options de Chiffres clés' }));
    const panel = await screen.findByRole('dialog');
    expect(within(panel).getByRole('button', { name: 'Remplacer «\u00a0Cases libres\u00a0», 1ʳᵉ place' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Remplacer «\u00a0Occupation\u00a0», 2ᵉ place' })).toBeInTheDocument();
  });
});
