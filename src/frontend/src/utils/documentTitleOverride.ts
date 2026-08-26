// SMA-354 lot 2 — module-level document-title override store. PlantDetail
// publishes the loaded display name here (and clears it on unmount) so
// DocumentHead can compose "<PlantName> · SmartCrops" without threading props
// through the tree. Lives outside DocumentHead.tsx so that component file
// exports only a component (react-refresh/only-export-components).
let titleOverride: string | null = null;
const listeners = new Set<() => void>();

export function setDocumentTitleOverride(name: string | null): void {
  titleOverride = name;
  listeners.forEach((listener) => listener());
}

export const subscribeToTitleOverride = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getTitleOverride = () => titleOverride;
