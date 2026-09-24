import { createRoot } from 'react-dom/client';
import Popover from '@mui/material/Popover';
import { ThemeProvider } from '@mui/material/styles';
import { createAppTheme } from '../../theme';
import FocusProbeList from './FocusProbeList';

/**
 * SMA-437 lot 1, PR B, round 1, S1 — WHERE THE FOCUS GOES after a move of the
 * reorderable list, read in a real engine. jsdom cannot answer it: it does
 * drop the focus of a node the DOM moves, but React gives it back after its
 * commit, and whether a browser, a Popover's focus trap and dnd-kit's own
 * restoration leave it there is what a keyboard user lives with. So the real
 * `ReorderableList` is mounted — bare, and inside a real MUI `Popover`, the
 * container the Key figures gear draws it in — its buttons pressed the way a
 * browser presses them (focus, then the activation's `click`), its handle
 * driven the way dnd-kit reads a keyboard (Space, an arrow, Space).
 *
 * The CONTROL case moves a focused row with the DOM alone, no React: a focus
 * the engine drops must read as dropped, or the instrument proves nothing.
 */

/** What a gesture pressed: ▲ or ▼ of a row, or its handle driven by an arrow. */
export type FocusGesture = 'up' | 'down' | 'handle-up' | 'handle-down';

export interface FocusMeasure {
  /** `<container>/<gesture> row <n>` — the case, by its row's index before the move (1-based). */
  probe: string;
  container: 'list' | 'popover' | 'control';
  gesture: FocusGesture;
  /** The row the gesture was made on, by name. */
  row: string;
  /** The rows after the gesture, by name. */
  order: string[];
  /** The row of the element that holds the focus after the gesture, or null when it is in none. */
  focusedRow: string | null;
  /** Which of that row's controls holds it — its handle, ▲ or ▼ — or the focused element's tag. */
  focusedControl: 'handle' | 'up' | 'down' | string;
  /** Whether the focused control is `aria-disabled` (an end reached). */
  focusedDisabled: boolean;
  /** The pressed control lost the focus at some point of the gesture (a `focusout` on it). */
  blurredOnTheWay: boolean;
}

const NAMES = ['Cases libres', 'Occupation', 'Variétés', 'À faire aujourd’hui'];

/** A promise that settles after `ms` of the page's (virtual) time. */
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function probeTree(container: 'list' | 'popover', mode: 'light' | 'dark') {
  return (
    <ThemeProvider theme={createAppTheme(mode)}>
      {container === 'list' ? (
        <FocusProbeList rows={NAMES} />
      ) : (
        <Popover open anchorReference="anchorPosition" anchorPosition={{ top: 8, left: 8 }}>
          <FocusProbeList rows={NAMES} />
        </Popover>
      )}
    </ThemeProvider>
  );
}

/** The probe's rows, top to bottom — in the host, or in the Popover's portal. */
const rowsIn = (scope: ParentNode) => [...scope.querySelectorAll<HTMLElement>('[data-focus-probe] li')];
const nameOf = (row: Element | null) => row?.querySelector('[data-focus-probe-name]')?.textContent ?? null;
/** A row's three controls, in their order: the handle, ▲, ▼. */
const controlsOf = (row: Element) => [...row.querySelectorAll<HTMLElement>('button')];
const CONTROLS = ['handle', 'up', 'down'] as const;

function keydown(target: EventTarget, code: 'Space' | 'ArrowUp' | 'ArrowDown') {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { code, key: code === 'Space' ? ' ' : code, bubbles: true, cancelable: true })
  );
}

/** Where the focus is: its row and which control of it. */
function focusNow() {
  const active = document.activeElement as HTMLElement | null;
  const row = active?.closest('[data-focus-probe] li') ?? null;
  const index = row && active ? controlsOf(row).indexOf(active) : -1;
  return {
    focusedRow: nameOf(row),
    focusedControl: index >= 0 ? CONTROLS[index]! : (active?.tagName.toLowerCase() ?? 'none'),
    focusedDisabled: active?.getAttribute('aria-disabled') === 'true',
  };
}

