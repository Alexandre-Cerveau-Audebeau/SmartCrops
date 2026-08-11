import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
import { useLanguage } from '../hooks/useLanguage';
import type { GardenListItem } from '../types/Garden';
import type { Plant } from '../types/Plant';

vi.mock('../services/gardenApi', () => ({
  fetchGardens: vi.fn(),
  createGarden: vi.fn(),
  updateGarden: vi.fn(),
  deleteGarden: vi.fn(),
}));

import MyGardens from './MyGardens';
import { fetchGardens } from '../services/gardenApi';

// SMA-6 locks: the card counter counts DISTINCT PLACED plants (the DTO's
// `plants` array), and preview names go through the shared Library resolver
// (localized common name, scientific fallback).

const ivy = {
  id: 'p1',
  scientificName: 'Hedera helix',
  commonName: 'english ivy',
} as Plant;
const fern = {
  id: 'p2',
  scientificName: 'Athyrium vidalii',
  commonName: null,
} as Plant;

const gardenWith = (plants: Plant[]): GardenListItem => ({
  id: 'g1',
  name: 'Casa Lolo',
  description: null,
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
  plants,
});

afterEach(() => vi.clearAllMocks());

function renderPage() {
  return render(
    <LanguageProvider>
      <MemoryRouter>
        <MyGardens />
      </MemoryRouter>
    </LanguageProvider>
  );
}

describe('MyGardens cards (SMA-6 / SMA-155)', () => {
  beforeEach(() => {
    // English-mechanics tests pin a returning EN visitor via the STORED key —
    // since SMA-393 the no-key default is French (LanguageProvider re-applies
    // the stored language on mount).
    localStorage.setItem('smartcrops-language', 'en');
  });

  it('shows the distinct-placed-plants count and resolver-based preview names', async () => {
    vi.mocked(fetchGardens).mockResolvedValue([gardenWith([ivy, fern])]);

    renderPage();

    expect(await screen.findByText('2 plants')).toBeInTheDocument();
    // Preview = localized common name (sentence-cased) + scientific fallback.
    expect(
      screen.getByText('English ivy, Athyrium vidalii')
    ).toBeInTheDocument();
  });

  it('shows 0 plants and no preview line for a garden with no placements', async () => {
    vi.mocked(fetchGardens).mockResolvedValue([gardenWith([])]);

    renderPage();

    expect(await screen.findByText('0 plants')).toBeInTheDocument();
    expect(screen.queryByText(/,/)).toBeNull();
  });

  it('passes the UI language to the gardens fetch (server-localized names)', async () => {
    vi.mocked(fetchGardens).mockResolvedValue([]);

    renderPage();

    await waitFor(() => expect(fetchGardens).toHaveBeenCalled());
    const [, lang] = vi.mocked(fetchGardens).mock.calls[0]!;
    expect(lang).toBe('en');
  });

  it('a first visit with no stored choice fetches gardens in French (SMA-393)', async () => {
    localStorage.removeItem('smartcrops-language');
    vi.mocked(fetchGardens).mockResolvedValue([]);

    renderPage();

    await waitFor(() => expect(fetchGardens).toHaveBeenCalled());
    const [, lang] = vi.mocked(fetchGardens).mock.calls[0]!;
    expect(lang).toBe('fr');
  });

  it('opens a garden card straight into the planner (SMA-285 pin — no detail page)', async () => {
    vi.mocked(fetchGardens).mockResolvedValue([gardenWith([])]);

    renderPage();
    await screen.findByText('Casa Lolo');

    const link = screen.getByRole('link', { name: /Casa Lolo/ });
    expect(link).toHaveAttribute('href', '/gardens/g1/planner');
  });

  it('discards a stale gardens response that resolves after a newer one (SMA-288)', async () => {
    // Minimal consumer to flip the locale mid-test — flipping re-runs the
    // gardens effect, giving two overlapping in-flight loads.
    function SwitchToFrench() {
      const { setLanguage } = useLanguage();
      return (
        <button type="button" onClick={() => setLanguage('fr')}>
          switch-to-fr
        </button>
      );
    }
    const deferred: Array<(gardens: GardenListItem[]) => void> = [];
    vi.mocked(fetchGardens).mockImplementation(
      () =>
        new Promise<GardenListItem[]>((resolve) => {
          deferred.push(resolve);
        })
    );

    render(
      <LanguageProvider>
        <SwitchToFrench />
        <MemoryRouter>
          <MyGardens />
        </MemoryRouter>
      </LanguageProvider>
    );

    // Load #1 (EN) is in flight; the switch starts load #2 (FR).
    await waitFor(() => expect(deferred.length).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: 'switch-to-fr' }));
    await waitFor(() => expect(deferred.length).toBe(2));

    // Newest response lands first...
    deferred[1]!([{ ...gardenWith([]), id: 'g2', name: 'Jardin frais' }]);
    expect(await screen.findByText('Jardin frais')).toBeInTheDocument();

    // ...then the STALE first response resolves last: it must be discarded,
    // never overwriting the newer cards.
    deferred[0]!([{ ...gardenWith([]), id: 'g1', name: 'Vieux jardin' }]);
    await waitFor(() =>
      expect(screen.queryByText('Vieux jardin')).toBeNull()
    );
    expect(screen.getByText('Jardin frais')).toBeInTheDocument();
  });
});
