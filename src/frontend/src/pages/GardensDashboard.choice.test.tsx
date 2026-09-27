import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import { UnitSystemProvider } from '../contexts/UnitSystemContext';
import { capabilitiesFor, catalogFor, presetFor } from '../test/fixtures/formulas';
import { dashboardFixture } from '../test/fixtures/dashboard';
import { weatherFixture } from '../test/fixtures/weather';
import type { DashboardLevel, FormulaRefusalReason } from '../types/Dashboard';

vi.mock('../services/gardenApi', () => ({
  createGarden: vi.fn(),
  updateGarden: vi.fn(),
  deleteGarden: vi.fn(),
}));

vi.mock('../services/dashboardApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/dashboardApi')>()),
  fetchDashboardPreferences: vi.fn(),
  saveDashboardPreferences: vi.fn(),
  fetchDashboardData: vi.fn(),
  changeFormula: vi.fn(),
}));

vi.mock('../services/formulasApi', () => ({ fetchFormulas: vi.fn() }));

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
import { fetchFormulas } from '../services/formulasApi';
import GardensDashboard from './GardensDashboard';
import {
  changeFormula,
  fetchDashboardData,
  fetchDashboardPreferences,
  saveDashboardPreferences,
} from '../services/dashboardApi';
import { HttpStatusError } from '../services/httpStatusError';

// SMA-448, lot F3, step L5 — THE CHOICE SCREEN (V3-01; contract v3 § 4.2):
// the three offers, their limits as the server serves them, « Conseillé pour
// vous », « Indisponible » with its reason, « Votre formule — conservée »;
// shown ONCE to an account that never chose (FormulaChosenAt null — N18,
// Alexandre 26/09), mandatory then: no close, no Escape; reopenable from the
// chip; the choice goes through lot F1's switch, losing nothing.

/**
 * The server: the account's formula, whether it chose it, its gardens, and
 * what it refuses — the layout read says the first two, the catalogue all of
 * it, and the switch moves them.
 */
function serve(
  level: DashboardLevel,
  {
    chosen = true,
    gardenCount = 0,
    unavailable = {},
  }: { chosen?: boolean; gardenCount?: number; unavailable?: Partial<Record<DashboardLevel, FormulaRefusalReason[]>> } = {}
) {
  const server = { formula: level, chosen, gardenCount, unavailable };
  vi.mocked(fetchDashboardPreferences).mockImplementation(async () => ({
    schemaVersion: 1,
    level: server.formula,
    capabilities: capabilitiesFor(server.formula),
    isPreset: true,
    formulaChosen: server.chosen,
    blocks: presetFor(server.formula),
    updatedAt: null,
  }));
  vi.mocked(fetchFormulas).mockImplementation(async () =>
    catalogFor(server.formula, { chosen: server.chosen, gardenCount: server.gardenCount, unavailable: server.unavailable })
  );
  vi.mocked(changeFormula).mockImplementation(async (to) => {
    const reasons = server.unavailable[to] ?? [];
    if (to !== server.formula && reasons.length > 0) {
      throw new HttpStatusError('Request failed (409)', 409, { status: 409, code: 'formula.tooSmall', formula: to, reasons });
    }
    server.formula = to;
    server.chosen = true;
  });
  return server;
}

function renderPage() {
  return render(
    <LanguageProvider>
      <UnitSystemProvider>
        <MemoryRouter initialEntries={['/gardens']}>
          <GardensDashboard />
        </MemoryRouter>
      </UnitSystemProvider>
    </LanguageProvider>
  );
}

const PATIENCE = { timeout: 10000 };
const dialog = () => screen.findByRole('dialog', { name: 'Choose your formula' }, PATIENCE);
const offer = (level: DashboardLevel) => document.querySelector<HTMLElement>(`[data-formula-offer="${level}"]`)!;
const tagsOf = (level: DashboardLevel) =>
  [...offer(level).querySelectorAll('[data-offer-tag]')].map((tag) => tag.getAttribute('data-offer-tag'));

