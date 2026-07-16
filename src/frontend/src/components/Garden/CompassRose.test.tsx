import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CompassRose } from './CompassRose';

// SMA-17 (tokens §8). Net-new shared compass — the dialog uses the 104px
// sun-arc variant; the planner adopts it in 5.3-D.
describe('CompassRose', () => {
  it('draws the four cardinals and the needle, with no sun arc by default', () => {
    const { getByRole } = render(
      <CompassRose size={56} mode="light" ariaLabel="Compass" />
    );
    const svg = getByRole('img', { name: 'Compass' });
    expect(svg).toHaveTextContent('N');
    expect(svg).toHaveTextContent('E');
    expect(svg).toHaveTextContent('S');
    expect(svg).toHaveTextContent('W');
    // Needle + tail are polygons; the ring is a circle. No <path> means no arc.
    expect(svg.querySelectorAll('polygon')).toHaveLength(2);
    expect(svg.querySelector('path')).toBeNull();
  });

  it('renders no sun-arc path when sunArc is explicitly false', () => {
    const { getByRole } = render(
      <CompassRose size={104} mode="light" sunArc={false} ariaLabel="Compass" />
    );
    expect(
      getByRole('img', { name: 'Compass' }).querySelector('path')
    ).toBeNull();
  });

  it('adds the dashed sun-path arc in the dialog variant and honors the night ring token', () => {
    const { getByRole, rerender } = render(
      <CompassRose size={104} mode="light" sunArc ariaLabel="Compass" />
    );
    let svg = getByRole('img', { name: 'Compass' });
    const arc = svg.querySelector('path');
    expect(arc).not.toBeNull();
    expect(arc).toHaveAttribute('stroke-dasharray');
    expect(svg.querySelector('circle')).toHaveAttribute('stroke', '#D8E0D8'); // compRing day

    rerender(<CompassRose size={104} mode="dark" sunArc ariaLabel="Compass" />);
    svg = getByRole('img', { name: 'Compass' });
    expect(svg.querySelector('path')).not.toBeNull();
    expect(svg.querySelector('circle')).toHaveAttribute('stroke', '#31456B'); // compRing night
  });

  it('localizes the West letter (O in FR), leaving W absent', () => {
    const { getByRole } = render(
      <CompassRose
        size={56}
        mode="light"
        labels={{ n: 'N', e: 'E', s: 'S', w: 'O' }}
        ariaLabel="Boussole"
      />
    );
    const svg = getByRole('img', { name: 'Boussole' });
    expect(svg).toHaveTextContent('O');
    expect(svg).not.toHaveTextContent('W');
  });

  it('is decorative (aria-hidden) when no ariaLabel is given', () => {
    const { container } = render(<CompassRose size={40} mode="light" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  // SMA-17 R4 — the rose rotates to bring the selected facing to the top.
  // NOTE: this only pins the transform value; the real acceptance is the
  // STEP-3 on-screen check that the rose visibly turns (E ends at the top).
  it('rotates the whole rose to the selected facing (N/E/S/W)', () => {
    const cases: Array<[string, string]> = [
      ['N', 'rotate(0 20 20)'],
      ['E', 'rotate(-90 20 20)'],
      ['S', 'rotate(-180 20 20)'],
      ['W', 'rotate(-270 20 20)'],
    ];
    for (const [orientation, expected] of cases) {
      const { getByRole, unmount } = render(
        <CompassRose
          size={84}
          mode="light"
          sunArc
          orientation={orientation}
          ariaLabel="Compass"
        />
      );
      const g = getByRole('img', { name: 'Compass' }).querySelector('g');
      expect(g).toHaveAttribute('transform', expected);
      unmount();
    }
  });
});
