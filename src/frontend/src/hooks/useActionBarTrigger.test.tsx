import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useActionBarTrigger } from './useActionBarTrigger';

// SMA-437, lot V39, PR B, step B2 — the relay AT THE SAME PLACE (A-10.1): the
// compact bar shows when the header's repeated buttons pass the line « bottom
// of the site navbar + height of the compact bar », and leaves when they come
// back. jsdom ships no IntersectionObserver: this one records its options and
// its targets, and reports what the test tells it to.

class ManualIntersectionObserver {
  static instances: ManualIntersectionObserver[] = [];
  readonly targets = new Set<Element>();
  readonly options: IntersectionObserverInit | undefined;
  private readonly callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    ManualIntersectionObserver.instances.push(this);
  }
  observe(target: Element) {
    this.targets.add(target);
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  /** Reports where the observed element stands against the line — `rootTop`, the top of the root once the margin is taken. */
  report(position: { isIntersecting: boolean; bottom: number; rootTop: number }) {
    const [target] = [...this.targets];
    const entry = {
      target,
      isIntersecting: position.isIntersecting,
      boundingClientRect: { top: position.bottom - 40, bottom: position.bottom },
      rootBounds: { top: position.rootTop, bottom: 780 },
    } as unknown as IntersectionObserverEntry;
    act(() => this.callback([entry], this as unknown as IntersectionObserver));
  }
}

/** The observers still observing something. */
const live = () => ManualIntersectionObserver.instances.filter((instance) => instance.targets.size > 0);

beforeEach(() => {
  ManualIntersectionObserver.instances = [];
  vi.stubGlobal('IntersectionObserver', ManualIntersectionObserver);
});

/** The header's repeated buttons, and what the trigger says of them. */
function Probe({ nav, bar, armed, target = true }: { nav: number; bar: number; armed: boolean; target?: boolean }) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const shown = useActionBarTrigger(element, nav, bar, armed);
  return (
    <>
      {target && <div ref={setElement} data-testid="repeated" />}
      <output data-testid="shown">{String(shown)}</output>
    </>
  );
}

const shown = () => screen.getByTestId('shown').textContent;

/** Above the line: the buttons have gone under the two bars. */
const ABOVE = { isIntersecting: false, bottom: 100, rootTop: 110 };
/** Back under the line: the buttons are in view. */
const IN_VIEW = { isIntersecting: true, bottom: 150, rootTop: 110 };

describe('useActionBarTrigger (SMA-437, lot V39, B2)', () => {
  it('observes the repeated buttons against the window, the line at the navbar plus the compact bar, from their first pixel', () => {
    render(<Probe nav={56} bar={54} armed />);
    expect(live()).toHaveLength(1);
    const [observer] = live();
    expect([...observer!.targets]).toEqual([screen.getByTestId('repeated')]);
    expect(observer!.options).toEqual({ root: null, rootMargin: '-110px 0px 0px 0px', threshold: 0 });
  });

  it('shows once the buttons have passed above the line, and hides when they come back under it', () => {
    render(<Probe nav={56} bar={54} armed />);
    expect(shown()).toBe('false');
    live()[0]!.report(ABOVE);
    expect(shown()).toBe('true');
    live()[0]!.report(IN_VIEW);
    expect(shown()).toBe('false');
  });

  it('stays hidden while the buttons are out of view BELOW the screen — they have not been scrolled past', () => {
    render(<Probe nav={56} bar={54} armed />);
    live()[0]!.report({ isIntersecting: false, bottom: 2000, rootTop: 110 });
    expect(shown()).toBe('false');
  });

  it('re-creates the observer when a height changes — and keeps showing until the new one answers', () => {
    const { rerender } = render(<Probe nav={56} bar={54} armed />);
    const first = live()[0]!;
    first.report(ABOVE);
    expect(shown()).toBe('true');

    // The phone's bar in Edit mode: 73 px, measured (A-10.4).
    rerender(<Probe nav={56} bar={73} armed />);
    expect(first.targets.size).toBe(0);
    expect(live()).toHaveLength(1);
    expect(live()[0]!.options?.rootMargin).toBe('-129px 0px 0px 0px');
    expect(shown()).toBe('true');

    // A rotation: the navbar goes to 48 px.
    rerender(<Probe nav={48} bar={73} armed />);
    expect(live()[0]!.options?.rootMargin).toBe('-121px 0px 0px 0px');
    live()[0]!.report(IN_VIEW);
    expect(shown()).toBe('false');
  });

  it('never arms while it is told not to — the layout loading, or failed, or the Novice formula — and starts hidden when it is armed again', () => {
    const { rerender } = render(<Probe nav={56} bar={54} armed={false} />);
    expect(live()).toEqual([]);
    expect(shown()).toBe('false');

    rerender(<Probe nav={56} bar={54} armed />);
    live()[0]!.report(ABOVE);
    expect(shown()).toBe('true');

    rerender(<Probe nav={56} bar={54} armed={false} />);
    expect(live()).toEqual([]);
    expect(shown()).toBe('false');

    rerender(<Probe nav={56} bar={54} armed />);
    expect(live()).toHaveLength(1);
    expect(shown()).toBe('false');
  });

  it('observes nothing without the buttons', () => {
    render(<Probe nav={56} bar={54} armed target={false} />);
    expect(live()).toEqual([]);
    expect(shown()).toBe('false');
  });

  it('never shows, and throws nothing, without an IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(<Probe nav={56} bar={54} armed />);
    expect(shown()).toBe('false');
  });
});
