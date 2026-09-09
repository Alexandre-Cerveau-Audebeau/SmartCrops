import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import { presetFor } from '../constants/dashboardPresets';
import {
  DASHBOARD_BLOCK_KEYS,
  type DashboardBlock,
  type DashboardLevel,
} from '../types/Dashboard';
import type { GardenListItem } from '../types/Garden';

vi.mock('../services/gardenApi', () => ({
  fetchGardens: vi.fn(),
  createGarden: vi.fn(),
  updateGarden: vi.fn(),
  deleteGarden: vi.fn(),
}));

vi.mock('../services/dashboardApi', () => ({
  fetchDashboardPreferences: vi.fn(),
  saveDashboardPreferences: vi.fn(),
}));

import GardensDashboard from './GardensDashboard';
import { fetchGardens } from '../services/gardenApi';
import {
  fetchDashboardPreferences,
  saveDashboardPreferences,
} from '../services/dashboardApi';

const garden = (id: string, name: string): GardenListItem => ({
  id,
  name,
  description: null,
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
  plants: [],
});

function servePreferences(
  level: DashboardLevel,
  blocks: DashboardBlock[] = presetFor(level)
) {
  vi.mocked(fetchDashboardPreferences).mockResolvedValue({
    schemaVersion: 1,
    level,
    isPreset: blocks === undefined,
    blocks,
    updatedAt: null,
  });
}

/** The widget keys the grid currently renders, in DOM order. */
const renderedKeys = () =>
  [...document.querySelectorAll('[data-widget]')].map((node) =>
    node.getAttribute('data-widget')
  );

function renderPage() {
  return render(
    <LanguageProvider>
      <MemoryRouter>
        <GardensDashboard />
      </MemoryRouter>
    </LanguageProvider>
  );
}

beforeEach(() => {
  localStorage.setItem('smartcrops-language', 'en');
  vi.mocked(fetchGardens).mockResolvedValue([garden('g1', 'Casa Lolo')]);
  vi.mocked(saveDashboardPreferences).mockResolvedValue(undefined);
  servePreferences('gardener');
});

afterEach(() => vi.clearAllMocks());

describe('GardensDashboard — grid from the stored preferences (SMA-336)', () => {
  it('renders the eight widgets of the Expert preset, in the canonical order', async () => {
    servePreferences('expert');

    renderPage();

    await waitFor(() => expect(renderedKeys()).toHaveLength(8));
    expect(renderedKeys()).toEqual([...DASHBOARD_BLOCK_KEYS]);
  });

  it('leaves the level’s hidden widgets out of the grid', async () => {
    servePreferences('gardener');

    renderPage();

    await waitFor(() => expect(renderedKeys()).toHaveLength(6));
    expect(renderedKeys()).toEqual([
      'weather',
      'gardens',
      'tips',
      'month',
      'todo',
      'counters',
    ]);
    expect(screen.queryByText('Statistics')).toBeNull();
    expect(screen.queryByText('Harvest')).toBeNull();
  });

  it('applies the STORED order, not the preset order', async () => {
    const blocks = presetFor('gardener');
    const [weather, gardens] = [blocks[0]!, blocks[1]!];
    blocks[0] = gardens;
    blocks[1] = weather;
    servePreferences('gardener', blocks);

    renderPage();

    await waitFor(() => expect(renderedKeys()).toHaveLength(6));
    expect(renderedKeys().slice(0, 2)).toEqual(['gardens', 'weather']);
  });

  it('renders the Gardens widget at the stored SIZE — Medium is the compact list', async () => {
    servePreferences('novice');

    renderPage();

    // Novice puts Gardens in Medium: one-line rows and the create link, not
    // the Large card list with its per-card Edit / Delete controls.
    await screen.findByRole('link', { name: 'Open Casa Lolo' });
    expect(screen.queryByRole('button', { name: 'Delete Casa Lolo' })).toBeNull();
  });

  it('renders the Gardens widget at Large as the full card list', async () => {
    servePreferences('gardener');

    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Delete Casa Lolo' })
    ).toBeInTheDocument();
  });
});

