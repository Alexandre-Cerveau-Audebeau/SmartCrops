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
});
