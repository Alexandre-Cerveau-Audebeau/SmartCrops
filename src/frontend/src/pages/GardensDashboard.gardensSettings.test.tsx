import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import { UnitSystemProvider } from '../contexts/UnitSystemContext';
import { EMPTY_WEATHER_DATA } from '../types/DashboardWeather';
import { capabilitiesFor, presetFor } from '../test/fixtures/formulas';
import { dashboardFixture, gardenFixture } from '../test/fixtures/dashboard';
import { SAVE_DEBOUNCE_MS } from '../hooks/useDashboardPreferences';
import type { DashboardBlock, DashboardLevel } from '../types/Dashboard';
import type { DashboardGardenData } from '../types/DashboardData';

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

// SMA-448, lot F5-a — the Gardens widget's settings on the page (V3-04; A-N3,
// A-N4, A-N5, A-N23 — decided by Alexandre on 28/09): the count as the cap of
// the Large list, « + N autres jardins » unfolding in place without a write,
// the search that exists only while a garden is hidden, the foot that names
// the sort, the five sorts, the fallback of a sort the formula does not serve,
// and the Medium list unchanged.

/**
 * Twelve gardens. Their last modification DESCENDS with the index — so
 * « Derniers ouverts » (never opened: the fallback on the modification) is the
 * index order —, their creation ASCENDS with it, and « Verger bas » sits at
 * index 9, beyond the cut of eight.
 */
const NAMES = [
  'Terrasse',
  'Balcon sud',
  'Potager du fond',
  'Serre nord',
  'Carré aromatique',
  'Grand verger',
  'Haie fruitière',
  'Pépinière',
  'Bac à fleurs',
  'Verger bas',
  'Jardin d’hiver',
  'Rocaille',
] as const;

const GARDENS: DashboardGardenData[] = NAMES.map((name, index) =>
  gardenFixture({
    id: `g${index}`,
    name,
    updatedAt: `2026-09-${String(28 - index).padStart(2, '0')}T12:00:00Z`,
    createdAt: `2026-01-${String(index + 1).padStart(2, '0')}T12:00:00Z`,
    // Three ranked, the rest not: the unranked take the head of the custom order.
    sortOrder: index === 0 ? 2 : index === 1 ? 0 : index === 2 ? 1 : null,
  })
);

const data = dashboardFixture(GARDENS);

/** The Gardens widget — the frozen design's own `data-widget` handle. */
const widget = () => document.querySelector('[data-widget="gardens"]') as HTMLElement;

/** The names of the table's rows, top to bottom. */
const rowNames = (): string[] =>
  [...widget().querySelectorAll('tbody tr')].map(
    (row) => row.querySelector('th a')?.textContent ?? ''
  );

const RENDER_TIMEOUT = { timeout: 10000 };

function withGardens(level: DashboardLevel, blocks: DashboardBlock[]) {
  vi.mocked(fetchDashboardPreferences).mockResolvedValue({
    schemaVersion: 1,
    level,
    capabilities: capabilitiesFor(level),
    isPreset: false,
    formulaChosen: true,
    blocks,
    updatedAt: null,
  });
}

/** A level's preset, its Gardens block at `size` with `options`. */
const gardensBlocks = (
  level: DashboardLevel,
  options: Record<string, unknown> | null,
  size: 'medium' | 'large' = 'large'
): DashboardBlock[] =>
  presetFor(level).map((block) =>
    block.key === 'gardens' ? { ...block, size, ...(options ? { options } : {}) } : block
  );

async function renderWith(
  level: DashboardLevel,
  options: Record<string, unknown> | null,
  size: 'medium' | 'large' = 'large',
  awaited: string = 'Terrasse'
) {
  withGardens(level, gardensBlocks(level, options, size));
  render(
    <LanguageProvider>
      <UnitSystemProvider>
        <MemoryRouter>
          <GardensDashboard />
        </MemoryRouter>
      </UnitSystemProvider>
    </LanguageProvider>
  );
  await screen.findAllByText(awaited, {}, RENDER_TIMEOUT);
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
  localStorage.setItem('smartcrops-language', 'en');
  vi.mocked(saveDashboardPreferences).mockResolvedValue(undefined);
  vi.mocked(fetchDashboardData).mockResolvedValue(data);
});

afterEach(() => vi.clearAllMocks());

