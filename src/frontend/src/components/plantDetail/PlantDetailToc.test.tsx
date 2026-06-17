import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../i18n/i18n';
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

const SECTIONS: TocSection[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'about', label: 'About' },
  { id: 'sources', label: 'External sources' },
];

describe('PlantDetailToc (SMA-169)', () => {
  it('renders one anchor per section pointing at its id (desktop)', () => {
    setMatchMedia(false); // useMediaQuery(down('md')) => false => desktop sidebar
    render(<PlantDetailToc sections={SECTIONS} activeId="overview" />);

    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'href',
      '#overview'
    );
    expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute(
      'href',
      '#about'
    );
    expect(
      screen.getByRole('link', { name: 'External sources' })
    ).toHaveAttribute('href', '#sources');
  });

  it('marks the active section with aria-current and leaves the others unset', () => {
    setMatchMedia(false);
    render(<PlantDetailToc sections={SECTIONS} activeId="about" />);

    expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute(
      'aria-current',
      'true'
    );
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute(
      'aria-current'
    );
  });

  it('renders the same anchors as a horizontal bar on mobile', () => {
    setMatchMedia(true); // down('md') => true => mobile bar
    render(<PlantDetailToc sections={SECTIONS} activeId="about" />);

    expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute(
      'href',
      '#about'
    );
    expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute(
      'aria-current',
      'true'
    );
  });

  it('renders nothing when there are no sections', () => {
    setMatchMedia(false);
    const { container } = render(<PlantDetailToc sections={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
