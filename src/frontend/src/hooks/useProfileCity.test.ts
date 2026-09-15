import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProfileCity } from './useProfileCity';
import { fetchProfile, type UserProfile } from '../services/profileApi';

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
    vi.mocked(fetchProfile).mockResolvedValue(profile('   '));

    const { result } = renderHook(() => useProfileCity(true));

    await waitFor(() => expect(fetchProfile).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('answers null when the read fails, without throwing', async () => {
    vi.mocked(fetchProfile).mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useProfileCity(true));

    await waitFor(() => expect(fetchProfile).toHaveBeenCalled());
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
