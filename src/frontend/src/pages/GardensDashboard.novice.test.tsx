import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import { UnitSystemProvider } from '../contexts/UnitSystemContext';
import { capabilitiesFor, presetFor } from '../test/fixtures/formulas';
import { dashboardFixture } from '../test/fixtures/dashboard';
import { linkFixture, weatherFixture } from '../test/fixtures/weather';
import { gardens as sceneGardens, varieties as sceneVarieties, weatherAll } from '../test/layout/scenes';
import type { DashboardBlock, DashboardLevel } from '../types/Dashboard';
import type { DashboardData } from '../types/DashboardData';
import type { DashboardWeatherData } from '../types/DashboardWeather';

vi.mock('../services/gardenApi', () => ({
  createGarden: vi.fn(),
  updateGarden: vi.fn(),
  deleteGarden: vi.fn(),
}));

// The module's own `refusalOf` stays real (SMA-448, PR #293, A1): it is what
// turns a refused switch into what the chooser says.
vi.mock('../services/dashboardApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/dashboardApi')>()),
  fetchDashboardPreferences: vi.fn(),
  saveDashboardPreferences: vi.fn(),
  fetchDashboardData: vi.fn(),
  changeFormula: vi.fn(),
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
  changeFormula,
  fetchDashboardData,
  fetchDashboardPreferences,
  saveDashboardPreferences,
} from '../services/dashboardApi';
import { HttpStatusError } from '../services/httpStatusError';

// SMA-448, lot F2 (SMA-436) — THE NOVICE PAGE. A formula is a difference of
// capabilities (R1): the Novice's page is not a grid of widgets but one card
// per garden — its plan in a band, its name, its type and size, its plants,
// its task of the day (variant B, Alexandre 22/09 16:39), the weather of ITS
// city (22/09 18:52) — under the header's chip and « Créer un jardin », with
// no « Modifier », no « Personnaliser », no gallery and no compact bar (A-9).
// The page decides on the capabilities the server serves (R8, § C.2 a):
// `weather: gardenCards` — « no widget: the weather of each garden's own
// city, on its card ».

/** The harness's scene: three gardens, sixteen varieties, 64 placements, every garden in Écully. */
const DATA: DashboardData = {
  gardens: sceneGardens,
  varieties: sceneVarieties,
  totals: { gardenCount: 3, placementCount: 64, varietyCount: 16, catalogPlantCount: 536 },
};

/** Mid-September at noon UTC — the same month in every zone the suite runs in. */
const FROZEN_NOW = Date.UTC(2026, 8, 14, 12, 0, 0);

/** No garden has a city, and no profile default. */
const nowhere = (): DashboardWeatherData =>
  weatherFixture(
    [],
    sceneGardens.map((garden) => linkFixture({ gardenId: garden.id, locationKey: null, source: null }))
  );

