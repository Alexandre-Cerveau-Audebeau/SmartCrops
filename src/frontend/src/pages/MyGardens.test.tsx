import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../i18n/i18n';
import { LanguageProvider } from '../contexts/LanguageContext';
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
});
