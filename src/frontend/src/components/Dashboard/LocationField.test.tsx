import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../i18n/i18n';
import { LanguageProvider } from '../../contexts/LanguageContext';
import { HttpStatusError } from '../../services/httpStatusError';
import { searchLocations } from '../../services/weatherApi';
import { pickFixture } from '../../test/fixtures/weather';
import type { LocationPick } from '../../types/DashboardWeather';
import LocationField from './LocationField';
import { LOCATION_QUERY_MIN_LENGTH, LOCATION_SEARCH_DEBOUNCE_MS } from './locationTools';

vi.mock('../../services/weatherApi', () => ({ searchLocations: vi.fn() }));

// SMA-336 PR 3b/5 — the « Ville ou code postal » field (Q4): no request under
// three characters, one request 400 ms after the last keystroke, one request
// in flight, and never a real provider call — `searchLocations` is a mock.

/** The field with the state its callers hold. */
function Harness({ onChange }: { onChange?: (pick: LocationPick | null) => void }) {
  const [pick, setPick] = useState<LocationPick | null>(null);
  const [text, setText] = useState('');
  return (
    <LocationField
      value={pick}
      onChange={(next) => {
        setPick(next);
        onChange?.(next);
      }}
      inputValue={text}
      onInputChange={setText}
    />
  );
}

function renderField(onChange?: (pick: LocationPick | null) => void) {
  localStorage.setItem('smartcrops-language', 'en');
  render(
    <LanguageProvider>
      <Harness onChange={onChange} />
    </LanguageProvider>
  );
  return screen.getByLabelText('City or postal code') as HTMLInputElement;
}

/**
 * A keystroke: FOCUS then change, as a user does. MUI's Autocomplete resets a
 * controlled `inputValue` that changes while its input is not focused (its
 * `resetInputValue` effect), so a bare `change` on an unfocused input reads
 * back as an empty field — which is also why `WeatherInvite` focuses before
 * it pre-fills.
 */
const type = (input: HTMLInputElement, value: string) => {
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
};

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

/** Lets the promise chain of a settled search reach React. */
const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

/** A search the test releases by hand, with the signal it was given. */
function deferredSearch() {
  const calls: Array<{
    resolve: (picks: LocationPick[]) => void;
    reject: (error: unknown) => void;
    signal: AbortSignal | undefined;
  }> = [];
  vi.mocked(searchLocations).mockImplementation(
    (_query, signal) =>
      new Promise<LocationPick[]>((resolve, reject) => {
        calls.push({ resolve, reject, signal });
      })
  );
  return calls;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(searchLocations).mockReset();
  vi.mocked(searchLocations).mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('LocationField — when it asks the server', () => {
  it('never asks under three characters, however long the user waits', () => {
    const input = renderField();

    type(input, 'Ly');
    advance(LOCATION_SEARCH_DEBOUNCE_MS * 5);

    expect(searchLocations).not.toHaveBeenCalled();
    expect(LOCATION_QUERY_MIN_LENGTH).toBe(3);
  });

  it('asks once, 400 ms after the last keystroke, not before', () => {
    const input = renderField();

    type(input, 'Lyo');
    advance(LOCATION_SEARCH_DEBOUNCE_MS - 1);
    expect(searchLocations).not.toHaveBeenCalled();

    advance(1);
    expect(searchLocations).toHaveBeenCalledTimes(1);
    expect(vi.mocked(searchLocations).mock.calls[0]![0]).toBe('Lyo');
    expect(vi.mocked(searchLocations).mock.calls[0]![1]).toBeInstanceOf(AbortSignal);
  });

  it('coalesces keystrokes inside the window into ONE request for the last text', () => {
    const input = renderField();

    type(input, 'Lyo');
    advance(200);
    type(input, 'Lyon');
    advance(200);
    expect(searchLocations).not.toHaveBeenCalled();

    advance(200);
    expect(searchLocations).toHaveBeenCalledTimes(1);
    expect(vi.mocked(searchLocations).mock.calls[0]![0]).toBe('Lyon');
  });

  it('aborts the request in flight when the next keystroke starts another', () => {
    const calls = deferredSearch();
    const input = renderField();

    type(input, 'Lyo');
    advance(LOCATION_SEARCH_DEBOUNCE_MS);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.signal?.aborted).toBe(false);

    type(input, 'Lyon');
    expect(calls[0]!.signal?.aborted).toBe(true);

    advance(LOCATION_SEARCH_DEBOUNCE_MS);
    expect(calls).toHaveLength(2);
    expect(vi.mocked(searchLocations).mock.calls[1]![0]).toBe('Lyon');
  });

  it('trims the text, and drops back below the threshold without asking', () => {
    const input = renderField();

    type(input, '  Ly ');
    advance(LOCATION_SEARCH_DEBOUNCE_MS);
    expect(searchLocations).not.toHaveBeenCalled();

    type(input, ' Lyon ');
    advance(LOCATION_SEARCH_DEBOUNCE_MS);
    expect(vi.mocked(searchLocations).mock.calls[0]![0]).toBe('Lyon');
  });
});

