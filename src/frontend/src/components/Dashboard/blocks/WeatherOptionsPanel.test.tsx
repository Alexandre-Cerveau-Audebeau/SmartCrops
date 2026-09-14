import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '../../../i18n/i18n';
import { LanguageProvider } from '../../../contexts/LanguageContext';
import WeatherOptionsPanel from './WeatherOptionsPanel';

// SMA-336 PR 3b/5, round 1 (V21 a) — the Weather widget's gear entry: the
// current default place, and « Localisation… » that opens the shared dialog.

type PanelProps = Parameters<typeof WeatherOptionsPanel>[0];

function renderPanel(over: Partial<PanelProps> = {}) {
  const props: PanelProps = {
    current: null,
    located: false,
    loading: false,
    unavailable: false,
    onLocate: vi.fn(),
    ...over,
  };
  render(
    <LanguageProvider>
      <WeatherOptionsPanel {...props} />
    </LanguageProvider>
  );
  return props.onLocate;
}

describe('WeatherOptionsPanel', () => {
  it('names the current default place and opens the dialog from « Localisation… »', () => {
    const onLocate = renderPanel({ current: 'Ecully', located: true });

    expect(screen.getByText('Ville par défaut de vos jardins')).toBeInTheDocument();
    expect(screen.getByText('Lieu actuel : Ecully')).toBeInTheDocument();

    const door = screen.getByRole('button', { name: 'Localisation…' });
    door.focus();
    expect(document.activeElement).toBe(door);
    fireEvent.click(door);

    expect(onLocate).toHaveBeenCalledTimes(1);
  });

  it('says that no place is saved when the aggregate holds none', () => {
    renderPanel();

    expect(screen.getByText('Aucun lieu enregistré pour le moment.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Localisation…' })).toBeEnabled();
  });

  it('a stored default the aggregate cannot name — every garden overrides it — is still said to exist (round 2, D5)', () => {
    // Extension cdfbd4df / GitHub 4009200274: `current` alone merged « nothing
    // stored » and « stored but unnamed », and the panel printed « Aucun lieu
    // enregistré » over an existing default. Same third line as the dialog.
    renderPanel({ located: true });

    expect(screen.getByText('Un lieu par défaut est enregistré pour vos jardins.')).toBeInTheDocument();
    expect(screen.queryByText('Aucun lieu enregistré pour le moment.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Localisation…' })).toBeEnabled();
  });

  it('says the place is loading while the aggregate is in flight, and keeps the door open (round 2, D4)', () => {
    // Extension 7d3f6056 / 458cd620: the gear was reachable before the aggregate
    // landed and the panel printed « Aucun lieu enregistré » over a place it did
    // not know yet. The door stays open: the dialog says the same and fills in.
    renderPanel({ loading: true });

    expect(screen.getByText('Chargement du lieu actuel…')).toBeInTheDocument();
    expect(screen.queryByText('Aucun lieu enregistré pour le moment.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Localisation…' })).toBeEnabled();
  });

  it('says the weather is unavailable — never « no place saved » — when the aggregate could not be read (round 3, E2 a)', () => {
    // GitHub 4009816076: a failed weather request left `current` null and
    // `located` false, and the panel printed the sentence of an account WITHOUT
    // a default over a place it simply could not read. The door stays open.
    renderPanel({ unavailable: true });

    expect(screen.getByText('Météo indisponible — le lieu enregistré n’a pas pu être lu.')).toBeInTheDocument();
    expect(screen.queryByText('Aucun lieu enregistré pour le moment.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Localisation…' })).toBeEnabled();
  });

  it('a place the last known aggregate names stays named when a refresh fails (round 3, E2 b)', () => {
    renderPanel({ current: 'Ecully', located: true, unavailable: true });

    expect(screen.getByText('Lieu actuel : Ecully')).toBeInTheDocument();
    expect(screen.queryByText('Aucun lieu enregistré pour le moment.')).toBeNull();
  });
});