describe('GardensDashboard — header (SMA-336)', () => {
  it('shows the page title, the garden count and the level chip', async () => {
    renderPage();

    const heading = await screen.findByRole('heading', { name: 'My Gardens' });
    // Scoped to the header: the Gardens widget's own chip carries the same
    // count, and both saying "1 garden" is the point, not an ambiguity.
    await waitFor(() =>
      expect(
        within(heading.parentElement!).getByText('1 garden')
      ).toBeInTheDocument()
    );
    expect(await screen.findByText('Gardener view')).toBeInTheDocument();
  });

  it('marks the chip « adjusted » when the layout diverges from its preset', async () => {
    const blocks = presetFor('gardener');
    blocks[0]!.size = 'large';
    servePreferences('gardener', blocks);

    renderPage();

    expect(
      await screen.findByText('Gardener view · adjusted')
    ).toBeInTheDocument();
  });

  it('offers Edit, Customize and Create Garden outside the Edit mode', async () => {
    renderPage();

    expect(await screen.findByRole('button', { name: 'Edit' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Customize' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Create Garden' })).toBeEnabled();
  });
});

describe('GardensDashboard — page states (SMA-336)', () => {
  it('shows a skeleton grid while the preferences load, then the widgets', async () => {
    let resolve!: (value: unknown) => void;
    vi.mocked(fetchDashboardPreferences).mockReturnValue(
      new Promise((r) => {
        resolve = r as (value: unknown) => void;
      }) as ReturnType<typeof fetchDashboardPreferences>
    );

    const { container } = renderPage();

    expect(container.querySelectorAll('.MuiSkeleton-root').length).toBeGreaterThan(0);
    expect(renderedKeys()).toHaveLength(0);

    resolve({
      schemaVersion: 1,
      level: 'gardener',
      isPreset: true,
      blocks: presetFor('gardener'),
      updatedAt: null,
    });

    await waitFor(() => expect(renderedKeys()).toHaveLength(6));
  });

  it('never shows a blank page: a failed load offers a retry that reloads', async () => {
    vi.mocked(fetchDashboardPreferences)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({
        schemaVersion: 1,
        level: 'gardener',
        isPreset: true,
        blocks: presetFor('gardener'),
        updatedAt: null,
      });

    renderPage();

    expect(
      await screen.findByText('Couldn’t load your dashboard.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(renderedKeys()).toHaveLength(6));
    expect(fetchDashboardPreferences).toHaveBeenCalledTimes(2);
  });

  it('disables Edit and Customize while the layout is unavailable', async () => {
    vi.mocked(fetchDashboardPreferences).mockRejectedValue(new Error('boom'));

    renderPage();

    await screen.findByText('Couldn’t load your dashboard.');
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Customize' })).toBeDisabled();
  });
});

describe('GardensDashboard — the seven widget shells (SMA-336)', () => {
  const INVITATIONS_EN: Array<[string, string]> = [
    ['Weather', 'The weather needs to know where your gardens are.'],
    ['Tips', 'Tips arrive with the exposure and the calendar of your gardens.'],
    [
      'This month',
      'The month’s calendar arrives with the sowings and harvests of your plantings.',
    ],
    ['To do today', 'Today’s tasks arrive with the weather and the calendar.'],
    [
      'Counts by variety',
      'Your varieties will be counted here, garden by garden.',
    ],
    [
      'Statistics',
      'The occupancy and exposure of your gardens will be summed up here.',
    ],
    [
      'Harvest',
      'Your plants have no growth stage yet — the estimate can’t count them.',
    ],
  ];

  it.each(INVITATIONS_EN)(
    'the %s widget states honestly that its data is not here yet',
    async (title, sentence) => {
      servePreferences('expert');

      renderPage();

      expect(await screen.findByText(title)).toBeInTheDocument();
      expect(screen.getByText(sentence)).toBeInTheDocument();
    }
  );

  it('every invitation carries the « Coming soon » mention', async () => {
    servePreferences('expert');

    renderPage();

    await waitFor(() => expect(renderedKeys()).toHaveLength(8));
    // Seven shells; the Gardens widget carries data instead.
    expect(screen.getAllByText('Coming soon')).toHaveLength(7);
  });

  it('the Weather widget offers NO city field in this lot (decision R4)', async () => {
    servePreferences('expert');

    renderPage();

    await screen.findByText('The weather needs to know where your gardens are.');
    expect(screen.queryByLabelText(/City or postal code/i)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Use' })).toBeNull();
  });

  it('renders the invitations in French too', async () => {
    localStorage.setItem('smartcrops-language', 'fr');
    servePreferences('expert');

    renderPage();

    expect(
      await screen.findByText(
        'La météo a besoin de savoir où se trouvent vos jardins.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Les conseils arrivent avec l’exposition et le calendrier de vos jardins.'
      )
    ).toBeInTheDocument();
    expect(screen.getAllByText('Bientôt disponible')).toHaveLength(7);
  });
});

describe('GardensDashboard — Customize panel (SMA-336)', () => {
  const openPanel = async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Customize' }));
    return await screen.findByRole('heading', { name: 'Customize' });
  };

  it('offers the three levels with their taglines', async () => {
    await openPanel();

    expect(screen.getByRole('radio', { name: /Novice/ })).toBeInTheDocument();
    expect(screen.getByText('the essentials, nothing more')).toBeInTheDocument();
    expect(screen.getByText('weather, tasks and counts')).toBeInTheDocument();
    expect(screen.getByText('Everything, in large')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Gardener/ })).toBeChecked();
  });

  it('choosing a level applies its preset and persists it', async () => {
    await openPanel();

    fireEvent.click(screen.getByRole('radio', { name: /Expert/ }));

    await waitFor(() => expect(renderedKeys()).toHaveLength(8));
    expect(await screen.findByText('Expert view')).toBeInTheDocument();
    await waitFor(() =>
      expect(saveDashboardPreferences).toHaveBeenCalledWith({
        level: 'expert',
        blocks: presetFor('expert'),
      })
    );
  });

  it('the reset names the current level and restores its preset', async () => {
    const blocks = presetFor('gardener');
    blocks[2]!.hidden = true;
    servePreferences('gardener', blocks);

    await openPanel();
    expect(
      await screen.findByText('Gardener view · adjusted')
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Reset to the Gardener level' })
    );

    await waitFor(() => expect(renderedKeys()).toHaveLength(6));
    expect(await screen.findByText('Gardener view')).toBeInTheDocument();
  });

  it('the gallery lists the hidden widgets and « + » puts one back on the page', async () => {
    const panel = await openPanel();
    const gallery = panel.closest('div')!.parentElement!;

    expect(within(gallery).getByText('Statistics')).toBeInTheDocument();
    expect(within(gallery).getByText('Harvest')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add Statistics' }));

    await waitFor(() => expect(renderedKeys()).toContain('stats'));
    expect(renderedKeys()).not.toContain('harvest');
  });

  it('says so when nothing is hidden', async () => {
    servePreferences('expert');

    await openPanel();

    expect(screen.getByText('No hidden widget.')).toBeInTheDocument();
  });

  it('mentions no price, no quota and no plan anywhere on the page', async () => {
    localStorage.setItem('smartcrops-language', 'fr');
    servePreferences('expert');

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Personnaliser' }));
    await screen.findByRole('heading', { name: 'Personnaliser' });

    expect(document.body.textContent).not.toMatch(
      /tarif|abonnement|limite|premium|€/i
    );
  });
});