describe('LocationField — what it shows', () => {
  it('lists the places the server answered, labelled « name, region, country », and picks one', async () => {
    const onChange = vi.fn();
    vi.mocked(searchLocations).mockResolvedValue([
      pickFixture(),
      pickFixture({ name: 'Lyon', region: 'Texas', country: 'United States of America', latitude: 33.1, longitude: -96.4 }),
    ]);
    const input = renderField(onChange);

    type(input, 'Lyon');
    advance(LOCATION_SEARCH_DEBOUNCE_MS);
    await flush();

    const france = screen.getByRole('option', { name: 'Lyon, Auvergne-Rhône-Alpes, France' });
    expect(screen.getByRole('option', { name: 'Lyon, Texas, United States of America' })).toBeInTheDocument();

    fireEvent.click(france);

    expect(onChange).toHaveBeenCalledWith(pickFixture());
    expect(input.value).toBe('Lyon, Auvergne-Rhône-Alpes, France');
    // The picked label is not searched for again.
    advance(LOCATION_SEARCH_DEBOUNCE_MS * 2);
    expect(searchLocations).toHaveBeenCalledTimes(1);
  });

  it('unpicks the place when the user types over its label', async () => {
    const onChange = vi.fn();
    vi.mocked(searchLocations).mockResolvedValue([pickFixture()]);
    const input = renderField(onChange);

    type(input, 'Lyon');
    advance(LOCATION_SEARCH_DEBOUNCE_MS);
    await flush();
    fireEvent.click(screen.getByRole('option', { name: 'Lyon, Auvergne-Rhône-Alpes, France' }));
    expect(onChange).toHaveBeenLastCalledWith(pickFixture());

    type(input, 'Lyon, Auvergne');

    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('says « No place found for “xyz” » on an empty answer', async () => {
    vi.mocked(searchLocations).mockResolvedValue([]);
    const input = renderField();

    type(input, 'xyz');
    advance(LOCATION_SEARCH_DEBOUNCE_MS);
    await flush();

    expect(screen.getByText('No place found for “xyz”')).toBeInTheDocument();
  });

  it('says « Search temporarily unavailable » on a 503 — never the provider’s words', async () => {
    vi.mocked(searchLocations).mockRejectedValue(new HttpStatusError('Request failed (503)', 503));
    const input = renderField();

    type(input, 'Lyon');
    advance(LOCATION_SEARCH_DEBOUNCE_MS);
    await flush();

    expect(screen.getByText('Search temporarily unavailable')).toBeInTheDocument();
    expect(screen.queryByText(/geocoding/i)).toBeNull();
  });

  it('asks for at least three characters while there are fewer', () => {
    const input = renderField();

    type(input, 'Ly');

    expect(screen.getByText('Type at least 3 characters')).toBeInTheDocument();
  });

  it('shows the searching text while the request is out', async () => {
    deferredSearch();
    const input = renderField();

    type(input, 'Lyon');
    advance(LOCATION_SEARCH_DEBOUNCE_MS);
    await flush();

    expect(screen.getByText('Searching…')).toBeInTheDocument();
  });

  it('is labelled « Ville ou code postal » in French (Q5 — the label stays the artboard’s)', () => {
    localStorage.setItem('smartcrops-language', 'fr');
    render(
      <LanguageProvider>
        <Harness />
      </LanguageProvider>
    );

    expect(screen.getByLabelText('Ville ou code postal')).toBeInTheDocument();
  });
});
