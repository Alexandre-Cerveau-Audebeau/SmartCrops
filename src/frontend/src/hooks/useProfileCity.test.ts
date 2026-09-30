import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProfileCity } from './useProfileCity';
import { fetchProfile, type UserProfile } from '../services/profileApi';
import { deferred } from '../test/responses';

vi.mock('../services/profileApi', () => ({ fetchProfile: vi.fn() }));

const profile = (city: string | null): UserProfile => ({
  email: 'a@example.test',
  displayName: null,
  firstName: null,
  lastName: null,
  city,
  hasPassword: true,
});

beforeEach(() => {
  vi.mocked(fetchProfile).mockReset();
});

describe('useProfileCity (SMA-336 PR 3b/5, Q2)', () => {
  it('does NOT read the profile while disabled — the fetch is lazy', () => {
    const { result } = renderHook(() => useProfileCity(false));

    expect(result.current).toBeNull();
    expect(fetchProfile).not.toHaveBeenCalled();
  });

  it('reads the profile once when enabled and answers the trimmed city', async () => {
    vi.mocked(fetchProfile).mockResolvedValue(profile('  Lyon  '));

    const { result, rerender } = renderHook(() => useProfileCity(true));

    await waitFor(() => expect(result.current).toBe('Lyon'));
    rerender();
    expect(fetchProfile).toHaveBeenCalledTimes(1);
  });

  it('answers null for a blank city, so the link is not drawn', async () => {
    // The profile HELD, then landed inside `act` (SMA-452 § 12): null is also
    // the hook's first answer, so a read before the landing proves nothing.
    const read = deferred<UserProfile>();
    vi.mocked(fetchProfile).mockReturnValue(read.promise);

    const { result } = renderHook(() => useProfileCity(true));

    await waitFor(() => expect(fetchProfile).toHaveBeenCalled());
    await act(async () => read.resolve(profile('   ')));
    expect(result.current).toBeNull();
  });

  it('answers null when the read fails, without throwing', async () => {
    // Held, then failed inside `act` — for the same reason as above.
    const read = deferred<UserProfile>();
    vi.mocked(fetchProfile).mockReturnValue(read.promise);

    const { result } = renderHook(() => useProfileCity(true));

    await waitFor(() => expect(fetchProfile).toHaveBeenCalled());
    await act(async () => read.reject(new Error('boom')));
    expect(result.current).toBeNull();
  });

  it('starts reading when it becomes enabled', async () => {
    vi.mocked(fetchProfile).mockResolvedValue(profile('Annecy'));
    const { result, rerender } = renderHook(({ enabled }) => useProfileCity(enabled), {
      initialProps: { enabled: false },
    });
    expect(fetchProfile).not.toHaveBeenCalled();

    rerender({ enabled: true });

    await waitFor(() => expect(result.current).toBe('Annecy'));
  });
});
