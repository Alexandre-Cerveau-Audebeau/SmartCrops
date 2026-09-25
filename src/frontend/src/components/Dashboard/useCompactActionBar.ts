import { useState } from 'react';
import { hasActionBar } from '../../constants/dashboardCapabilities';
import { useActionBarTrigger } from '../../hooks/useActionBarTrigger';
import { useElementHeight, useSiteNavbarHeight } from '../../hooks/useSiteNavbarHeight';
import type { DashboardLevel } from '../../types/Dashboard';

export interface CompactActionBarState {
  /** The formula has a compact bar (A-9): the page mounts it. */
  enabled: boolean;
  /** It shows: the header's repeated buttons have passed the line (A-10.1). */
  shown: boolean;
  /** Where it sits: right under the site navbar, whose height is measured (A-10.7). */
  top: number;
  /** The callback ref of the header's repeated buttons — what the trigger observes. */
  repeatedRef: (element: HTMLDivElement | null) => void;
  /** The callback ref of the bar — measured, its height is half of the line. */
  barRef: (element: HTMLDivElement | null) => void;
}

/**
 * SMA-437, lot V39, PR B, step B4 — the compact action bar's state, as the
 * page reads it: whether the formula has one (B3), where the site navbar ends
 * (B1), how tall the bar is, and whether the header's repeated buttons have
 * passed the line « navbar + bar » (B2). `ready` is false while the layout
 * loads or could not be read: no bar then (A-10.2), the trigger not armed.
 */
export function useCompactActionBar(level: DashboardLevel, ready: boolean): CompactActionBarState {
  const [repeated, setRepeated] = useState<HTMLDivElement | null>(null);
  const [bar, setBar] = useState<HTMLDivElement | null>(null);
  const enabled = hasActionBar(level);
  const top = useSiteNavbarHeight();
  const barHeight = useElementHeight(bar);
  const shown = useActionBarTrigger(repeated, top, barHeight, enabled && ready);
  return { enabled, shown, top, repeatedRef: setRepeated, barRef: setBar };
}