beforeEach(() => {
  localStorage.setItem('smartcrops-language', 'en');
  vi.mocked(fetchProfile).mockResolvedValue({
    email: 'a@example.test',
    displayName: null,
    firstName: null,
    lastName: null,
    city: null,
    hasPassword: true,
  });
  vi.mocked(fetchDashboardData).mockResolvedValue(dashboardFixture([]));
  vi.mocked(fetchDashboardWeather).mockResolvedValue(weatherFixture([], []));
  vi.mocked(saveDashboardPreferences).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

// SMA-448, lot F3, step L6 — THE CHIP-BUTTON at every formula (V3-04;
// contract v3 § 4.1): the door to the choice screen, in Gardener and Expert
// as in Novice — the arrow, the tooltip, the focus ring, the accessible
// name, `aria-haspopup="dialog"` — and the focus back on it when the screen
// closes.
describe('the chip-button at every formula (SMA-448, lot F3, L6)', () => {
  it.each(['gardener', 'expert'] as const)('%s: the chip is a button that opens the screen — the current formula « Keep » —, and closing gives it the focus back', async (level) => {
    serve(level, { chosen: true, gardenCount: 4 });
    renderPage();

    const name = level === 'gardener' ? 'Gardener' : 'Expert';
    const chip = await screen.findByRole('button', { name: `${name} view — change formula` }, PATIENCE);
    expect(chip).toHaveAttribute('aria-haspopup', 'dialog');
    expect(screen.queryByRole('dialog', { name: 'Choose your formula' })).toBeNull();
    chip.focus();
    fireEvent.click(chip);

    const screenOfChoice = await dialog();
    await within(screenOfChoice).findByRole('button', { name: `Keep ${name}` }, PATIENCE);
    expect(within(screenOfChoice).getByRole('button', { name: 'Close without changing formula' })).toBeInTheDocument();
    fireEvent.click(within(screenOfChoice).getByRole('button', { name: 'Close without changing formula' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose your formula' })).toBeNull(), PATIENCE);
    await waitFor(() => expect(document.activeElement).toBe(chip), PATIENCE);
    expect(changeFormula).not.toHaveBeenCalled();
  });

  it('the Expert chooses Gardener from the chip: the switch goes through, the page becomes the Gardener grid, the chip still the button, the focus on it', async () => {
    const server = serve('expert', { chosen: true, gardenCount: 4 });
    renderPage();
    const chip = await screen.findByRole('button', { name: 'Expert view — change formula' }, PATIENCE);
    chip.focus();
    fireEvent.click(chip);
    const screenOfChoice = await dialog();

    fireEvent.click(await within(screenOfChoice).findByRole('button', { name: 'Choose Gardener' }, PATIENCE));

    await waitFor(() => expect(changeFormula).toHaveBeenCalledWith('gardener'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose your formula' })).toBeNull(), PATIENCE);
    expect(server.formula).toBe('gardener');
    const chipAfter = await screen.findByRole('button', { name: 'Gardener view — change formula' }, PATIENCE);
    await waitFor(() => expect(document.activeElement).toBe(chipAfter), PATIENCE);
  });
});

describe('the choice screen, shown once (SMA-448, lot F3, L5 — N18)', () => {
  it('an account that never chose sees the screen with the page, mandatory: no close button, Escape does nothing, the three offers to choose from, Novice recommended', async () => {
    serve('gardener', { chosen: false, gardenCount: 0 });
    renderPage();

    const screenOfChoice = await dialog();
    await within(screenOfChoice).findByRole('button', { name: 'Choose Novice' }, PATIENCE);
    expect(within(screenOfChoice).queryByRole('button', { name: 'Close without changing formula' })).toBeNull();
    fireEvent.keyDown(screenOfChoice, { key: 'Escape', code: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Choose your formula' })).toBeInTheDocument();

    // A new account: no formula of its own yet — three « Choose », no « Keep ».
    expect(within(screenOfChoice).getByRole('button', { name: 'Choose Gardener' })).toBeInTheDocument();
    expect(within(screenOfChoice).getByRole('button', { name: 'Choose Expert' })).toBeInTheDocument();
    expect(within(screenOfChoice).queryByRole('button', { name: /^Keep/ })).toBeNull();
    expect(tagsOf('novice')).toEqual(['recommended']);
    expect(tagsOf('gardener')).toEqual([]);
    expect(within(screenOfChoice).getByText(/Welcome\. Before opening your gardens/)).toBeInTheDocument();
    expect(changeFormula).not.toHaveBeenCalled();
  });

  it('« Keep Gardener » for an existing account: the current formula preselected, kept in one click — the choice stamped on the server —, the screen closes, the focus on « Create Garden », and it is not shown again', async () => {
    const server = serve('gardener', { chosen: false, gardenCount: 2 });
    const { unmount } = renderPage();

    const screenOfChoice = await dialog();
    const keep = await within(screenOfChoice).findByRole('button', { name: 'Keep Gardener' }, PATIENCE);
    expect(tagsOf('gardener')).toEqual(['current']);
    expect(within(screenOfChoice).getByText(/You have 2 gardens\. Your current formula is preselected/)).toBeInTheDocument();
    // Never « Recommended » on Novice here: it would advise going down (decision 3, 22/09 18:02).
    expect(tagsOf('novice')).toEqual([]);

    fireEvent.click(keep);

    await waitFor(() => expect(changeFormula).toHaveBeenCalledWith('gardener'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose your formula' })).toBeNull(), PATIENCE);
    expect(server.chosen).toBe(true);
    expect(server.formula).toBe('gardener');
    // The header's « Create Garden » (`data-create-garden`) — the empty Gardens widget of the grid offers one too.
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('[data-create-garden]')), PATIENCE);

    // Once: the next visit does not ask again.
    unmount();
    renderPage();
    expect(await screen.findByText('Gardener view', {}, PATIENCE)).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Choose your formula' })).toBeNull();
  });

  it('an account that chose sees no screen at load; the chip reopens it, closable, and closing changes nothing', async () => {
    serve('novice', { chosen: true, gardenCount: 1 });
    renderPage();

    const chip = await screen.findByRole('button', { name: 'Novice view — change formula' }, PATIENCE);
    expect(screen.queryByRole('dialog', { name: 'Choose your formula' })).toBeNull();
    fireEvent.click(chip);

    const screenOfChoice = await dialog();
    await within(screenOfChoice).findByRole('button', { name: 'Keep Novice' }, PATIENCE);
    expect(within(screenOfChoice).getByText(/You are on Novice and you have 1 garden/)).toBeInTheDocument();
    fireEvent.click(within(screenOfChoice).getByRole('button', { name: 'Close without changing formula' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose your formula' })).toBeNull(), PATIENCE);
    expect(changeFormula).not.toHaveBeenCalled();
  });

  it('a formula too small is unavailable and explained, its button inert: five gardens, « You have 5 gardens — Novice allows 3. », nothing deleted', async () => {
    serve('gardener', { chosen: false, gardenCount: 5, unavailable: { novice: [{ kind: 'gardens', have: 5, limit: 3 }] } });
    renderPage();

    const screenOfChoice = await dialog();
    const choose = await within(screenOfChoice).findByRole('button', { name: 'Choose Novice' }, PATIENCE);
    expect(choose).toBeDisabled();
    expect(tagsOf('novice')).toEqual(['unavailable']);
    expect(offer('novice').textContent).toContain('You have 5 gardens — Novice allows 3.');
    expect(offer('novice').textContent).toContain('No garden will be deleted: this formula is simply too small for yours.');
    expect(tagsOf('gardener')).toEqual(['current', 'recommended']);
    expect(within(screenOfChoice).getByRole('button', { name: 'Keep Gardener' })).toBeEnabled();
  });

  it('a formula too small for a garden’s size is explained with the garden’s size (N19)', async () => {
    serve('gardener', {
      chosen: false,
      gardenCount: 2,
      unavailable: {
        novice: [{ kind: 'size', gardenId: 'g1', width: 30, height: 12, maxWidth: 20, maxHeight: 20 }],
      },
    });
    renderPage();

    const screenOfChoice = await dialog();
    await within(screenOfChoice).findByRole('button', { name: 'Choose Novice' }, PATIENCE);
    expect(within(screenOfChoice).getByRole('button', { name: 'Choose Novice' })).toBeDisabled();
    expect(offer('novice').textContent).toContain('A garden of 30 × 12 cells — Novice allows 20 × 20.');
    expect(tagsOf('novice')).toEqual(['unavailable']);
  });

  it('the current formula beyond its own limit is kept: twelve gardens on Gardener — « Your formula — kept », « Keep Gardener » live, Novice unavailable, Expert recommended', async () => {
    serve('gardener', {
      chosen: false,
      gardenCount: 12,
      unavailable: { novice: [{ kind: 'gardens', have: 12, limit: 3 }], gardener: [{ kind: 'gardens', have: 12, limit: 10 }] },
    });
    renderPage();

    const screenOfChoice = await dialog();
    const keep = await within(screenOfChoice).findByRole('button', { name: 'Keep Gardener' }, PATIENCE);
    expect(keep).toBeEnabled();
    expect(tagsOf('gardener')).toEqual(['currentKept']);
    expect(offer('gardener').textContent).toContain('You keep everything: nothing will be deleted.');
    expect(tagsOf('novice')).toEqual(['unavailable']);
    expect(within(screenOfChoice).getByRole('button', { name: 'Choose Novice' })).toBeDisabled();
    expect(tagsOf('expert')).toEqual(['recommended']);
    expect(within(screenOfChoice).getByRole('button', { name: 'Choose Expert' })).toBeEnabled();
  });

  it('the offers say what the catalogue serves — 3, 10, unlimited gardens; 20 × 20, 50 × 50, 100 × 100 cells —, every price €0, never a harvest promised, no weather warning', async () => {
    serve('gardener', { chosen: false, gardenCount: 0 });
    renderPage();

    const screenOfChoice = await dialog();
    await within(screenOfChoice).findByRole('button', { name: 'Choose Novice' }, PATIENCE);

    expect(offer('novice').textContent).toContain('Up to 3 gardens');
    expect(offer('novice').textContent).toContain('Up to 20 × 20 cells per garden');
    expect(offer('gardener').textContent).toContain('Up to 10 gardens');
    expect(offer('gardener').textContent).toContain('Up to 50 × 50 cells per garden');
    expect(offer('expert').textContent).toContain('Unlimited gardens');
    expect(offer('expert').textContent).toContain('Up to 100 × 100 cells per garden');
    expect(within(screenOfChoice).getAllByText('€0')).toHaveLength(3);
    expect(within(screenOfChoice).getAllByText('Free for now.')).toHaveLength(3);
    // The Harvest widget is never promised (Alexandre, 26/09, question 3);
    // the calendar's « harvests » — its harvest periods, which exist — is
    // not the widget.
    expect(screenOfChoice.textContent).not.toMatch(/\bharvest\b|\brécolte\b/i);
    expect(screenOfChoice.textContent).not.toMatch(/\$|€\s?[1-9]|[1-9]\s?€/);
    expect(document.querySelector('[data-weather-disclaimer]')).toBeNull();
    // Everything Gardener offers, plus — the comparison too.
    expect(offer('gardener').textContent).toContain('Everything Novice offers, plus:');
    expect(offer('expert').textContent).toContain('Everything Gardener offers, plus:');
    expect(within(screenOfChoice).getByRole('table')).toBeInTheDocument();
  });

  // SMA-448, PR #297, fix round 1 (A3) — Alexandre, 27/09 (Linear, 22:04):
  // the Expert offer carries EXACTLY three lines — its two of lot F3,
  // unchanged, and « Météo pour plusieurs jardins, dans plusieurs villes
  // différentes en même temps » —, no other (SMA-453 for the rest). So that
  // the page does not contradict itself, the comparison's weather row tells
  // the Gardener's one city from the Expert's several. True once lot F4 is
  // delivered: a prerequisite of the promotion of the v3.
  describe('the Expert offer and the comparison’s weather row (A3)', () => {
    const featuresOf = (level: DashboardLevel) => [...offer(level).querySelectorAll('[data-offer-features] li')].map((line) => line.textContent);
    const rowOf = (table: HTMLElement, label: string) => {
      const row = [...table.querySelectorAll('tbody tr')].find((candidate) => candidate.querySelector('th')?.textContent === label);
      return row ? [...row.querySelectorAll('td')].map((cell) => cell.textContent) : ['no such row'];
    };

    it('in English: exactly three lines for the Expert — the two of lot F3 unchanged, then the weather of several gardens in several cities at once; the weather row tells one city from several', async () => {
      serve('gardener', { chosen: true, gardenCount: 2 });
      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: 'Gardener view — change formula' }, PATIENCE));
      const screenOfChoice = await dialog();
      await within(screenOfChoice).findByRole('button', { name: 'Choose Expert' }, PATIENCE);

      expect(featuresOf('expert')).toEqual([
        'Every widget, statistics included',
        'A band of key figures at the top of the page, across the full width',
        'Weather for several gardens, in several different cities at the same time',
      ]);
      expect(rowOf(within(screenOfChoice).getByRole('table'), 'Each garden’s weather')).toEqual([
        'Today’s weather, on each card',
        'The Weather widget, for one city',
        'The Weather widget, for several cities at the same time',
      ]);
    });

    it('en français : « Météo pour plusieurs jardins, dans plusieurs villes différentes en même temps » en troisième ligne, et la ligne Météo du comparatif distingue une ville de plusieurs', async () => {
      localStorage.setItem('smartcrops-language', 'fr');
      serve('gardener', { chosen: true, gardenCount: 2 });
      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: 'Vue Jardinier — changer de formule' }, PATIENCE));
      const screenOfChoice = await screen.findByRole('dialog', { name: 'Choisissez votre formule' }, PATIENCE);
      await within(screenOfChoice).findByRole('button', { name: 'Choisir Expert' }, PATIENCE);

      expect(featuresOf('expert')).toEqual([
        'Tous les widgets, statistiques comprises',
        'Un bandeau de chiffres clés en tête de page, sur toute la largeur',
        'Météo pour plusieurs jardins, dans plusieurs villes différentes en même temps',
      ]);
      expect(rowOf(within(screenOfChoice).getByRole('table'), 'La météo de chaque jardin')).toEqual([
        'La météo du jour, sur chaque carte',
        'Le widget Météo, pour une ville',
        'Le widget Météo, pour plusieurs villes en même temps',
      ]);
    });
  });

  it('a choice the server refuses is said in the region, with its reasons — the screen stays, mandatory as it was', async () => {
    serve('gardener', { chosen: false, gardenCount: 5, unavailable: { novice: [{ kind: 'gardens', have: 5, limit: 3 }] } });
    // The server says it, whatever the screen shows (R8): the button is
    // inert, so the refusal comes through the panel-less path — here, a
    // choice of Expert refused by a server that changed its mind.
    vi.mocked(changeFormula).mockRejectedValue(
      new HttpStatusError('Request failed (409)', 409, {
        status: 409,
        code: 'formula.tooSmall',
        formula: 'expert',
        reasons: [{ kind: 'gardens', have: 5, limit: 3 }],
      })
    );
    renderPage();

    const screenOfChoice = await dialog();
    fireEvent.click(await within(screenOfChoice).findByRole('button', { name: 'Choose Expert' }, PATIENCE));

    const said = await within(screenOfChoice).findByText('Can’t switch to Expert: 5 gardens for 3 at most', {}, PATIENCE);
    expect(said).toHaveAttribute('role', 'status');
    expect(screen.getByRole('dialog', { name: 'Choose your formula' })).toBeInTheDocument();
    expect(within(screenOfChoice).queryByRole('button', { name: 'Close without changing formula' })).toBeNull();
  });
});