function serveNovice() {
  vi.mocked(fetchDashboardPreferences).mockResolvedValue({
    schemaVersion: 1,
    level: 'novice',
    capabilities: capabilitiesFor('novice'),
    isPreset: true,
    blocks: presetFor('novice'),
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

/** The cards of the Novice page, in order. */
const cards = () => [...document.querySelectorAll<HTMLElement>('[data-novice-card]')];

/** The card of a garden, by its id. */
const cardOf = (id: string) => {
  const card = document.querySelector<HTMLElement>(`[data-novice-card="${id}"]`);
  if (!card) throw new Error(`No card for the garden ${id}`);
  return card;
};

/** The warning's own nodes. */
const disclaimers = () => document.querySelectorAll('[data-weather-disclaimer]');

beforeEach(() => {
  localStorage.setItem('smartcrops-language', 'en');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FROZEN_NOW);
  vi.mocked(fetchProfile).mockResolvedValue({
    email: 'a@example.test',
    displayName: null,
    firstName: null,
    lastName: null,
    city: null,
    hasPassword: true,
  });
  vi.mocked(fetchDashboardData).mockResolvedValue(DATA);
  vi.mocked(fetchDashboardWeather).mockResolvedValue(weatherAll());
  vi.mocked(saveDashboardPreferences).mockResolvedValue(undefined);
  serveNovice();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  localStorage.clear();
});

describe('the Novice page — one card per garden, not the grid (SMA-448 lot F2, SMA-436)', () => {
  it('draws one card per garden and no widget: no grid, no « Edit », no « Customize », no compact bar — the chip and « Create Garden » stay', async () => {
    renderPage();

    await waitFor(() => expect(cards()).toHaveLength(3));
    expect(document.querySelectorAll('[data-widget]')).toHaveLength(0);
    expect(document.querySelector('[data-dashboard-grid]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Customize' })).toBeNull();
    expect(document.querySelector('[data-page-actions]')).toBeNull();
    expect(document.querySelector('[data-compact-bar]')).toBeNull();
    expect(screen.getByText('Novice view')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Garden' })).toBeInTheDocument();
  });

  it('lists the cards, each named by its garden — an h2 whose link opens the planner — in the gardens’ order', async () => {
    renderPage();

    const list = await screen.findByRole('list', { name: 'Your gardens' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    const headings = within(list).getAllByRole('heading', { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual(['Terrasse', 'Balcon sud', 'Potager du fond']);
    expect(within(headings[0]!).getByRole('link', { name: 'Terrasse' })).toHaveAttribute('href', '/gardens/g1/planner');
    // Every widget title of the grid was an h2 too: on this page the h2s are the gardens, and nothing else.
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3);
  });

  it('says on each card its type and size, its plants and — when it has one — its task of the day, which reads « To do: »', async () => {
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(3));

    const terrasse = cardOf('g1');
    expect(within(terrasse).getByText('Terrace · 10 × 8 · 50 cm')).toBeInTheDocument();
    expect(within(terrasse).getByText('21 plants')).toBeInTheDocument();
    // The plants, in the plan's order, four then « +N ».
    expect(within(terrasse).getByText('tomate, basilic, hortensia, thym +4')).toBeInTheDocument();
    // The first task of the day of THIS garden — watering tonight, 9 placements of high need.
    expect(terrasse.querySelector('[data-novice-task="water"]')).toHaveTextContent(
      'To do: Water tonight — 9 plants with high needs, no rain expected'
    );

    const balcon = cardOf('g2');
    expect(within(balcon).getByText('Balcony · 12 × 4 · 25 cm')).toBeInTheDocument();
    expect(within(balcon).getByText('Ornamental')).toBeInTheDocument();
    expect(within(balcon).getByText('9 plants')).toBeInTheDocument();
    // No task today for the ornamental balcony: no band at all, never an empty one.
    expect(balcon.querySelector('[data-novice-task]')).toBeNull();
  });

  it('shows on each card the temperature of its garden’s own city — and the weather warning under the cards (SMA-387, V1)', async () => {
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(3));

    await waitFor(() => expect(document.querySelectorAll('[data-novice-weather]')).toHaveLength(3));
    expect(within(cardOf('g1')).getByText('24° · Écully')).toBeInTheDocument();
    const note = await screen.findByRole('note');
    expect(note).toHaveAttribute('data-weather-disclaimer');
    expect(disclaimers()).toHaveLength(1);
    // Under the cards, outside every one of them.
    for (const card of cards()) {
      expect(card.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(note.closest('[data-novice-card]')).toBeNull();
  });

  it('offers « Add a city » on a card whose garden has no city — and no warning while no card shows a figure', async () => {
    vi.mocked(fetchDashboardWeather).mockResolvedValue(nowhere());
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(3));

    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Add a city for /u })).toHaveLength(3));
    expect(document.querySelectorAll('[data-novice-weather]')).toHaveLength(0);
    expect(screen.queryByRole('note')).toBeNull();
    expect(document.body.textContent).not.toMatch(/\d\s?°/u);
  });

  it('carries the rename and delete of every garden, and « Modified … » with the chevron to the planner', async () => {
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(3));

    const terrasse = cardOf('g1');
    expect(within(terrasse).getByRole('button', { name: 'Edit Terrasse' })).toBeInTheDocument();
    expect(within(terrasse).getByRole('button', { name: 'Delete Terrasse' })).toBeInTheDocument();
    expect(within(terrasse).getByText(/^Modified /u)).toBeInTheDocument();
    const chevron = terrasse.querySelector('[data-novice-chevron]');
    expect(chevron).toHaveAttribute('href', '/gardens/g1/planner');
    // Decorative: the name is the one link of the card a keyboard reaches.
    expect(chevron).toHaveAttribute('aria-hidden', 'true');
    expect(chevron).toHaveAttribute('tabindex', '-1');
  });

  it('with no garden: an invitation to create one, « No garden yet » under the title, no card and no warning', async () => {
    vi.mocked(fetchDashboardData).mockResolvedValue(dashboardFixture([]));
    vi.mocked(fetchDashboardWeather).mockResolvedValue(weatherFixture([], []));
    renderPage();

    const invite = await screen.findByText('You don’t have a garden yet.');
    expect(invite.closest('[data-novice-empty]')).not.toBeNull();
    expect(screen.getByText('No garden yet')).toBeInTheDocument();
    expect(cards()).toHaveLength(0);
    expect(screen.queryByRole('list', { name: 'Your gardens' })).toBeNull();
    // The gesture that resolves the state, inside the invitation — beside the header's own button.
    expect(screen.getAllByRole('button', { name: 'Create Garden' })).toHaveLength(2);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('while the gardens load: skeletons and no card; when they fail: the error and « Try again », never a blank page', async () => {
    vi.mocked(fetchDashboardData).mockReturnValue(new Promise(() => {}));
    const { unmount } = renderPage();

    await screen.findByText('Novice view');
    await waitFor(() => expect(document.querySelectorAll('[data-novice-skeleton]').length).toBeGreaterThan(0));
    expect(cards()).toHaveLength(0);
    unmount();

    vi.mocked(fetchDashboardData).mockRejectedValue(new Error('down'));
    renderPage();

    expect(await screen.findByText('Unable to load gardens. Please try again later.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(cards()).toHaveLength(0);
  });
});

/**
 * An in-memory server of the formulas (the `useDashboardPreferences.test.ts`
 * idiom — the contract `FormulaSwitchTests` proves on the real one): a save
 * lands at the account's formula only; a switch archives the current layout
 * under the formula left and brings back the archived layout of the formula
 * entered, or its preset for a formula never visited.
 */
function serveFormulas(formula: DashboardLevel, blocks: DashboardBlock[] | null) {
  const server = { formula, current: blocks, archive: new Map<DashboardLevel, DashboardBlock[]>() };
  vi.mocked(fetchDashboardPreferences).mockImplementation(async () => ({
    schemaVersion: 1,
    level: server.formula,
    capabilities: capabilitiesFor(server.formula),
    isPreset: server.current === null,
    blocks: structuredClone(server.current ?? presetFor(server.formula)),
    updatedAt: null,
  }));
  vi.mocked(saveDashboardPreferences).mockImplementation(async ({ level, blocks: saved }) => {
    if (level !== server.formula) throw new HttpStatusError('Request failed (400)', 400);
    server.current = structuredClone(saved);
  });
  vi.mocked(changeFormula).mockImplementation(async (to) => {
    if (to === server.formula) return;
    if (server.current) server.archive.set(server.formula, server.current);
    server.current = server.archive.get(to) ?? null;
    server.archive.delete(to);
    server.formula = to;
  });
  return server;
}

/** The widget keys the grid renders, in DOM order — none on the cards page. */
const renderedKeys = () =>
  [...document.querySelectorAll('[data-widget]')].map((node) => node.getAttribute('data-widget'));

// SMA-448, lot F2, N3 — A NOVICE IS NEVER TRAPPED. The Novice page has no
// « Personnaliser », and the panel was the one door to another formula: until
// lot F3 builds the choice screen behind the chip (contract § 4.1, § 4.2),
// the chip is a BUTTON at the Novice formula and opens a small choice of the
// three formulas — PROVISIONAL, the closest thing to what F3 will build —
// wired to the switch of lot F1 and its honest outcomes: the refusal and its
// reasons, the layout that could not be written, the layout that could not be
// read back. Nothing is lost in either direction (V4).
describe('the Novice page — the provisional exit: the chip opens a choice of formula, never a dead end (SMA-448 lot F2, N3)', () => {
  const chip = () => screen.getByRole('button', { name: 'Novice view — change formula' });
  const chooser = () => screen.getByRole('dialog', { name: 'Change formula' });

  it('the chip is a button — « Novice view — change formula », a dialog behind it — that opens the three formulas, the current one checked', async () => {
    renderPage();

    const button = await screen.findByRole('button', { name: 'Novice view — change formula' });
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    fireEvent.click(button);

    const dialog = await screen.findByRole('dialog', { name: 'Change formula' });
    expect(within(dialog).getByRole('radiogroup', { name: 'Change formula' })).toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: /Novice/ })).toBeChecked();
    expect(within(dialog).getByRole('radio', { name: /Gardener/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: /Expert/ })).toBeInTheDocument();
    expect(within(dialog).getByText('the essentials, nothing more')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Close without changing formula' })).toBeInTheDocument();
    // The promise of the formulas, kept by lot F1 (V4).
    expect(within(dialog).getByText('Change whenever you like, in either direction, without losing anything.')).toBeInTheDocument();
  });

  it('the chip of the grid formulas stays a plain chip — their door is the panel, until lot F3', async () => {
    vi.mocked(fetchDashboardPreferences).mockResolvedValue({
      schemaVersion: 1,
      level: 'gardener',
      capabilities: capabilitiesFor('gardener'),
      isPreset: true,
      blocks: presetFor('gardener'),
      updatedAt: null,
    });
    renderPage();

    expect(await screen.findByText('Gardener view')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /change formula/u })).toBeNull();
  });

  it('closing the chooser changes nothing: the page stays the Novice page, the focus back on the chip', async () => {
    renderPage();
    const button = await screen.findByRole('button', { name: 'Novice view — change formula' });
    // As a keyboard does — jsdom, like some browsers, gives a clicked button
    // no focus of its own.
    button.focus();
    fireEvent.click(button);
    const dialog = await screen.findByRole('dialog', { name: 'Change formula' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close without changing formula' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Change formula' })).toBeNull());
    expect(changeFormula).not.toHaveBeenCalled();
    expect(cards()).toHaveLength(3);
    await waitFor(() => expect(document.activeElement).toBe(chip()));
  });

  it('choosing Gardener switches the formula on the server — writing no layout, a Novice has none — and the page becomes the grid, with the Gardener’s own layout back: nothing lost (V4)', async () => {
    // The Gardener's layout waits in the archive, rearranged: Gardens before
    // Weather, Tips in Small.
    const arranged = presetFor('gardener');
    [arranged[0], arranged[1]] = [arranged[1]!, arranged[0]!];
    arranged.find((block) => block.key === 'tips')!.size = 'small';
    const server = serveFormulas('novice', null);
    server.archive.set('gardener', arranged);
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(3));
    fireEvent.click(chip());
    const dialog = await screen.findByRole('dialog', { name: 'Change formula' });

    fireEvent.click(within(dialog).getByRole('radio', { name: /Gardener/ }));

    await waitFor(() => expect(renderedKeys()).toHaveLength(6));
    expect(renderedKeys().slice(0, 2)).toEqual(['gardens', 'weather']);
    expect(cards()).toHaveLength(0);
    expect(server.formula).toBe('gardener');
    expect(changeFormula).toHaveBeenCalledWith('gardener');
    // A Novice has no layout to write before the switch: nothing was sent.
    expect(saveDashboardPreferences).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Change formula' })).toBeNull());
    // The Gardener's chip — « · adjusted », its layout being rearranged — a
    // plain chip again, not a button.
    expect(await screen.findByText('Gardener view · adjusted')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /change formula/u })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    // The chip the chooser was opened from opens nothing now: the focus goes
    // to « Create Garden », the control every formula's header has — never
    // to the body.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Create Garden' })));
  });

  it('a formula the server refuses is said in the chooser, with each reason served — the formula stays, the chip stays a button, the indicator says nothing false', async () => {
    vi.mocked(changeFormula).mockRejectedValue(
      new HttpStatusError('Request failed (409)', 409, {
        status: 409,
        code: 'formula.tooSmall',
        formula: 'gardener',
        reasons: [{ kind: 'gardens', have: 12, limit: 10 }],
      })
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Novice view — change formula' }));
    const dialog = await screen.findByRole('dialog', { name: 'Change formula' });

    fireEvent.click(within(dialog).getByRole('radio', { name: /Gardener/ }));

    const said = await within(dialog).findByText('Can’t switch to Gardener: 12 gardens for 10 at most');
    expect(said).toHaveAttribute('role', 'status');
    expect(said).toHaveAttribute('aria-live', 'polite');
    expect(within(dialog).getByRole('radio', { name: /Novice/ })).toBeChecked();
    expect(within(dialog).getByRole('radio', { name: /Gardener/ })).toBeEnabled();
    expect(screen.queryByText('Changes not saved')).toBeNull();
    expect(cards()).toHaveLength(3);
    // Behind the open dialog — hidden from the accessibility tree while it is — the chip is still the button.
    expect(screen.getByRole('button', { name: 'Novice view — change formula', hidden: true })).toBeInTheDocument();
  });

  it('the chooser’s refusal region is born empty and stays mounted — never assertive', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Novice view — change formula' }));
    const dialog = await screen.findByRole('dialog', { name: 'Change formula' });

    const region = within(dialog).getByRole('status');
    expect(region).toHaveTextContent('');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(dialog.querySelector('[aria-live="assertive"]')).toBeNull();
  });

  it('a switch whose layout cannot be read back closes the chooser on the load error and its retry — the focus on « Try again » — and the retry brings the new formula', async () => {
    serveFormulas('novice', null);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Novice view — change formula' }));
    const dialog = await screen.findByRole('dialog', { name: 'Change formula' });
    vi.mocked(fetchDashboardPreferences).mockRejectedValueOnce(new Error('network'));

    fireEvent.click(within(dialog).getByRole('radio', { name: /Expert/ }));

    expect(await screen.findByText('Couldn’t load your dashboard.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Change formula' })).toBeNull());
    const retry = screen.getByRole('button', { name: 'Try again' });
    await waitFor(() => expect(document.activeElement).toBe(retry));
    expect(screen.queryByText('Changes not saved')).toBeNull();

    fireEvent.click(retry);

    await waitFor(() => expect(renderedKeys()).toHaveLength(9));
    expect(await screen.findByText('Expert view')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Change formula' })).toBeNull();
  });

  it('the foot of the page says what the Gardener formula adds, and its link opens the same chooser', async () => {
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(3));

    const foot = document.querySelector('[data-novice-foot-message]');
    expect(foot).toHaveTextContent(
      'Need more? The Gardener formula adds a dashboard of widgets: the month’s calendar, the tips, the tasks and the counts.'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Switch to the Gardener formula →' }));

    expect(await screen.findByRole('dialog', { name: 'Change formula' })).toBeInTheDocument();
    expect(chooser()).toBeInTheDocument();
  });

  it('dit la formule refusée en français, avec la raison servie', async () => {
    localStorage.setItem('smartcrops-language', 'fr');
    vi.mocked(changeFormula).mockRejectedValue(
      new HttpStatusError('Request failed (409)', 409, {
        status: 409,
        code: 'formula.tooSmall',
        formula: 'gardener',
        reasons: [{ kind: 'gardens', have: 12, limit: 10 }],
      })
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Vue Novice — changer de formule' }));
    const dialog = await screen.findByRole('dialog', { name: 'Changer de formule' });

    fireEvent.click(within(dialog).getByRole('radio', { name: /Jardinier/ }));

    expect(await within(dialog).findByText('Impossible de passer en Jardinier : 12 jardins pour 10 au plus')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Passer à la formule Jardinier →', hidden: true })).toBeInTheDocument();
  });
});
