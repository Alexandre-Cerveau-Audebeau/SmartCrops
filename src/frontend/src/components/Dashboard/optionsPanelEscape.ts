import { createContext, useContext, useEffect } from 'react';

/**
 * SMA-437 lot 1, PR B, step B5 (pre-flight C.9, « deux conflits d'Échap ») —
 * the options panel of a widget is a `Popover`, and a `Popover` closes on
 * Escape. Two gestures inside the Key figures panel need Escape for themselves:
 * a keyboard drag, which Escape CANCELS, and the catalogue, which Escape
 * leaves for the four emplacements — the panel staying open both times.
 *
 * `SortableWidget` provides this setter; a panel holds Escape while it needs
 * it (`useHoldOptionsPanelEscape`), and the `Popover` then leaves the key to
 * it (`disableEscapeKeyDown`) — the event goes on to the drag's own listener.
 * A plain module, not a component file (react-refresh/only-export-components).
 */
export const OptionsPanelEscapeContext = createContext<((held: boolean) => void) | null>(null);

/** Leaves Escape to the panel while `held` is true; released when the panel unmounts. */
export function useHoldOptionsPanelEscape(held: boolean): void {
  const hold = useContext(OptionsPanelEscapeContext);
  useEffect(() => {
    if (!hold) return undefined;
    hold(held);
    return () => hold(false);
  }, [hold, held]);
}
