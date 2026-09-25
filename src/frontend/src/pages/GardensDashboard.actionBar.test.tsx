import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import { UnitSystemProvider } from '../contexts/UnitSystemContext';
import { EMPTY_WEATHER_DATA } from '../types/DashboardWeather';
import { presetFor } from '../constants/dashboardPresets';
import { dashboardFixture, gardenFixture } from '../test/fixtures/dashboard';
import type { DashboardLevel } from '../types/Dashboard';

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

// SMA-437, lot V39, PR B — the compact action bar, as the page wires it. jsdom
// lays nothing out and ships no IntersectionObserver: this one records its
// targets and reports what the test tells it to, so the page's LOGIC is
// proven here — what the bar carries, what the header gives up, the one live
// row — and the layout, the observers and the real focus in the real-engine
// scenes (`src/test/layout/`, step B9).

class ManualIntersectionObserver {
  static instances: ManualIntersectionObserver[] = [];
  readonly targets = new Set<Element>();
  private readonly callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    ManualIntersectionObserver.instances.push(this);
  }
  observe(target: Element) {
    this.targets.add(target);
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  report(position: { isIntersecting: boolean; bottom: number; rootTop: number }) {
    const [target] = [...this.targets];
    const entry = {
      target,
      isIntersecting: position.isIntersecting,
      boundingClientRect: { top: position.bottom - 40, bottom: position.bottom },
      rootBounds: { top: position.rootTop, bottom: 780 },
    } as unknown as IntersectionObserverEntry;
    act(() => this.callback([entry], this as unknown as IntersectionObserver));
  }
}

/** The observers still observing something. */
const live = () => ManualIntersectionObserver.instances.filter((instance) => instance.targets.size > 0);

/** The header's repeated buttons have gone under the two bars. */
const scrollPast = () => live()[0]!.report({ isIntersecting: false, bottom: 100, rootTop: 110 });
/** They are back in view. */
const scrollBack = () => live()[0]!.report({ isIntersecting: true, bottom: 150, rootTop: 110 });

function servePreferences(level: DashboardLevel) {
  vi.mocked(fetchDashboardPreferences).mockResolvedValue({
    schemaVersion: 1,
    level,
    isPreset: true,
    blocks: presetFor(level),
    updatedAt: null,
  });
}

beforeEach(() => {
  ManualIntersectionObserver.instances = [];
  vi.stubGlobal('IntersectionObserver', ManualIntersectionObserver);
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
  servePreferences('expert');
  vi.mocked(saveDashboardPreferences).mockResolvedValue(undefined);
  vi.mocked(fetchDashboardData).mockResolvedValue(dashboardFixture([gardenFixture()]));
});

afterEach(() => vi.clearAllMocks());

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

/** The SMA-174 patience, below the 20 s test timeout (see GardensDashboard.edit.test.tsx). */
const RENDER_TIMEOUT = { timeout: 10000 };

/** Renders the page and waits for its grid — the layout read, the trigger armed. */
async function renderLoaded() {
  renderPage();
  await screen.findAllByRole('heading', { level: 2 }, RENDER_TIMEOUT);
  await waitFor(() => expect(live()).toHaveLength(1));
}

const bar = () => document.querySelector<HTMLElement>('[data-compact-bar]');
const headerRow = () => document.querySelector<HTMLElement>('[data-dashboard-header] [data-page-actions]')!;
/** The names of a row's buttons, in order. */
const namesIn = (row: HTMLElement) =>
  within(row)
    .queryAllByRole('button', { hidden: true })
    .map((button) => button.textContent);

