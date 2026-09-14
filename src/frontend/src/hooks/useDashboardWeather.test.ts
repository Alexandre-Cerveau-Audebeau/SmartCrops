import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDashboardWeather } from './useDashboardWeather';
import { fetchDashboardWeather } from '../services/weatherApi';
import { EMPTY_WEATHER_DATA, type DashboardWeatherData } from '../types/DashboardWeather';
import { linkFixture, locationFixture, weatherFixture } from '../test/fixtures/weather';

vi.mock('../services/weatherApi', () => ({ fetchDashboardWeather: vi.fn() }));

const lyon = () => weatherFixture([locationFixture()], [linkFixture()]);
const annecy = () =>
  weatherFixture(
    [locationFixture({ key: '45.90,6.13', name: 'Annecy' })],
    [linkFixture({ locationKey: '45.90,6.13' })]
  );

/** A fetch whose answer the test releases by hand. */
function deferred() {
  const resolvers: Array<{
    resolve: (data: DashboardWeatherData) => void;
    reject: (error: unknown) => void;
  }> = [];
  vi.mocked(fetchDashboardWeather).mockImplementation(
    () =>
      new Promise<DashboardWeatherData>((resolve, reject) => {
        resolvers.push({ resolve, reject });
      })
  );
  return resolvers;
}

beforeEach(() => {
  vi.mocked(fetchDashboardWeather).mockReset();
});

describe('useDashboardWeather (SMA-336 PR 3b/5)', () => {
  it('loads the aggregate for the given language and clears loading', async () => {
    vi.mocked(fetchDashboardWeather).mockResolvedValue(lyon());

    const { result } = renderHook(() => useDashboardWeather('fr'));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBe(EMPTY_WEATHER_DATA);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data.locations.map((l) => l.name)).toEqual(['Lyon']);
    expect(result.current.loadError).toBe(false);
    expect(result.current.refreshing).toBe(false);
    const [language] = vi.mocked(fetchDashboardWeather).mock.calls[0]!;
    expect(language).toBe('fr');
  });

  it('keeps the frozen empty aggregate and raises loadError on rejection', async () => {
    vi.mocked(fetchDashboardWeather).mockRejectedValue(new Error('malformed'));

    const { result } = renderHook(() => useDashboardWeather('fr'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.loadError).toBe(true);
    expect(result.current.data).toBe(EMPTY_WEATHER_DATA);
  });

  it('refetch() keeps the current weather on screen while the replacement is in flight', async () => {
    // The rule this lot names: a refresh — after a location is saved — must
    // not blink the widget back to its skeleton or empty the tabs.
    vi.mocked(fetchDashboardWeather).mockResolvedValueOnce(lyon());
    const { result } = renderHook(() => useDashboardWeather('fr'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const pending = deferred();
    act(() => result.current.refetch());
    await waitFor(() => expect(fetchDashboardWeather).toHaveBeenCalledTimes(2));

    expect(result.current.loading).toBe(false);
    expect(result.current.refreshing).toBe(true);
    expect(result.current.data.locations.map((l) => l.name)).toEqual(['Lyon']);

    await act(async () => {
      pending[0]!.resolve(annecy());
    });
    expect(result.current.data.locations.map((l) => l.name)).toEqual(['Annecy']);
    expect(result.current.refreshing).toBe(false);
  });

  it('a FAILED replacement clears the weather so the error never sits behind stale figures', async () => {
    vi.mocked(fetchDashboardWeather).mockResolvedValueOnce(lyon());
    const { result } = renderHook(() => useDashboardWeather('fr'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const pending = deferred();
    act(() => result.current.refetch());
    await waitFor(() => expect(pending.length).toBe(1));

    await act(async () => {
      pending[0]!.reject(new Error('boom'));
    });
    expect(result.current.loadError).toBe(true);
    expect(result.current.data).toBe(EMPTY_WEATHER_DATA);

    // And Retry clears the error once an answer lands.
    vi.mocked(fetchDashboardWeather).mockResolvedValueOnce(lyon());
    act(() => result.current.refetch());
    await waitFor(() => expect(result.current.loadError).toBe(false));
    expect(result.current.data.locations).toHaveLength(1);
  });

  it('re-fetches on a language switch and discards the stale response (the SMA-288 race)', async () => {
    const pending = deferred();
    const { result, rerender } = renderHook(
      ({ language }) => useDashboardWeather(language),
      { initialProps: { language: 'en' } }
    );
    await waitFor(() => expect(pending.length).toBe(1));

    rerender({ language: 'fr' });
    await waitFor(() => expect(pending.length).toBe(2));
    expect(vi.mocked(fetchDashboardWeather).mock.calls[1]![0]).toBe('fr');

    // Newest answer first...
    await act(async () => {
      pending[1]!.resolve(annecy());
    });
    expect(result.current.data.locations.map((l) => l.name)).toEqual(['Annecy']);

    // ...then the STALE first answer resolves last: discarded.
    await act(async () => {
      pending[0]!.resolve(lyon());
    });
    expect(result.current.data.locations.map((l) => l.name)).toEqual(['Annecy']);
  });

  it('ignores a superseded response that lands after refetch() but before the effect re-runs', async () => {
    // The synchronous invalidation `useGardens` earned (SMA-421 R1): the
    // request id moves in the handler itself.
    const pending = deferred();
    const { result } = renderHook(() => useDashboardWeather('fr'));
    await waitFor(() => expect(pending.length).toBe(1));

    act(() => result.current.refetch());
    // The first answer arrives now — after the click, whatever the effect did.
    await act(async () => {
      pending[0]!.resolve(lyon());
    });
    expect(result.current.data).toBe(EMPTY_WEATHER_DATA);
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(pending.length).toBe(2));
    await act(async () => {
      pending[1]!.resolve(annecy());
    });
    expect(result.current.data.locations.map((l) => l.name)).toEqual(['Annecy']);
    expect(result.current.loading).toBe(false);
  });

  it('aborts the request in flight when it unmounts', async () => {
    const pending = deferred();
    const { unmount } = renderHook(() => useDashboardWeather('fr'));
    await waitFor(() => expect(pending.length).toBe(1));
    const [, signal] = vi.mocked(fetchDashboardWeather).mock.calls[0]!;

    unmount();

    expect(signal?.aborted).toBe(true);
  });

  it('hands every request an AbortSignal', async () => {
    vi.mocked(fetchDashboardWeather).mockResolvedValue(lyon());

    renderHook(() => useDashboardWeather('fr'));

    await waitFor(() => expect(fetchDashboardWeather).toHaveBeenCalled());
    const [, signal] = vi.mocked(fetchDashboardWeather).mock.calls[0]!;
    expect(signal).toBeInstanceOf(AbortSignal);
  });
});
