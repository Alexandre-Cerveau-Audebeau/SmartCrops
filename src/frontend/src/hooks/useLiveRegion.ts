import { useCallback, useEffect, useRef } from 'react';

/**
 * How long a sentence stays in an INVISIBLE region before it is emptied — the
 * contract of the mockups' report (SMA-437, V3-07, § 3.1): « un
 * `announce(text)` qui remplace et vide après 5 s », kept by Alexandre on
 * 30/09 for the regions no one sees (the [P] n° 14 of lot V3-07, A-20).
 * Emptying is a removal, which assistive technology does not announce; it
 * leaves a region that says nothing stale when a reader walks into it, and a
 * sentence that can be said again.
 */
export const LIVE_REGION_CLEAR_MS = 5000;

/**
 * SMA-437, lot V3-07, P3 (contract v3 A-6, A-20) — THE live region of a
 * surface, as #278 taught it and S2 of PR #288 recalled it: a region is
 * announced when its text CHANGES, not when it is inserted already filled.
 * So it is mounted once, born EMPTY — no React child, ever: the owner spreads
 * `regionProps` on an element and gives it no children —, and kept mounted
 * whatever view stands above it; its text is written into it by its ref,
 * never rendered by React and never set through a state in an effect
 * (`react-hooks/set-state-in-effect`).
 *
 * `announce(text)` REPLACES what the region holds — never accumulates —, and
 * `announce('')` empties it at once. One DOM write per change: the sentence
 * the region already holds is not written again — the effect of a card run
 * twice for one state, or two gestures that say the same thing, is said
 * once. `polite`, never `assertive`.
 *
 * What becomes of a sentence depends on whether the region is on screen,
 * and the owner says it (`visible`) — PR #303, fix round 1, R1: Alexandre's
 * decision of 30/09 on the [P] n° 14 of lot V3-07 (A-20).
 * - A VISIBLE note — the Customize panel's, the band's — STAYS until the
 *   next sentence replaces it, or until its panel closes and takes the
 *   region with it. Emptied after 5 s, it folded, and the button under it
 *   moved up without a gesture — « un bouton ne change jamais de place sous
 *   le doigt » —; a confirmation that stays shown follows his decision on
 *   « Enregistré ».
 * - An INVISIBLE region — the Tips and To-do cards', off screen — is emptied
 *   {@link LIVE_REGION_CLEAR_MS} after its sentence, and a new sentence
 *   restarts the delay: emptying it moves nothing.
 *
 * Three of the regions written by hand this way before it — the band's panel,
 * the Tips and To-do cards — pass through it, and the Customize panel's is
 * born with it (A-20). The Gardens options panel's, which neither list of A-6
 * names, keeps its own for now; the regions React renders from a state that
 * is empty at mount are not this pattern, and keep their form.
 */
export function useLiveRegion<T extends HTMLElement = HTMLDivElement>({ visible }: { visible: boolean }) {
  const ref = useRef<T | null>(null);
  const clearing = useRef<ReturnType<typeof setTimeout> | null>(null);

  const announce = useCallback(
    (text: string) => {
      if (clearing.current !== null) {
        clearTimeout(clearing.current);
        clearing.current = null;
      }
      const node = ref.current;
      if (!node) return;
      if (node.textContent !== text) node.textContent = text;
      // A note on screen keeps its sentence; only a region no one sees is emptied.
      if (text === '' || visible) return;
      clearing.current = setTimeout(() => {
        clearing.current = null;
        if (ref.current) ref.current.textContent = '';
      }, LIVE_REGION_CLEAR_MS);
    },
    [visible]
  );

  // The pending emptying never outlives the region.
  useEffect(() => {
    const pending = clearing;
    return () => {
      if (pending.current !== null) clearTimeout(pending.current);
    };
  }, []);

  return { announce, regionProps: { ref, role: 'status', 'aria-live': 'polite' } as const };
}