describe('the compact action bar, out of Edit mode (SMA-437, lot V39, B4)', () => {
  it('is mounted once, right after the header and right before the grid, hidden — aria-hidden and inert — while the header’s buttons are in view', async () => {
    await renderLoaded();
    const header = document.querySelector('[data-dashboard-header]')!;
    expect(header.nextElementSibling).toBe(bar());
    expect(document.querySelectorAll('[data-compact-bar]')).toHaveLength(1);
    expect(bar()).toHaveAttribute('aria-hidden', 'true');
    expect(bar()).toHaveAttribute('inert');
    expect(headerRow()).not.toHaveAttribute('inert');
    expect(headerRow()).not.toHaveAttribute('aria-hidden');
    // One « Edit » and one « Customize » for assistive technology: the header's.
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1);
    expect(headerRow()).toContainElement(screen.getByRole('button', { name: 'Edit' }));
  });

  it('observes the header’s repeated buttons — the wrapper of the two it repeats', async () => {
    await renderLoaded();
    expect([...live()[0]!.targets]).toEqual([headerRow()]);
  });

  it('takes the header’s two buttons over once they pass the line: a group named « Page actions » carrying Edit and Customize and NOTHING else', async () => {
    await renderLoaded();
    scrollPast();

    const group = screen.getByRole('group', { name: 'Page actions' });
    expect(group).toBe(bar());
    expect(group).not.toHaveAttribute('aria-hidden');
    expect(group).not.toHaveAttribute('inert');
    expect(namesIn(group)).toEqual(['Edit', 'Customize']);
    // Neither « Create Garden » nor the level chip (A-7).
    expect(within(group).queryByText('Create Garden')).toBeNull();
    expect(group.querySelector('[data-level-chip]')).toBeNull();
    expect(within(group).queryByText(/Expert view/)).toBeNull();
    // The same buttons, by construction: the same glyphs as the header's.
    expect(within(group).getByTestId('EditOutlinedIcon')).toBeInTheDocument();
    expect(within(group).getByTestId('DashboardCustomizeOutlinedIcon')).toBeInTheDocument();
  });

  it('turns the header’s repeated buttons inert and aria-hidden while it shows — one live row at a time — and gives them back when they return', async () => {
    await renderLoaded();
    scrollPast();
    expect(headerRow()).toHaveAttribute('inert');
    expect(headerRow()).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1);
    expect(bar()).toContainElement(screen.getByRole('button', { name: 'Edit' }));
    // The chip and « Create Garden », not repeated, stay live in the header.
    expect(screen.getByRole('button', { name: 'Create Garden' })).toBeInTheDocument();

    scrollBack();
    expect(headerRow()).not.toHaveAttribute('inert');
    expect(headerRow()).not.toHaveAttribute('aria-hidden');
    expect(bar()).toHaveAttribute('aria-hidden', 'true');
    expect(bar()).toHaveAttribute('inert');
    expect(headerRow()).toContainElement(screen.getByRole('button', { name: 'Edit' }));
  });

  it('acts as the header does: Edit enters Edit mode, Customize opens the panel', async () => {
    const user = userEvent.setup();
    await renderLoaded();
    scrollPast();

    await user.click(within(bar()!).getByRole('button', { name: 'Edit' }));
    // ONE toggle per row, each now « Done » — the header's too, behind the bar.
    expect(bar()!.querySelector('[data-page-action="edit"]')).toHaveTextContent('Done');
    expect(headerRow().querySelector('[data-page-action="edit"]')).toHaveTextContent('Done');

    await user.click(within(bar()!).getByRole('button', { name: 'Customize' }));
    expect(await screen.findByRole('dialog', { name: 'Customize' })).toBeInTheDocument();
  });

  it('is not drawn at the Novice formula — at any position (A-9)', async () => {
    servePreferences('novice');
    renderPage();
    await screen.findAllByRole('heading', { level: 2 }, RENDER_TIMEOUT);
    expect(bar()).toBeNull();
    expect(live()).toEqual([]);
  });

  it('never shows while the layout loads', async () => {
    vi.mocked(fetchDashboardPreferences).mockReturnValue(new Promise(() => {}));
    renderPage();
    await screen.findByRole('heading', { level: 1 }, RENDER_TIMEOUT);
    expect(live()).toEqual([]);
    expect(bar()).toHaveAttribute('aria-hidden', 'true');
  });

  it('never shows once the layout could not be read', async () => {
    vi.mocked(fetchDashboardPreferences).mockRejectedValue(new Error('down'));
    renderPage();
    await screen.findByRole('button', { name: 'Try again' }, RENDER_TIMEOUT);
    expect(live()).toEqual([]);
    expect(bar()).toHaveAttribute('aria-hidden', 'true');
  });
});
