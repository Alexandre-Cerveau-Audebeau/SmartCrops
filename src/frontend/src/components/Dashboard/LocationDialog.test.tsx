import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../i18n/i18n';
import { LanguageProvider } from '../../contexts/LanguageContext';
import { HttpStatusError } from '../../services/httpStatusError';
import {
  clearGardenLocation,
  saveGardenLocation,
  saveProfileLocation,
  searchLocations,
} from '../../services/weatherApi';
import { pickFixture } from '../../test/fixtures/weather';
import LocationDialog from './LocationDialog';
import { LOCATION_SEARCH_DEBOUNCE_MS, type LocationTarget } from './locationTools';

vi.mock('../../services/weatherApi', () => ({
  searchLocations: vi.fn(),
  saveGardenLocation: vi.fn(),
  clearGardenLocation: vi.fn(),
  saveProfileLocation: vi.fn(),
  clearProfileLocation: vi.fn(),
}));

// SMA-336 PR 3b/5 — the shared location dialog (§ F.4): its title per target,
// its states — searching, no result, search unavailable, saving, inline error
// with the dialog kept OPEN — and the re-fetch it asks for after a 204.

const PROFILE: LocationTarget = { kind: 'profile' };
const GARDEN: LocationTarget = {
  kind: 'garden',
  gardenId: 'g2',
  gardenName: 'Balcon sud',
  canRevert: false,
};

function renderDialog(target: LocationTarget, over: { onClose?: () => void; onSaved?: () => void } = {}) {
  localStorage.setItem('smartcrops-language', 'en');
  const onClose = over.onClose ?? vi.fn();
  const onSaved = over.onSaved ?? vi.fn();
  render(
    <LanguageProvider>
      <LocationDialog open target={target} onClose={onClose} onSaved={onSaved} />
    </LanguageProvider>
  );
  return { onClose, onSaved };
}

const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

/** Focus then change — MUI resets a controlled input text changed while unfocused. */
function type(value: string) {
  const input = screen.getByLabelText('City or postal code');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
}

/** Types « Lyon », lets the search answer the fixture, picks the first result. */
async function pickLyon() {
  vi.mocked(searchLocations).mockResolvedValue([pickFixture()]);
  type('Lyon');
  act(() => vi.advanceTimersByTime(LOCATION_SEARCH_DEBOUNCE_MS));
  await flush();
  fireEvent.click(screen.getByRole('option', { name: 'Lyon, Auvergne-Rhône-Alpes, France' }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(searchLocations).mockReset();
  vi.mocked(saveGardenLocation).mockReset();
  vi.mocked(saveProfileLocation).mockReset();
  vi.mocked(clearGardenLocation).mockReset();
  vi.mocked(saveGardenLocation).mockResolvedValue(undefined);
  vi.mocked(saveProfileLocation).mockResolvedValue(undefined);
  vi.mocked(clearGardenLocation).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('LocationDialog — titles and controls', () => {
  it('is « Locate my gardens » for the profile default, with Cancel and a disabled Use', () => {
    renderDialog(PROFILE);

    expect(screen.getByRole('dialog', { name: 'Locate my gardens' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Use' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Back to the profile city' })).toBeNull();
  });

  it('is « Locate <garden> » for a garden', () => {
    renderDialog(GARDEN);

    expect(screen.getByRole('dialog', { name: 'Locate Balcon sud' })).toBeInTheDocument();
  });

  it('offers « Back to the profile city » only for a garden that can revert', () => {
    renderDialog({ ...GARDEN, canRevert: true });

    expect(screen.getByRole('button', { name: 'Back to the profile city' })).toBeInTheDocument();
  });

  it('Cancel closes and reports it', () => {
    const { onClose } = renderDialog(PROFILE);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('LocationDialog — searching and picking', () => {
  it('previews the picked place and enables Use', async () => {
    renderDialog(PROFILE);

    await pickLyon();

    expect(screen.getByText('Selected place: Lyon, Auvergne-Rhône-Alpes, France')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use' })).toBeEnabled();
  });

  it('says so when nothing matches, and when the search is unavailable', async () => {
    vi.mocked(searchLocations).mockResolvedValueOnce([]);
    renderDialog(PROFILE);

    type('xyz');
    act(() => vi.advanceTimersByTime(LOCATION_SEARCH_DEBOUNCE_MS));
    await flush();
    expect(screen.getByText('No place found for “xyz”')).toBeInTheDocument();

    vi.mocked(searchLocations).mockRejectedValueOnce(new HttpStatusError('Request failed (503)', 503));
    type('Lyon');
    act(() => vi.advanceTimersByTime(LOCATION_SEARCH_DEBOUNCE_MS));
    await flush();
    expect(screen.getByText('Search temporarily unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use' })).toBeDisabled();
  });
});

describe('LocationDialog — writing', () => {
  it('Use writes the PROFILE default with the pick as is, then asks for a re-fetch', async () => {
    const { onSaved, onClose } = renderDialog(PROFILE);
    await pickLyon();

    fireEvent.click(screen.getByRole('button', { name: 'Use' }));
    await flush();

    expect(saveProfileLocation).toHaveBeenCalledWith(pickFixture());
    expect(saveGardenLocation).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Use writes a GARDEN override on a garden target', async () => {
    const { onSaved } = renderDialog(GARDEN);
    await pickLyon();

    fireEvent.click(screen.getByRole('button', { name: 'Use' }));
    await flush();

    expect(saveGardenLocation).toHaveBeenCalledWith('g2', pickFixture());
    expect(saveProfileLocation).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('« Back to the profile city » clears the garden override and asks for a re-fetch', async () => {
    const { onSaved } = renderDialog({ ...GARDEN, canRevert: true });

    fireEvent.click(screen.getByRole('button', { name: 'Back to the profile city' }));
    await flush();

    expect(clearGardenLocation).toHaveBeenCalledWith('g2');
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('keeps the dialog OPEN with an inline error and the pick intact when the write fails', async () => {
    vi.mocked(saveProfileLocation).mockRejectedValue(new HttpStatusError('Request failed (400)', 400));
    const { onSaved, onClose } = renderDialog(PROFILE);
    await pickLyon();

    fireEvent.click(screen.getByRole('button', { name: 'Use' }));
    await flush();

    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t save this place. Try again.');
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Selected place: Lyon, Auvergne-Rhône-Alpes, France')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use' })).toBeEnabled();
  });

  it('disables every exit while the write is in flight, and announces it', async () => {
    let release!: () => void;
    vi.mocked(saveProfileLocation).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    const { onClose } = renderDialog(PROFILE);
    await pickLyon();

    fireEvent.click(screen.getByRole('button', { name: 'Use' }));
    await flush();

    expect(screen.getByRole('status')).toHaveTextContent('Saving…');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Use' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      release();
    });
    expect(screen.getByRole('status')).toHaveTextContent('');
  });
});
