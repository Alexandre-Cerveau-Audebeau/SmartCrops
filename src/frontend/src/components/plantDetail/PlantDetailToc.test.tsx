import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/i18n';
import PlantDetailToc from './PlantDetailToc';
import type { TocSection } from './PlantDetailToc';

// useMediaQuery reads matchMedia; stub it to pick the desktop vs mobile variant.
function setMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// One entry per state (SMA-178 part B). Labels are resolved by the component via
// i18n; the test resolves the same keys against the (en) instance to assert text.
const SECTIONS: TocSection[] = [
  {
    num: '01',
    id: 'overview',
    labelKey: 'plantDetail.sections.overview',
    state: 'live',
  },
  {
    num: '03',
    id: 'distribution',
    labelKey: 'plantDetail.sections.distribution',
    state: 'coming-data',
  },
  {
    num: '04',
    id: 'lifecycle',
    labelKey: 'plantDetail.sections.lifecycle',
    state: 'empty',
  },
  {
    num: '12',
    id: 'sources',
    labelKey: 'plantDetail.sections.sources',
    state: 'live',
  },
  {
    num: '15',
    id: 'community',
    labelKey: 'plantDetail.sections.community',
    state: 'coming-backend',
  },
];

const label = (key: string) => i18n.t(key);

describe('PlantDetailToc (SMA-178 part B — 01-15 four-state)', () => {
  it('renders only live entries as anchors pointing at their id (desktop)', () => {
    setMatchMedia(false); // useMediaQuery(down('md')) => false => desktop sidebar
    render(<PlantDetailToc sections={SECTIONS} activeId="overview" />);

    expect(
      screen.getByRole('link', { name: label('plantDetail.sections.overview') })
    ).toHaveAttribute('href', '#overview');
    expect(
      screen.getByRole('link', { name: label('plantDetail.sections.sources') })
    ).toHaveAttribute('href', '#sources');
  });

  it('renders non-live entries as non-clickable labels (no anchor)', () => {
    setMatchMedia(false);
    render(<PlantDetailToc sections={SECTIONS} activeId="overview" />);

    // empty, coming-data and coming-backend entries are NOT links...
    expect(
      screen.queryByRole('link', {
        name: label('plantDetail.sections.lifecycle'),
      })
    ).toBeNull();
    expect(
      screen.queryByRole('link', {
        name: label('plantDetail.sections.distribution'),
      })
    ).toBeNull();
    expect(
      screen.queryByRole('link', {
        name: label('plantDetail.sections.community'),
      })
    ).toBeNull();
    // ...but their labels still render (frozen skeleton).
    expect(
      screen.getByText(label('plantDetail.sections.distribution'))
    ).toBeInTheDocument();
  });

  it('shows the "coming soon" tag only on coming-* entries', () => {
    setMatchMedia(false);
    render(<PlantDetailToc sections={SECTIONS} activeId="overview" />);

    // distribution (coming-data) + community (coming-backend) => 2 tags.
    expect(
      screen.getAllByText(label('plantDetail.sections.comingSoonTag'))
    ).toHaveLength(2);
  });

  it('renders the fixed zero-padded numbers (not positional)', () => {
    setMatchMedia(false);
    render(<PlantDetailToc sections={SECTIONS} activeId="overview" />);

    expect(screen.getByText('01')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('marks the active live section with aria-current and leaves others unset', () => {
    setMatchMedia(false);
    render(<PlantDetailToc sections={SECTIONS} activeId="sources" />);

    expect(
      screen.getByRole('link', { name: label('plantDetail.sections.sources') })
    ).toHaveAttribute('aria-current', 'location');
    expect(
      screen.getByRole('link', { name: label('plantDetail.sections.overview') })
    ).not.toHaveAttribute('aria-current');
  });

  it('shows the "coming soon" tag on coming-* entries on mobile too', () => {
    setMatchMedia(true);
    render(<PlantDetailToc sections={SECTIONS} activeId="sources" />);

    // distribution (coming-data) + community (coming-backend) => 2 tags.
    expect(
      screen.getAllByText(label('plantDetail.sections.comingSoonTag'))
    ).toHaveLength(2);
  });

  it('renders live anchors as a horizontal bar on mobile, coming entries non-clickable', () => {
    setMatchMedia(true); // down('md') => true => mobile bar
    render(<PlantDetailToc sections={SECTIONS} activeId="sources" />);

    expect(
      screen.getByRole('link', { name: label('plantDetail.sections.sources') })
    ).toHaveAttribute('href', '#sources');
    expect(
      screen.getByRole('link', { name: label('plantDetail.sections.sources') })
    ).toHaveAttribute('aria-current', 'location');
    expect(
      screen.queryByRole('link', {
        name: label('plantDetail.sections.distribution'),
      })
    ).toBeNull();
  });

  it('still renders when sticky is disabled (parent owns positioning)', () => {
    setMatchMedia(false);
    render(
      <PlantDetailToc sections={SECTIONS} activeId="overview" disableSticky />
    );

    expect(
      screen.getByRole('link', { name: label('plantDetail.sections.overview') })
    ).toBeInTheDocument();
  });

  it('renders nothing when there are no sections', () => {
    setMatchMedia(false);
    const { container } = render(<PlantDetailToc sections={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('centers the active pill in the mobile bar via container.scrollTo (SMA-247)', () => {
    // Query-aware stub: the breakpoint matches (mobile) but reduced-motion does
    // not → smooth scroll.
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: !query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );

    const rect = (left: number, width: number): DOMRect =>
      ({
        left,
        width,
        right: left + width,
        top: 0,
        bottom: 0,
        height: 0,
        x: left,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const { rerender } = render(
      <PlantDetailToc sections={SECTIONS} activeId="overview" />
    );

    // jsdom has no layout — mock the specific container + target-pill geometry so
    // the rect math runs: bar 300px wide (scrollable 900), the 'sources' pill is
    // an 80px box at x=400 → target = 0 + 400 - (300-80)/2 = 290, clamped to
    // [0, 600].
    const nav = screen.getByRole('navigation');
    const scrollTo = vi.fn();
    nav.scrollTo = scrollTo as unknown as HTMLElement['scrollTo'];
    Object.defineProperty(nav, 'clientWidth', {
      value: 300,
      configurable: true,
    });
    Object.defineProperty(nav, 'scrollWidth', {
      value: 900,
      configurable: true,
    });
    Object.defineProperty(nav, 'scrollLeft', {
      value: 0,
      configurable: true,
      writable: true,
    });
    nav.getBoundingClientRect = () => rect(0, 300);

    const sourcesPill = screen.getByRole('link', {
      name: label('plantDetail.sections.sources'),
    });
    sourcesPill.getBoundingClientRect = () => rect(400, 80);

    // Activate 'sources' → the effect re-runs and centers its pill.
    rerender(<PlantDetailToc sections={SECTIONS} activeId="sources" />);

    expect(scrollTo).toHaveBeenCalledWith({ left: 290, behavior: 'smooth' });
  });
});
