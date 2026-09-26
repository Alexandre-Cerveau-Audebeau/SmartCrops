import { act, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import { UnitSystemProvider } from '../contexts/UnitSystemContext';
import { EMPTY_WEATHER_DATA } from '../types/DashboardWeather';
import { capabilitiesFor, presetFor } from '../test/fixtures/formulas';
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
    capabilities: capabilitiesFor(level),
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

/** The page under its providers — and, when a test needs one, the site's navbar before it, as the Layout draws it. */
function renderPage(before?: ReactNode) {
  return render(
    <LanguageProvider>
      <UnitSystemProvider>
        <MemoryRouter>
          {before}
          <GardensDashboard />
        </MemoryRouter>
      </UnitSystemProvider>
    </LanguageProvider>
  );
}

/** The SMA-174 patience, below the 20 s test timeout (see GardensDashboard.edit.test.tsx). */
const RENDER_TIMEOUT = { timeout: 10000 };

/** Renders the page and waits for its grid — the layout read, the trigger armed. */
async function renderLoaded(before?: ReactNode) {
  const view = renderPage(before);
  await screen.findAllByRole('heading', { level: 2 }, RENDER_TIMEOUT);
  await waitFor(() => expect(live()).toHaveLength(1));
  return view;
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

describe('the compact action bar in Edit mode (SMA-437, lot V39, B5)', () => {
  /** Scrolls the header's buttons away and enters Edit mode from the bar. */
  async function editFromTheBar(user: ReturnType<typeof userEvent.setup>) {
    await renderLoaded();
    scrollPast();
    await user.click(within(bar()!).getByRole('button', { name: 'Edit' }));
  }

  it('reads « Edit mode » and carries Done and Customize — the case it is for — in place of the page’s title', async () => {
    const user = userEvent.setup();
    await editFromTheBar(user);

    const group = screen.getByRole('group', { name: 'Page actions' });
    expect(within(group).getByText('Edit mode')).toBeInTheDocument();
    expect(namesIn(group)).toEqual(['Done', 'Customize']);
    expect(group.querySelector('[data-compact-bar-title]')).toBeNull();
    // Still neither « Create Garden » nor the chip (A-7).
    expect(within(group).queryByText('Create Garden')).toBeNull();
    expect(group.querySelector('[data-level-chip]')).toBeNull();

    // Back out of Edit mode: the title again, and no « Edit mode ».
    await user.click(within(group).getByRole('button', { name: 'Done' }));
    expect(within(group).queryByText('Edit mode')).toBeNull();
    expect(group.querySelector('[data-compact-bar-title]')).toHaveTextContent('My Gardens');
  });

  it('shows the save state as an aria-hidden COPY — the page keeps ONE role="status" for the save, the header’s, born empty and never in an inert row', async () => {
    // The save HELD until the test lets it go (fix round 1, R1): « Saving… »
    // is transient, and the region and its copy are read one after the other
    // — a save ending between the two reads once failed this test under load.
    let release!: () => void;
    vi.mocked(saveDashboardPreferences).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    const user = userEvent.setup();
    await editFromTheBar(user);

    const copy = bar()!.querySelector('[data-compact-bar-status]');
    const region = document.querySelector('[data-save-status]')!;
    expect(document.querySelectorAll('[data-save-status]')).toHaveLength(1);
    expect(region).toHaveAttribute('role', 'status');
    expect(region.closest('[inert]')).toBeNull();
    expect(region.closest('[aria-hidden="true"]')).toBeNull();
    expect(bar()!.querySelectorAll('[role="status"], [aria-live]')).toHaveLength(0);
    // Its place is kept before the first change: the bar does not grow at the first gesture.
    expect(copy).toHaveAttribute('aria-hidden', 'true');
    expect(copy).toBeEmptyDOMElement();

    await user.click(screen.getAllByRole('button', { name: /^Hide / })[0]!);
    await waitFor(() => expect(region).toHaveTextContent('Saving…'));
    expect(copy).toHaveTextContent('Saving…');
    // The write has left and waits: let it end.
    await waitFor(() => expect(saveDashboardPreferences).toHaveBeenCalled(), { timeout: 5000 });
    await act(async () => release());
    await waitFor(() => expect(region).toHaveTextContent('Saved'), { timeout: 5000 });
    expect(copy).toHaveTextContent('Saved');
  });

  it('says a failed save in the copy too', async () => {
    vi.mocked(saveDashboardPreferences).mockRejectedValue(new Error('down'));
    const user = userEvent.setup();
    await editFromTheBar(user);

    await user.click(screen.getAllByRole('button', { name: /^Hide / })[0]!);
    const region = document.querySelector('[data-save-status]')!;
    await waitFor(() => expect(region).toHaveTextContent('Changes not saved'), { timeout: 5000 });
    expect(bar()!.querySelector('[data-compact-bar-status]')).toHaveTextContent('Changes not saved');
  });
});

describe('the focus and the scroll padding under the compact action bar (SMA-437, lot V39, B6)', () => {
  /** The header's button of an action, and the bar's. */
  const headerButton = (action: string) => headerRow().querySelector<HTMLElement>(`[data-page-action="${action}"]`)!;
  const barButton = (action: string) => bar()!.querySelector<HTMLElement>(`[data-page-action="${action}"]`)!;

  it('moves the focus to the twin when its row hides — the header’s Edit to the bar’s, and back — never to the body', async () => {
    await renderLoaded();
    headerButton('edit').focus();
    expect(document.activeElement).toBe(headerButton('edit'));

    scrollPast();
    expect(document.activeElement).toBe(barButton('edit'));

    scrollBack();
    expect(document.activeElement).toBe(headerButton('edit'));
  });

  it('does the same for Customize', async () => {
    await renderLoaded();
    headerButton('customize').focus();
    scrollPast();
    expect(document.activeElement).toBe(barButton('customize'));
    scrollBack();
    expect(document.activeElement).toBe(headerButton('customize'));
  });

  it('never gives the focus to the bar when it appears: a focus elsewhere stays where it is', async () => {
    await renderLoaded();
    const create = screen.getByRole('button', { name: 'Create Garden' });
    create.focus();
    scrollPast();
    expect(document.activeElement).toBe(create);
  });

  it('keeps the focus on the bar’s toggle through Edit and Done at the keyboard — one button whose label changes (A-10.5)', async () => {
    const user = userEvent.setup();
    await renderLoaded();
    scrollPast();
    const toggle = barButton('edit');
    toggle.focus();
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(toggle);
    expect(toggle).toHaveTextContent('Done');
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(toggle);
    expect(toggle).toHaveTextContent('Edit');
  });

  it('gives the focus back to the twin when the Customize panel closes on a button that went inert meanwhile (technical decision 8)', async () => {
    const user = userEvent.setup();
    await renderLoaded();
    headerButton('customize').focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('dialog', { name: 'Customize' });

    // The page scrolled under the panel — a rotation: the header's buttons are gone.
    scrollPast();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(document.activeElement).toBe(barButton('customize')));
  });

  it('sets scroll-padding-top to the navbar plus the bar plus 8 px while the bar shows, and gives the previous value back after (WCAG 2.4.11)', async () => {
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const height = this.hasAttribute('data-site-navbar') ? 56 : this.hasAttribute('data-compact-bar') ? 54 : null;
      if (height === null) return original.call(this);
      return {
        x: 0, y: 0, top: 0, left: 0, right: 0, bottom: height,
        width: 0, height, toJSON: () => ({}),
      } as DOMRect;
    };
    const root = document.documentElement;
    root.style.scrollPaddingTop = '5px';
    try {
      const view = await renderLoaded(<header data-site-navbar />);
      expect(root.style.scrollPaddingTop).toBe('5px');

      scrollPast();
      expect(root.style.scrollPaddingTop).toBe('118px');

      scrollBack();
      expect(root.style.scrollPaddingTop).toBe('5px');

      scrollPast();
      view.unmount();
      expect(root.style.scrollPaddingTop).toBe('5px');
    } finally {
      Element.prototype.getBoundingClientRect = original;
      root.style.scrollPaddingTop = '';
    }
  });
});