async function reactCase(
  page: HTMLElement,
  mode: 'light' | 'dark',
  container: 'list' | 'popover',
  gesture: FocusGesture,
  rowIndex: number
): Promise<FocusMeasure> {
  const host = document.createElement('div');
  page.appendChild(host);
  const root = createRoot(host);
  root.render(probeTree(container, mode));
  await wait(60);

  const row = rowsIn(document)[rowIndex]!;
  const rowName = nameOf(row)!;
  const [handle, up, down] = controlsOf(row);
  const pressed = gesture === 'up' ? up! : gesture === 'down' ? down! : handle!;
  let blurredOnTheWay = false;
  pressed.addEventListener('focusout', () => {
    blurredOnTheWay = true;
  });
  pressed.focus();

  if (gesture === 'up' || gesture === 'down') {
    // What Enter or Space on a focused button does: the activation's `click`.
    pressed.click();
  } else {
    // dnd-kit's keyboard sensor: Space picks the row up, its keydown listener
    // arrives a tick later, an arrow moves it one place, Space drops it.
    keydown(pressed, 'Space');
    await wait(50);
    keydown(document.activeElement ?? pressed, gesture === 'handle-up' ? 'ArrowUp' : 'ArrowDown');
    await wait(50);
    keydown(document.activeElement ?? pressed, 'Space');
  }
  // React has committed; dnd-kit's own focus restoration (a frame after the
  // drop) and the Popover's trap (a 50 ms interval) have had their turn.
  await wait(200);

  const measure: FocusMeasure = {
    probe: `${container}/${gesture} row ${rowIndex + 1}`,
    container,
    gesture,
    row: rowName,
    order: rowsIn(document).map((each) => nameOf(each)!),
    ...focusNow(),
    blurredOnTheWay,
  };
  root.unmount();
  host.remove();
  return measure;
}

/** The control: a focused row moved by the DOM alone — the engine drops the focus, and the probe must see it. */
async function controlCase(page: HTMLElement): Promise<FocusMeasure> {
  const host = document.createElement('div');
  host.innerHTML = `<div data-focus-probe><ul>${NAMES.map(
    (name) =>
      `<li><span data-focus-probe-name>${name}</span><button type="button">h</button><button type="button">u</button><button type="button">d</button></li>`
  ).join('')}</ul></div>`;
  page.appendChild(host);
  const rows = rowsIn(host);
  const down = controlsOf(rows[0]!)[2]!;
  let blurredOnTheWay = false;
  down.addEventListener('focusout', () => {
    blurredOnTheWay = true;
  });
  down.focus();
  rows[0]!.parentElement!.insertBefore(rows[0]!, rows[2]!);
  await wait(20);
  const measure: FocusMeasure = {
    probe: 'control/down row 1',
    container: 'control',
    gesture: 'down',
    row: NAMES[0]!,
    order: rowsIn(host).map((each) => nameOf(each)!),
    ...focusNow(),
    blurredOnTheWay,
  };
  host.remove();
  return measure;
}

/**
 * The cases, in both containers: ▲ in the middle and to the top, ▼ in the
 * middle and to the bottom — ▼ of the FIRST row is the one where React moves
 * the focused row itself — and the handle, one place down and one place up.
 */
export async function measureFocus(page: HTMLElement, mode: 'light' | 'dark'): Promise<FocusMeasure[]> {
  const measures: FocusMeasure[] = [await controlCase(page)];
  for (const container of ['list', 'popover'] as const) {
    measures.push(await reactCase(page, mode, container, 'down', 0));
    measures.push(await reactCase(page, mode, container, 'down', 2));
    measures.push(await reactCase(page, mode, container, 'up', 2));
    measures.push(await reactCase(page, mode, container, 'up', 1));
    measures.push(await reactCase(page, mode, container, 'handle-down', 0));
    measures.push(await reactCase(page, mode, container, 'handle-up', 2));
  }
  return measures;
}
