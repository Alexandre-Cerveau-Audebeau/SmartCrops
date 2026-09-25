import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SITE_NAVBAR_SELECTOR, useElementHeight, useSiteNavbarHeight } from './useSiteNavbarHeight';

// SMA-437, lot V39, PR B, step B1 — the site navbar's height, MEASURED and
// FOLLOWED, never copied (A-10.7): 56 px under 600 px in portrait, 64 px from
// 600 px, 48 px in landscape under 600 px, and every rotation in between.
// jsdom lays nothing out, so every element answers the height its `data-h`
// declares, and a ResizeObserver records its targets and fires when the test
// says so — the `useRowBudget.test.tsx` idiom.

class ManualResizeObserver {
  static instances: ManualResizeObserver[] = [];
  readonly targets = new Set<Element>();
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ManualResizeObserver.instances.push(this);
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
  fire() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

/** Fires every observer the hook created, inside `act`. */
const fireAll = () =>
  act(() => {
    for (const instance of ManualResizeObserver.instances) instance.fire();
  });

/** The observers still observing something. */
const observing = () => ManualResizeObserver.instances.filter((instance) => instance.targets.size > 0);

let restoreRects: () => void = () => {};

beforeEach(() => {
  ManualResizeObserver.instances = [];
  vi.stubGlobal('ResizeObserver', ManualResizeObserver);
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const height = Number(this.getAttribute('data-h') ?? 0);
    return {
      x: 0, y: 0, top: 0, left: 0, right: 0, bottom: height,
      width: 0, height, toJSON: () => ({}),
    } as DOMRect;
  };
  restoreRects = () => {
    Element.prototype.getBoundingClientRect = original;
  };
});

afterEach(() => {
  restoreRects();
});

/** The page's side: the height it reads, printed. */
function NavbarHeight() {
  return <output data-testid="navbar-height">{useSiteNavbarHeight()}</output>;
}

/** The site's navbar, as `Navbar.tsx` marks it — outside the page's own tree, like the real one. */
function Site({ height, page = true }: { height: number | null; page?: boolean }) {
  return (
    <>
      {height !== null && <header data-site-navbar data-h={height} />}
      {page && <NavbarHeight />}
    </>
  );
}

const shown = () => screen.getByTestId('navbar-height').textContent;

describe('useSiteNavbarHeight (SMA-437, lot V39, B1)', () => {
  it('names the attribute Navbar.tsx carries', () => {
    expect(SITE_NAVBAR_SELECTOR).toBe('[data-site-navbar]');
  });

  it('reports the navbar’s height from the first commit, read on its border box', () => {
    render(<Site height={56} />);
    expect(shown()).toBe('56');
  });

  it('follows it: a rotation, a breakpoint crossed — whatever the observer reports', () => {
    const { container } = render(<Site height={56} />);
    const navbar = container.querySelector('[data-site-navbar]')!;
    expect(observing().map((observer) => [...observer.targets])).toEqual([[navbar]]);

    navbar.setAttribute('data-h', '64');
    fireAll();
    expect(shown()).toBe('64');

    navbar.setAttribute('data-h', '48');
    fireAll();
    expect(shown()).toBe('48');
  });

  it('answers 0 when the page is drawn without the site’s navbar, and observes nothing', () => {
    render(<Site height={null} />);
    expect(shown()).toBe('0');
    expect(observing()).toEqual([]);
  });

  it('still reads the height once, and throws nothing, without a ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    render(<Site height={56} />);
    expect(shown()).toBe('56');
  });

  it('stops observing when the page goes', () => {
    const { rerender } = render(<Site height={56} />);
    expect(observing()).toHaveLength(1);
    rerender(<Site height={56} page={false} />);
    expect(observing()).toEqual([]);
  });
});

/** An element of the page's own tree, measured the same way — the compact bar, in B4. */
function Measured({ height }: { height: number }) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const measured = useElementHeight(element);
  return (
    <>
      <div ref={setElement} data-h={height} data-testid="measured" />
      <output data-testid="element-height">{measured}</output>
    </>
  );
}

describe('useElementHeight (SMA-437, lot V39, B1)', () => {
  it('reports an element’s height once it is mounted, then follows it', () => {
    render(<Measured height={54} />);
    expect(screen.getByTestId('element-height').textContent).toBe('54');

    screen.getByTestId('measured').setAttribute('data-h', '73');
    fireAll();
    expect(screen.getByTestId('element-height').textContent).toBe('73');
  });

  it('answers 0 for no element', () => {
    function Nothing() {
      return <output data-testid="nothing">{useElementHeight(null)}</output>;
    }
    render(<Nothing />);
    expect(screen.getByTestId('nothing').textContent).toBe('0');
    expect(observing()).toEqual([]);
  });
});
