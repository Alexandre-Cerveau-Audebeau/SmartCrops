import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import { UnitSystemProvider } from '../contexts/UnitSystemContext';
import { capabilitiesFor, catalogFor, presetFor } from '../test/fixtures/formulas';
import { dashboardFixture } from '../test/fixtures/dashboard';
import { linkFixture, weatherFixture } from '../test/fixtures/weather';
import { gardens as sceneGardens, varieties as sceneVarieties, weatherAll } from '../test/layout/scenes';
import { rulesFor } from '../test/dashboardDom';
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

// The catalogue the choice screen draws from (lot F3, L5): the Novice's, three gardens.
vi.mock('../services/formulasApi', () => ({ fetchFormulas: vi.fn() }));

import { fetchDashboardWeather } from '../services/weatherApi';
import { fetchProfile } from '../services/profileApi';
import { fetchFormulas } from '../services/formulasApi';
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
    formulaChosen: true,
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
  vi.mocked(fetchFormulas).mockResolvedValue(catalogFor('novice', { gardenCount: 3 }));
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
    formulaChosen: true,
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

/** The SMA-174 patience for a switch's round trips under the whole suite's load, below the 20 s test timeout. */
const PATIENCE = { timeout: 10000 };

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
  const chooser = () => screen.getByRole('dialog', { name: 'Choose your formula' });

  it('the chip is a button — « Novice view — change formula », a dialog behind it — that opens the three offers, the current one « Your formula »', async () => {
    renderPage();

    const button = await screen.findByRole('button', { name: 'Novice view — change formula' });
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    fireEvent.click(button);

    const dialog = await screen.findByRole('dialog', { name: 'Choose your formula' });
    // The choice screen of V3-01 (lot F3, L5) in place of the provisional
    // radios: the three offers, the current one « Your formula » with
    // « Keep », the others « Choose » — the same wiring behind.
    expect(await within(dialog).findByRole('button', { name: 'Keep Novice' }, PATIENCE)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Choose Gardener' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Choose Expert' })).toBeInTheDocument();
    expect(within(dialog).getByText('Your formula')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Close without changing formula' })).toBeInTheDocument();
    // The promise of the formulas, kept by lot F1 (V4), said in the lead.
    expect(within(dialog).getByText(/you can change at any time/)).toBeInTheDocument();
  });

  it('the chip of the grid formulas is the same button (lot F3, L6): « Gardener view — change formula », a dialog behind it, the screen it opens', async () => {
    vi.mocked(fetchDashboardPreferences).mockResolvedValue({
      schemaVersion: 1,
      level: 'gardener',
      capabilities: capabilitiesFor('gardener'),
      isPreset: true,
      formulaChosen: true,
      blocks: presetFor('gardener'),
      updatedAt: null,
    });
    vi.mocked(fetchFormulas).mockResolvedValue(catalogFor('gardener', { gardenCount: 3 }));
    renderPage();

    expect(await screen.findByText('Gardener view')).toBeInTheDocument();
    const chip = screen.getByRole('button', { name: 'Gardener view — change formula' });
    expect(chip).toHaveAttribute('aria-haspopup', 'dialog');
    fireEvent.click(chip);
    const dialog = await screen.findByRole('dialog', { name: 'Choose your formula' });
    expect(await within(dialog).findByRole('button', { name: 'Keep Gardener' }, PATIENCE)).toBeInTheDocument();
  });

  it('closing the chooser changes nothing: the page stays the Novice page, the focus back on the chip', async () => {
    renderPage();
    const button = await screen.findByRole('button', { name: 'Novice view — change formula' });
    // As a keyboard does — jsdom, like some browsers, gives a clicked button
    // no focus of its own.
    button.focus();
    fireEvent.click(button);
    const dialog = await screen.findByRole('dialog', { name: 'Choose your formula' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close without changing formula' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose your formula' })).toBeNull(), PATIENCE);
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
    const dialog = await screen.findByRole('dialog', { name: 'Choose your formula' });

    fireEvent.click(await within(dialog).findByRole('button', { name: 'Choose Gardener' }, PATIENCE));

    await waitFor(() => expect(renderedKeys()).toHaveLength(6), PATIENCE);
    expect(renderedKeys().slice(0, 2)).toEqual(['gardens', 'weather']);
    expect(cards()).toHaveLength(0);
    expect(server.formula).toBe('gardener');
    expect(changeFormula).toHaveBeenCalledWith('gardener');
    // A Novice has no layout to write before the switch: nothing was sent.
    expect(saveDashboardPreferences).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose your formula' })).toBeNull(), PATIENCE);
    // The Gardener's chip — « · adjusted », its layout being rearranged —
    // a button still (lot F3, L6): the door of every formula.
    expect(await screen.findByText('Gardener view · adjusted', {}, PATIENCE)).toBeInTheDocument();
    const chipAfter = screen.getByRole('button', { name: 'Gardener view — change formula' });
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    // The chip the chooser was opened from is still there: the focus returns
    // to it (contract v3 § 4.1) — never to the body.
    await waitFor(() => expect(document.activeElement).toBe(chipAfter), PATIENCE);
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
    const dialog = await screen.findByRole('dialog', { name: 'Choose your formula' });

    fireEvent.click(await within(dialog).findByRole('button', { name: 'Choose Gardener' }, PATIENCE));

    const said = await within(dialog).findByText('Can’t switch to Gardener: 12 gardens for 10 at most');
    expect(said).toHaveAttribute('role', 'status');
    expect(said).toHaveAttribute('aria-live', 'polite');
    expect(within(dialog).getByRole('button', { name: 'Keep Novice' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Choose Gardener' })).toBeEnabled();
    expect(screen.queryByText('Changes not saved')).toBeNull();
    expect(cards()).toHaveLength(3);
    // Behind the open dialog — hidden from the accessibility tree while it is — the chip is still the button.
    expect(screen.getByRole('button', { name: 'Novice view — change formula', hidden: true })).toBeInTheDocument();
  });

  it('the chooser’s refusal region is born empty and stays mounted — never assertive', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Novice view — change formula' }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose your formula' });

    const region = within(dialog).getByRole('status');
    expect(region).toHaveTextContent('');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(dialog.querySelector('[aria-live="assertive"]')).toBeNull();
  });

  it('a switch whose layout cannot be read back closes the chooser on the load error and its retry — the focus on « Try again » — and the retry brings the new formula', async () => {
    serveFormulas('novice', null);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Novice view — change formula' }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose your formula' });
    vi.mocked(fetchDashboardPreferences).mockRejectedValueOnce(new Error('network'));

    fireEvent.click(await within(dialog).findByRole('button', { name: 'Choose Expert' }, PATIENCE));

    expect(await screen.findByText('Couldn’t load your dashboard.', {}, PATIENCE)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose your formula' })).toBeNull(), PATIENCE);
    const retry = screen.getByRole('button', { name: 'Try again' });
    await waitFor(() => expect(document.activeElement).toBe(retry), PATIENCE);
    expect(screen.queryByText('Changes not saved')).toBeNull();

    fireEvent.click(retry);

    await waitFor(() => expect(renderedKeys()).toHaveLength(9), PATIENCE);
    expect(await screen.findByText('Expert view', {}, PATIENCE)).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Choose your formula' })).toBeNull();
  });

  it('the foot of the page says what the Gardener formula adds, and its link opens the same chooser', async () => {
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(3));

    const foot = document.querySelector('[data-novice-foot-message]');
    expect(foot).toHaveTextContent(
      'Need more? The Gardener formula adds a dashboard of widgets: the month’s calendar, the tips, the tasks and the counts.'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Switch to the Gardener formula →' }));

    expect(await screen.findByRole('dialog', { name: 'Choose your formula' })).toBeInTheDocument();
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
    const dialog = await screen.findByRole('dialog', { name: 'Choisissez votre formule' });

    fireEvent.click(await within(dialog).findByRole('button', { name: 'Choisir Jardinier' }, PATIENCE));

    expect(await within(dialog).findByText('Impossible de passer en Jardinier : 12 jardins pour 10 au plus')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Passer à la formule Jardinier →', hidden: true })).toBeInTheDocument();
  });
});