describe('the content stays still when Edit mode is toggled under the compact bar (SMA-437, lot V39, B8)', () => {
  // jsdom lays nothing out: the page is given the geometry of a phone
  // scrolled mid-page — a 56 px navbar, the 54 px bar, 200 px cards 20 px
  // apart — and Edit mode moves every card 32 px down, what the lot's
  // pre-flight measured at 360 px (the cards take their 34 / 38 px of
  // controls, the header loses its second line). The first card has gone
  // under the bars; the second straddles the line, 30 px above the top of
  // the window: it is the first one visible, the one that must not move.
  const CARD = 200;
  const FIRST_TOP = -250;
  const EDIT_SHIFT = 32;

  const gridCards = () =>
    [...document.querySelectorAll('[data-widget]')].filter((node) => !node.closest('[data-drag-overlay]'));
  const inEditMode = () =>
    document.querySelector('[data-dashboard-header] [data-page-action="edit"]')?.textContent === 'Done';

  /** Installs that geometry; returns the restore. */
  function stubScrolledPhone() {
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      let top = 0;
      let height: number | null = null;
      if (this.hasAttribute('data-site-navbar')) height = 56;
      else if (this.hasAttribute('data-compact-bar')) height = 54;
      else if (this.hasAttribute('data-widget') && !this.closest('[data-drag-overlay]')) {
        height = CARD;
        top = FIRST_TOP + gridCards().indexOf(this) * (CARD + 20) + (inEditMode() ? EDIT_SHIFT : 0);
      }
      if (height === null) return original.call(this);
      return {
        x: 0, y: top, top, left: 0, right: 0, bottom: top + height,
        width: 0, height, toJSON: () => ({}),
      } as DOMRect;
    };
    return () => {
      Element.prototype.getBoundingClientRect = original;
    };
  }

  it('scrolls the page by what Edit mode moved the first card visible under the bars — in, and out — so what the user looks at stays where it was', async () => {
    const restore = stubScrolledPhone();
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    try {
      const user = userEvent.setup();
      await renderLoaded(<header data-site-navbar />);
      scrollPast();

      await user.click(within(bar()!).getByRole('button', { name: 'Edit' }));
      expect(scrollBy.mock.calls).toEqual([[{ top: EDIT_SHIFT, left: 0, behavior: 'instant' }]]);

      await user.click(within(bar()!).getByRole('button', { name: 'Done' }));
      expect(scrollBy.mock.calls).toEqual([
        [{ top: EDIT_SHIFT, left: 0, behavior: 'instant' }],
        [{ top: -EDIT_SHIFT, left: 0, behavior: 'instant' }],
      ]);
    } finally {
      scrollBy.mockRestore();
      restore();
    }
  });

  it('scrolls nothing when Edit mode is toggled at the top of the page, the bar hidden — the header is where the user looks', async () => {
    const restore = stubScrolledPhone();
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    try {
      const user = userEvent.setup();
      await renderLoaded(<header data-site-navbar />);
      await user.click(within(headerRow()).getByRole('button', { name: 'Edit' }));
      await user.click(within(headerRow()).getByRole('button', { name: 'Done' }));
      expect(scrollBy).not.toHaveBeenCalled();
    } finally {
      scrollBy.mockRestore();
      restore();
    }
  });
});
