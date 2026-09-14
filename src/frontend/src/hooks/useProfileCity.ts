import { useEffect, useState } from 'react';
import { fetchProfile } from '../services/profileApi';

/**
 * SMA-336 PR 3b/5 — the free-text `City` of the caller's profile, read LAZILY
 * for the « Utiliser la ville de mon profil » link of the weather invitation
 * (pre-flight § F.4, arbitrage Q2).
 *
 * The link only PRE-FILLS the search field with that text — zero coupling with
 * `PUT /api/auth/profile`, no geocoding until the user picks a result and
 * clicks « Utiliser ». So the profile is fetched once, when an invitation that
 * shows the link is rendered (`enabled`), and never before; a blank city or a
 * failed read hides the link rather than drawing a dead one.
 */
export function useProfileCity(enabled: boolean): string | null {
  const [city, setCity] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchProfile()
      .then((profile) => {
        if (cancelled) return;
        const trimmed = profile.city?.trim() ?? '';
        setCity(trimmed.length > 0 ? trimmed : null);
      })
      .catch(() => {
        if (!cancelled) setCity(null);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return enabled ? city : null;
}