describe('the Large list under its count (A-N4)', () => {
  it('shows the eight first of twelve by default, « + 4 more gardens », the sort in the foot, and the search', async () => {
    await renderWith('expert', null);

    expect(rowNames()).toEqual(NAMES.slice(0, 8));
    const more = within(widget()).getByRole('button', { name: '+ 4 more gardens' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(within(widget()).getByText('Sorted by last opened')).toBeInTheDocument();
    expect(within(widget()).getByRole('textbox', { name: 'Search a garden' })).toBeInTheDocument();
  });

  it('unfolds the list IN PLACE, folds it back — and writes NOTHING (A-N23)', async () => {
    await renderWith('expert', null);

    fireEvent.click(within(widget()).getByRole('button', { name: '+ 4 more gardens' }));

    expect(rowNames()).toEqual([...NAMES]);
    const less = within(widget()).getByRole('button', { name: 'Show 8 gardens' });
    expect(less).toHaveAttribute('aria-expanded', 'true');
    // The search stays: the rule looks at the setting, not at the unfolding.
    expect(within(widget()).getByRole('textbox', { name: 'Search a garden' })).toBeInTheDocument();

    fireEvent.click(less);
    expect(rowNames()).toEqual(NAMES.slice(0, 8));

    // Nothing is enregistré: past the debounce of the layout's save, no PUT.
    await act(() => new Promise((resolve) => setTimeout(resolve, SAVE_DEBOUNCE_MS + 100)));
    expect(saveDashboardPreferences).not.toHaveBeenCalled();
  });

  it('« all »: every garden, no search, no « + N »', async () => {
    await renderWith('expert', { count: 'all' });

    expect(rowNames()).toEqual([...NAMES]);
    expect(within(widget()).queryByRole('textbox', { name: 'Search a garden' })).toBeNull();
    expect(within(widget()).queryByRole('button', { name: /more garden/ })).toBeNull();
    expect(within(widget()).getByText('Sorted by last opened')).toBeInTheDocument();
  });

  it('a stored count of five: five rows and « + 7 more gardens »', async () => {
    await renderWith('expert', { count: 5 });

    expect(rowNames()).toEqual(NAMES.slice(0, 5));
    expect(within(widget()).getByRole('button', { name: '+ 7 more gardens' })).toBeInTheDocument();
  });

  it('no search and no « + N » when every garden is shown by the count', async () => {
    vi.mocked(fetchDashboardData).mockResolvedValue(dashboardFixture(GARDENS.slice(0, 5)));
    await renderWith('expert', { count: 8 });

    expect(rowNames()).toEqual(NAMES.slice(0, 5));
    expect(within(widget()).queryByRole('textbox', { name: 'Search a garden' })).toBeNull();
    expect(within(widget()).queryByRole('button', { name: /more garden/ })).toBeNull();
  });
});

describe('the search (A-N3)', () => {
  it('finds every garden whose name contains the query, hidden ones included and marked, blind to case and accents, and says the count', async () => {
    await renderWith('expert', null);
    const input = within(widget()).getByRole('textbox', { name: 'Search a garden' });

    fireEvent.change(input, { target: { value: 'VERGÉR' } });

    expect(rowNames()).toEqual(['Grand verger', 'Verger bas']);
    // « Verger bas » sits beyond the eight shown: said under its name.
    const beyond = [...widget().querySelectorAll('[data-garden-beyond]')].map((node) => node.textContent);
    expect(beyond).toEqual(['beyond the 8 shown']);
    expect(within(widget()).getByRole('status')).toHaveTextContent('2 gardens of 12 contain “VERGÉR”');
    // No « + N » while a search is on; the sort line stays.
    expect(within(widget()).queryByRole('button', { name: /more garden/ })).toBeNull();
    expect(within(widget()).getByText('Sorted by last opened')).toBeInTheDocument();
  });

  it('says « no garden contains » as a state, and « Clear the search » brings the list back', async () => {
    await renderWith('expert', null);
    const input = within(widget()).getByRole('textbox', { name: 'Search a garden' });

    fireEvent.change(input, { target: { value: 'verger nord' } });

    expect(widget().querySelector('table')).toBeNull();
    // Said twice: once by the state on screen, once by the announcement region (visually hidden).
    expect(within(widget()).getAllByText('No garden contains “verger nord”')).toHaveLength(2);
    expect(within(widget()).getByRole('status')).toHaveTextContent('No garden contains “verger nord”');
    expect(within(widget()).getByText('The search covers the names of your 12 gardens, regardless of case and accents.')).toBeInTheDocument();

    fireEvent.click(within(widget()).getByRole('button', { name: 'Clear the search' }));

    expect(rowNames()).toEqual(NAMES.slice(0, 8));
    expect(within(widget()).getByRole('status')).toHaveTextContent('');
  });

  it('Escape clears the query and stops at the field', async () => {
    await renderWith('expert', null);
    const input = within(widget()).getByRole('textbox', { name: 'Search a garden' });
    fireEvent.change(input, { target: { value: 'verg' } });
    expect(rowNames()).toHaveLength(2);

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(rowNames()).toEqual(NAMES.slice(0, 8));
  });
});

describe('the sorts (A-N3, A-N5)', () => {
  it('« name »: A to Z, blind to case and accents, and the foot says so', async () => {
    await renderWith('expert', { sort: 'name', count: 'all' });

    expect(rowNames()).toEqual([
      'Bac à fleurs',
      'Balcon sud',
      'Carré aromatique',
      'Grand verger',
      'Haie fruitière',
      'Jardin d’hiver',
      'Pépinière',
      'Potager du fond',
      'Rocaille',
      'Serre nord',
      'Terrasse',
      'Verger bas',
    ]);
    expect(within(widget()).getByText('Sorted alphabetically')).toBeInTheDocument();
  });

  it('« created »: the most recently created first', async () => {
    await renderWith('expert', { sort: 'created', count: 'all' });

    expect(rowNames()).toEqual([...NAMES].reverse());
    expect(within(widget()).getByText('Sorted by creation date')).toBeInTheDocument();
  });

  it('« custom »: the unranked gardens at the head, newest first, then by place — « In your order »', async () => {
    await renderWith('expert', { sort: 'custom', count: 'all' });

    const names = rowNames();
    // Nine unranked, the most recently created first…
    expect(names.slice(0, 9)).toEqual([...NAMES.slice(3)].reverse());
    // …then the three ranked, by their place: Balcon sud (0), Potager du fond (1), Terrasse (2).
    expect(names.slice(9)).toEqual(['Balcon sud', 'Potager du fond', 'Terrasse']);
    expect(within(widget()).getByText('In your order')).toBeInTheDocument();
  });

  it('« updated »: the most recently modified first', async () => {
    await renderWith('expert', { sort: 'updated', count: 5 });

    expect(rowNames()).toEqual(NAMES.slice(0, 5));
    expect(within(widget()).getByText('Sorted by last modified')).toBeInTheDocument();
  });

  it('a sort the formula does not serve falls back to « Derniers ouverts » — the Gardener with the Expert’s custom order', async () => {
    await renderWith('gardener', { sort: 'custom', count: 'all' });

    expect(rowNames()).toEqual([...NAMES]);
    expect(within(widget()).getByText('Sorted by last opened')).toBeInTheDocument();
  });
});

describe('the Medium list is unchanged (A-N4)', () => {
  it('shows the three first of the sorted list and « +9 gardens → », which grows the widget', async () => {
    await renderWith('gardener', { sort: 'name' }, 'medium', 'Bac à fleurs');

    const links = within(widget()).getAllByRole('link', { name: /^Open / });
    expect(links.map((link) => link.getAttribute('aria-label'))).toEqual([
      'Open Bac à fleurs',
      'Open Balcon sud',
      'Open Carré aromatique',
    ]);
    // No search, no foot in Medium.
    expect(within(widget()).queryByRole('textbox', { name: 'Search a garden' })).toBeNull();
    expect(within(widget()).queryByText('Sorted alphabetically')).toBeNull();

    fireEvent.click(within(widget()).getByRole('button', { name: '+9 gardens →' }));

    await waitFor(() => expect(widget().querySelector('table')).not.toBeNull());
  });
});

// SMA-448, lot F5-a — the widget's door to the creation dialog ends the Edit
// mode first, as the header's does (A-7 amended 25/09, decided by Alexandre;
// the constat C1 of PR #291 versed to this lot).
describe('the widget’s « Créer un jardin » door', () => {
  it('in Edit mode, ends the mode FIRST, then opens the dialog — like the header’s', async () => {
    await renderWith('gardener', null, 'medium');
    const edit = await screen.findByRole('button', { name: 'Edit' }, RENDER_TIMEOUT);
    await waitFor(() => expect(edit).toBeEnabled(), RENDER_TIMEOUT);
    fireEvent.click(edit);
    await screen.findByRole('button', { name: 'Done' }, RENDER_TIMEOUT);

    fireEvent.click(within(widget()).getByRole('button', { name: 'Create Garden' }));

    await screen.findByRole('dialog', { name: 'Create a new garden' }, RENDER_TIMEOUT);
    // The mode is over: « Edit » is back in the header, « Done » gone — read
    // through the dialog's veil (MUI hides the page from assistive technology
    // while a modal is open), hence `hidden: true`.
    expect(screen.queryByRole('button', { name: 'Done', hidden: true })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit', hidden: true })).toBeInTheDocument();
  });
});
