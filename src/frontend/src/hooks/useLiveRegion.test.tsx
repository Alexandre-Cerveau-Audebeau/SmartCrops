import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode, useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIVE_REGION_CLEAR_MS, useLiveRegion } from './useLiveRegion';

// SMA-437, lot V3-07, P3 (contract v3 A-6, A-20) — the live region the
// dashboard's surfaces share: mounted once, born empty, written by its ref;
// `announce(text)` replaces and writes nothing twice. PR #303, fix round 1,
// R1 (Alexandre, 30/09 — the [P] n° 14): a note ON SCREEN keeps its
// sentence; a region only assistive technology hears is emptied after 5 s.

/** A surface with its region — a note on screen unless `visible` says otherwise —, and a button that says `text`. */
function Surface({ text, tick = 0, visible = true }: { text: string; tick?: number; visible?: boolean }) {
  const { announce, regionProps } = useLiveRegion({ visible });
  return (
    <div data-tick={tick}>
      <button type="button" onClick={() => announce(text)}>
        say
      </button>
      <div {...regionProps} data-region />
    </div>
  );
}

/** A card whose EFFECT says its state — the Tips and To-do cards' use: an invisible region. */
function Card({ state }: { state: string }) {
  const { announce, regionProps } = useLiveRegion({ visible: false });
  useEffect(() => {
    announce(state);
  }, [announce, state]);
  return <p {...regionProps} data-region />;
}

const region = () => document.querySelector('[data-region]') as HTMLElement;
const say = () => fireEvent.click(screen.getByRole('button', { name: 'say' }));

/** A counter of the writes made to the region: what a screen reader would be handed. */
function watch(node: HTMLElement) {
  const observer = new MutationObserver(() => {});
  observer.observe(node, { childList: true, characterData: true, subtree: true });
  return () => observer.takeRecords().length;
}

afterEach(() => {
  // Unmount FIRST (SMA-452 § 13), on the clock the test ran on; only then is
  // the real clock back.
  cleanup();
  vi.useRealTimers();
});

describe('useLiveRegion — one region, born empty, polite (A-6)', () => {
  it('is a `role="status"` `aria-live="polite"` region with NO text node at all when it mounts', () => {
    render(<Surface text="Tips moves to 4th place." />);
    expect(region()).toHaveAttribute('role', 'status');
    expect(region()).toHaveAttribute('aria-live', 'polite');
    expect(region().childNodes).toHaveLength(0);
  });

  it('REPLACES what it holds — never accumulates', () => {
    const { rerender } = render(<Surface text="“Tips” hidden." />);
    say();
    expect(region().textContent).toBe('“Tips” hidden.');

    rerender(<Surface text="“Tips” shown." />);
    say();
    expect(region().textContent).toBe('“Tips” shown.');
  });

  it('writes a sentence once: the one it already holds is not written again, and a re-render writes nothing', () => {
    const { rerender } = render(<Surface text="“Weather” set to Large." />);
    const writes = watch(region());
    say();
    expect(writes()).toBe(1);

    say();
    expect(writes()).toBe(0);
    rerender(<Surface text="“Weather” set to Large." tick={1} />);
    expect(writes()).toBe(0);
    expect(region().textContent).toBe('“Weather” set to Large.');
  });

  it('a card whose effect runs twice for one state — React’s StrictMode — writes its sentence once, after the region is in', () => {
    // Watched from BEFORE the region exists: the records say in what order
    // the document was written (the Tips card's `watchDocument`).
    const observer = new MutationObserver(() => {});
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    render(
      <StrictMode>
        <Card state="Weather unavailable." />
      </StrictMode>
    );
    const records = observer.takeRecords();
    observer.disconnect();

    const node = region();
    const inserted = records.findIndex((record) => [...record.addedNodes].some((added) => added === node || added.contains(node)));
    const writes = records.filter((record) => node.contains(record.target));
    expect(node.textContent).toBe('Weather unavailable.');
    expect(inserted).toBeGreaterThanOrEqual(0);
    expect(writes).toHaveLength(1);
    expect(records.indexOf(writes[0]!)).toBeGreaterThan(inserted);
  });
});

describe('useLiveRegion — an INVISIBLE region, emptied after five seconds (the mockups’ report, § 3.1; A-20)', () => {
  it('empties the region 5 s after the last sentence — a new sentence restarts the delay', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { rerender } = render(<Surface text="“Tips” hidden." visible={false} />);
    say();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    rerender(<Surface text="“Tips” shown." visible={false} />);
    say();
    act(() => {
      vi.advanceTimersByTime(LIVE_REGION_CLEAR_MS - 1);
    });
    expect(region().textContent).toBe('“Tips” shown.');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(region().textContent).toBe('');
  });

  it('`announce("")` empties it at once, and nothing is left to run', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { rerender } = render(<Surface text="“Tips” hidden." visible={false} />);
    say();
    rerender(<Surface text="" visible={false} />);
    say();
    expect(region().childNodes).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never outlives its region: unmounted, the pending emptying is cancelled', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { unmount } = render(<Surface text="“Tips” hidden." visible={false} />);
    say();
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

// PR #303, fix round 1, R1 — Alexandre, 30/09, on the [P] n° 14 (« ok »):
// emptied 5 s after its sentence, a note ON SCREEN folded, and the button
// under it moved up without a gesture — « un bouton ne change jamais de
// place sous le doigt » —; a confirmation that stays shown follows his
// decision on « Enregistré ». It stays until the next sentence replaces it,
// or until its panel closes and takes the region with it.
describe('useLiveRegion — a VISIBLE note stays until the next sentence (PR #303, fix round 1, R1)', () => {
  it('keeps its sentence: six seconds on, the note still says it — no emptying is even set', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    render(<Surface text="“Tips” hidden." visible />);
    const writes = watch(region());
    say();
    expect(vi.getTimerCount()).toBe(0);

    act(() => {
      vi.advanceTimersByTime(LIVE_REGION_CLEAR_MS + 1000);
    });
    expect(region().textContent).toBe('“Tips” hidden.');
    expect(writes()).toBe(1);
  });

  it('the next sentence REPLACES the note in one write — the old one taken out, the new one put in, never the old said again', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { rerender } = render(<Surface text="“Tips” hidden." visible />);
    say();
    act(() => {
      vi.advanceTimersByTime(LIVE_REGION_CLEAR_MS + 1000);
    });

    const observer = new MutationObserver(() => {});
    observer.observe(region(), { childList: true, characterData: true, subtree: true });
    rerender(<Surface text="“Tips” shown." visible />);
    say();
    const records = observer.takeRecords();
    observer.disconnect();

    expect(region().textContent).toBe('“Tips” shown.');
    expect(records).toHaveLength(1);
    expect([...records[0]!.removedNodes].map((node) => node.textContent)).toEqual(['“Tips” hidden.']);
    expect([...records[0]!.addedNodes].map((node) => node.textContent)).toEqual(['“Tips” shown.']);
  });
});
