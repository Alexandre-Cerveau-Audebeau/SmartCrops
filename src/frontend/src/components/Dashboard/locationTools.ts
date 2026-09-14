import {
  clearGardenLocation,
  saveGardenLocation,
  saveProfileLocation,
} from '../../services/weatherApi';
import type { LocationPick } from '../../types/DashboardWeather';

/**
 * SMA-336 PR 3b/5 — what the location gestures of the dashboard share: the
 * TARGET a dialog or an inline invitation writes to, the label of a pick, and
 * the two writes. A module of its own so the component files export components
 * only (react-refresh/only-export-components).
 */

/** Which stored location a gesture writes — the account's default, or one garden's override (ADR-0006). */
export type LocationTarget =
  | { kind: 'profile' }
  | {
      kind: 'garden';
      gardenId: string;
      gardenName: string;
      /**
       * Whether « Revenir à la ville du profil » is offered: the garden carries
       * its OWN override AND the profile has a default to fall back to. Without
       * the second half the DELETE would leave the garden unlocated, which is
       * not what the label promises.
       */
      canRevert: boolean;
    };

/** « Lyon, Auvergne-Rhône-Alpes, France » — the pick as the list and the preview print it. */
export function locationLabel(pick: LocationPick): string {
  return [pick.name, pick.region, pick.country]
    .filter((part): part is string => part !== null && part.trim().length > 0)
    .join(', ');
}

/** Two picks name the same place when they sit on the same coordinates. */
export function samePick(a: LocationPick, b: LocationPick): boolean {
  return a.latitude === b.latitude && a.longitude === b.longitude;
}

/** Writes `pick` where `target` says; resolves on the server's 204. */
export function writeLocation(target: LocationTarget, pick: LocationPick): Promise<void> {
  return target.kind === 'garden'
    ? saveGardenLocation(target.gardenId, pick)
    : saveProfileLocation(pick);
}

/** Drops a garden's override so it inherits the profile default again. */
export function revertToProfile(target: Extract<LocationTarget, { kind: 'garden' }>): Promise<void> {
  return clearGardenLocation(target.gardenId);
}

/** The « Ville ou code postal » field never asks the server under this many characters (Q4). */
export const LOCATION_QUERY_MIN_LENGTH = 3;

/** …and waits this long after the last keystroke before it does (Q4). */
export const LOCATION_SEARCH_DEBOUNCE_MS = 400;