// SMA-448, lot F2, N4 — ACCESSIBILITY (contract V16): the cards as a named
// list with one heading per garden; everything at the keyboard, the focus
// visible; the live regions born empty and kept mounted, never assertive;
// the decorative glyphs hidden from assistive technology; no state written
// in an effect (the page's one effect moves the focus, nothing else).
describe('the Novice page — at the keyboard and for a screen reader (SMA-448 lot F2, N4)', () => {
  /** What the focus is on, named as a screen reader would name it: the accessible name, or the marker of the node. */
  const focused = () => {
    const active = document.activeElement as HTMLElement | null;
    if (!active || active === document.body) return 'body';
    return active.getAttribute('aria-label') ?? active.textContent ?? active.tagName;
  };

  it('lists the cards as a named list — one list item and one h2 per garden, in a `ul` — and nothing else of the page is an h2', async () => {
    renderPage();

    const list = await screen.findByRole('list', { name: 'Your gardens' });
    expect(list.tagName).toBe('UL');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item.tagName).toBe('LI');
      expect(within(item).getAllByRole('heading', { level: 2 })).toHaveLength(1);
    }
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('reaches at the keyboard, card after card, the name, the pencil, the bin and the weather door — and never the chevron', async () => {
    renderPage();
    await waitFor(() => expect(document.querySelectorAll('[data-novice-weather]')).toHaveLength(3));
    const user = userEvent.setup();

    // From the header: the chip, then « Create Garden », then the first card.
    const reached: string[] = [];
    for (let step = 0; step < 14; step += 1) {
      await user.tab();
      reached.push(focused());
    }
    expect(reached).toEqual([
      'Novice view — change formula',
      'Create Garden',
      'Terrasse',
      'Edit Terrasse',
      'Delete Terrasse',
      'Change the location of Terrasse',
      'Balcon sud',
      'Edit Balcon sud',
      'Delete Balcon sud',
      'Change the location of Balcon sud',
      'Potager du fond',
      'Edit Potager du fond',
      'Delete Potager du fond',
      'Change the location of Potager du fond',
    ]);
    // The chevron is never a stop: the name is the card's one link.
    for (const chevron of document.querySelectorAll('[data-novice-chevron]')) {
      expect(chevron).toHaveAttribute('tabindex', '-1');
    }
    // …and after the last card, the foot's link.
    await user.tab();
    expect(focused()).toBe('Switch to the Gardener formula →');
  });

  it('declares a visible focus ring on the card’s own controls — the name, the weather door — and on the chip', async () => {
    renderPage();
    await waitFor(() => expect(document.querySelectorAll('[data-novice-weather]')).toHaveLength(3));

    const name = within(cardOf('g1')).getByRole('link', { name: 'Terrasse' });
    const door = cardOf('g1').querySelector('[data-novice-weather]')!;
    const chip = screen.getByRole('button', { name: 'Novice view — change formula' });
    for (const control of [name, door]) {
      const rules = rulesFor(control).replace(/\s+/g, '');
      expect(rules).toContain(':focus-visible');
      expect(rules).toMatch(/outline:2pxsolid/u);
    }
    const chipRules = rulesFor(chip).replace(/\s+/g, '');
    expect(chipRules).toContain('.Mui-focusVisible');
    expect(chipRules).toMatch(/outline:2pxsolid/u);
  });

  it('keeps its live regions born empty and mounted — the header’s save indicator, the chooser’s refusal — and none assertive', async () => {
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(3));

    const indicator = document.querySelector('[data-save-status]');
    expect(indicator).not.toBeNull();
    expect(indicator).toHaveAttribute('role', 'status');
    expect(indicator).toHaveTextContent('');
    expect(document.querySelector('[aria-live="assertive"]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Novice view — change formula' }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose your formula' });
    expect(within(dialog).getByRole('status')).toHaveTextContent('');
    expect(document.querySelector('[aria-live="assertive"]')).toBeNull();
  });

  it('hides the decorative glyphs from assistive technology: the task’s, the chip’s, the chevron’s — the weather door and the buttons keep their names', async () => {
    renderPage();
    await waitFor(() => expect(document.querySelectorAll('[data-novice-weather]')).toHaveLength(3));
    const terrasse = cardOf('g1');

    expect(terrasse.querySelector('[data-novice-task] svg')).toHaveAttribute('aria-hidden', 'true');
    expect(terrasse.querySelector('[data-novice-chevron]')).toHaveAttribute('aria-hidden', 'true');
    for (const glyph of terrasse.querySelectorAll('.MuiChip-root svg')) {
      expect(glyph).toHaveAttribute('aria-hidden', 'true');
    }
    expect(within(terrasse).getByRole('button', { name: 'Change the location of Terrasse' })).toBeInTheDocument();
    expect(within(terrasse).getByRole('button', { name: 'Edit Terrasse' })).toBeInTheDocument();
    expect(within(terrasse).getByRole('button', { name: 'Delete Terrasse' })).toBeInTheDocument();
  });

  it('Escape closes the chooser — and does nothing while a switch is on the wire, when the choice takes no gesture (S5)', async () => {
    let release!: () => void;
    const server = serveFormulas('novice', null);
    // Installed AFTER `serveFormulas`'s own mock — the one the switch on the
    // wire waits on (fix round 2, U1: a first mock, overwritten twice before
    // any call, is gone).
    vi.mocked(changeFormula).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = () => {
            server.formula = 'expert';
            resolve();
          };
        })
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Novice view — change formula' }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose your formula' });

    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose your formula' })).toBeNull(), PATIENCE);

    fireEvent.click(await screen.findByRole('button', { name: 'Novice view — change formula' }));
    const reopened = await screen.findByRole('dialog', { name: 'Choose your formula' });
    fireEvent.click(await within(reopened).findByRole('button', { name: 'Choose Expert' }, PATIENCE));
    await waitFor(() => expect(changeFormula).toHaveBeenCalledWith('expert'));
    for (const name of ['Keep Novice', 'Choose Gardener', 'Choose Expert']) {
      expect(within(reopened).getByRole('button', { name })).toBeDisabled();
    }
    expect(within(reopened).getByRole('button', { name: 'Close without changing formula' })).toBeDisabled();
    fireEvent.keyDown(reopened, { key: 'Escape', code: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Choose your formula' })).toBeInTheDocument();

    release();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose your formula' })).toBeNull(), PATIENCE);
    expect(await screen.findByText('Expert view', {}, PATIENCE)).toBeInTheDocument();
  });

  it('opens the rename and the delete dialogs from a card, and gives the focus back to the button they were opened from', async () => {
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(3));

    const pencil = within(cardOf('g1')).getByRole('button', { name: 'Edit Terrasse' });
    pencil.focus();
    fireEvent.click(pencil);
    const rename = await screen.findByRole('dialog', { name: 'Edit garden' });
    expect(within(rename).getByRole('textbox', { name: /^Name/ })).toHaveValue('Terrasse');
    fireEvent.click(within(rename).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit garden' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(pencil));

    const bin = within(cardOf('g2')).getByRole('button', { name: 'Delete Balcon sud' });
    bin.focus();
    fireEvent.click(bin);
    const remove = await screen.findByRole('dialog', { name: 'Delete this garden?' });
    expect(within(remove).getByText(/“Balcon sud”/u)).toBeInTheDocument();
    fireEvent.click(within(remove).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Delete this garden?' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(bin));
  });
});
