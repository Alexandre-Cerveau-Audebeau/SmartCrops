// SMA-354 lot 2 — module-level document-title override store. PlantDetail
// publishes the loaded display name here (and clears it on unmount) so
// DocumentHead can compose "<PlantName> · SmartCrops" without threading props
// through the tree. Lives outside DocumentHead.tsx so that component file
// exports only a component (react-refresh/only-export-components).
//
// PR #211 round 1: the override is scoped to the pathname DERIVED FROM THE
// PLANT (/library/<plant.id>), never from the current location — at navigation
// time the URL already points to the next plant while the previous plant's
// state (and name) still lingers, so a location-derived pathname would scope
// the wrong pair and keep the stale-title bug.

/** A published override: the display name and the exact route it belongs to. */
export interface TitleOverride {
  name: string;
  pathname: string;
}

let titleOverride: TitleOverride | null = null;
const listeners = new Set<() => void>();

/** Publishes a title override scoped to `pathname`, or clears it with `null`. */
export function setDocumentTitleOverride(name: null): void;
export function setDocumentTitleOverride(name: string, pathname: string): void;
export function setDocumentTitleOverride(
  name: string | null,
  pathname?: string
): void {
  titleOverride =
    name === null || pathname === undefined ? null : { name, pathname };
  listeners.forEach((listener) => listener());
}

/** Subscribes to override changes; returns the unsubscribe function. */
export const subscribeToTitleOverride = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Returns the current override ({ name, pathname }) or null. */
export const getTitleOverride = () => titleOverride;
