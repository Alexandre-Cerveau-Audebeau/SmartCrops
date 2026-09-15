import {
  clearGardenLocation,
  clearProfileLocation,
  saveGardenLocation,
  saveProfileLocation,
} from '../../services/weatherApi';
import type { LocationPick } from '../../types/DashboardWeather';

/**
 * SMA-336 PR 3b/5 — what the location gestures of the dashboard share: the
 * TARGET a dialog or an inline invitation writes to, the label of a pick, and
 * the writes. A module of its own so the component files export components
 * only (react-refresh/only-export-components).
 */

/**
 * Which stored location a gesture writes — the account's default, or one
 * garden's override (ADR-0006) — and, since round 1 (V21), what it currently
 * holds, so the dialog can SHOW a stored place before offering to replace or
 * remove it: PR 3b/5 shipped three doors to ADD a location and none to change
 * or drop one.
 */
export type LocationTarget =
  | {
      kind: 'profile';
      /** The name of the place the profile default currently points at, when the aggregate can tell; null otherwise. */
      current?: string | null;
      /** Whether « Retirer » is offered — the account carries a default to remove. */
      canRemove?: boolean;
      /**
       * The aggregate that names the place is still loading (round 2, D4):
       * neither « nothing stored » nor « Retirer » can be said yet.
       */
      loading?: boolean;
      /**
       * The aggregate could not be read (round 3, E2 — GitHub 4009816076):
       * what `current` and `canRemove` hold is the LAST KNOWN state when a
       * PASSIVE refresh failed, or nothing — after a failed first load, or
       * after a failed re-read that followed a location write (round 4, F1) —
       * never a statement that nothing is stored.
       */
      unavailable?: boolean;
    }
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
      /** The name of the place the garden reads today — its override or the inherited default; null when unlocated. */
      current?: string | null;
      /** As for the profile: the aggregate is still loading (round 2, D4). */
      loading?: boolean;
      /** As for the profile: the aggregate could not be read (round 3, E2; round 4, F1). */
      unavailable?: boolean;
    };

/**
 * What a surface knows of a stored place, and the ONE sentence for it — the
 * location dialog and the Weather gear panel both read this function (round
 * 2, D4 / D5; round 3, E2), so the two cannot disagree. In order: the
 * aggregate still loading; a named place (the last known one when a PASSIVE
 * refresh failed); a place that is stored but that the aggregate cannot name
 * (every garden overrides it); the weather UNAVAILABLE with nothing known —
 * after a failed first load or a failed re-read that followed a write (round
 * 4, F1) — never read as « nothing stored »; and, only when an aggregate was
 * read and holds no default, nothing stored.
 */
export interface StoredPlace {
  /** The aggregate that would name the place has not landed yet. */
  loading: boolean;
  /** The aggregate could not be read; `name` and `stored` are the last known state — after a passive refresh — or nothing. */
  unavailable: boolean;
  /** The place's name, when the aggregate can tell. */
  name: string | null;
  /** Whether a place IS stored, named or not. */
  stored: boolean;
}

export type StoredPlaceKey =
  | 'dashboard.location.loading'
  | 'dashboard.location.current'
  | 'dashboard.location.currentUnknown'
  | 'dashboard.location.weatherUnavailable'
  | 'dashboard.location.currentNone';

export function storedPlaceKey(place: StoredPlace): StoredPlaceKey {
  if (place.loading) return 'dashboard.location.loading';
  if (place.name) return 'dashboard.location.current';
  if (place.stored) return 'dashboard.location.currentUnknown';
  return place.unavailable ? 'dashboard.location.weatherUnavailable' : 'dashboard.location.currentNone';
}

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

/** Drops the account's default (round 1, V21 — « Retirer »): every garden without an override becomes unlocated. */
export function removeProfileLocation(): Promise<void> {
  return clearProfileLocation();
}

/** The « Ville » field never asks the server under this many characters (Q4). */
export const LOCATION_QUERY_MIN_LENGTH = 3;

/** …and waits this long after the last keystroke before it does (Q4). */
export const LOCATION_SEARCH_DEBOUNCE_MS = 400;
