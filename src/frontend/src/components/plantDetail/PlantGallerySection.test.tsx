import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/i18n';
import type { PlantImage } from '../../types/Plant';
import PlantGallerySection from './PlantGallerySection';

// G1 (CodeRabbit) — isolate locale state so the English assertions never depend
// on another suite having switched language (mirrors PlantLibrary/Navbar tests).
beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage('en');
});

// Returns a fully-typed PlantImage (no cast) so the fixture stays contract-checked.
// The component composes the displayed attribution from credit/source/licenseName.
function makeImg(id: number, imageType: string): PlantImage {
  return {
    id,
    imageType,
    url: `https://img.test/${id}.jpg`,
    thumbnailUrl: `https://img.test/${id}-thumb.jpg`,
    width: 100,
    height: 100,
    licenseName: 'CC BY-SA',
    licenseUrl: null,
    credit: 'A. Photographer',
    source: 'Trefle',
    sourceExternalId: null,
    displayOrder: id,
    isFlagged: false,
    attribution: '© A. Photographer · Trefle · CC BY-SA',
  };
}

const tiles = () => screen.getAllByRole('button', { name: /Open photo/ });

describe('PlantGallerySection (SMA-154)', () => {
  it('renders a tile per image with a localized type badge and an attribution line', () => {
    // Single type → no chip row, so the badge text is unambiguous.
    const images = [makeImg(1, 'Fruit'), makeImg(2, 'Fruit')];
    render(<PlantGallerySection images={images} onSelect={vi.fn()} />);

    expect(tiles()).toHaveLength(2);
    // One localized type badge per tile.
    expect(screen.getAllByText('Fruit')).toHaveLength(2);
    // Composed attribution line per tile (© credit · source · license).
    expect(
      screen.getAllByText('© A. Photographer · Trefle · CC BY-SA')
    ).toHaveLength(2);
    // A single type means no filter chips.
    expect(screen.queryByRole('button', { name: 'All' })).toBeNull();
  });

  it('shows a chip per present type plus All, hides absent types, and filters on click', async () => {
    const user = userEvent.setup();
    const images = [
      makeImg(1, 'Habit'),
      makeImg(2, 'Flower'),
      makeImg(3, 'Flower'),
      makeImg(4, 'Fruit'),
    ];
    render(<PlantGallerySection images={images} onSelect={vi.fn()} />);

    // Chips are buttons; tiles are buttons named "Open photo …" — query chips by name.
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Habit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Flower' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fruit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Leaf' })).toBeNull();
    expect(tiles()).toHaveLength(4);

    await user.click(screen.getByRole('button', { name: 'Fruit' }));
    expect(tiles()).toHaveLength(1);
  });

  it('hands the filtered subset and index back to onSelect when a tile is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const images = [
      makeImg(1, 'Habit'),
      makeImg(2, 'Flower'),
      makeImg(3, 'Fruit'),
    ];
    render(<PlantGallerySection images={images} onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: 'Flower' }));
    await user.click(tiles()[0]);

    expect(onSelect).toHaveBeenCalledTimes(1);
    const [passedImages, index] = onSelect.mock.calls[0];
    expect(passedImages).toHaveLength(1);
    expect(passedImages[0].imageType).toBe('Flower');
    expect(index).toBe(0);
  });

  it('renders the empty state when there are no images', () => {
    render(<PlantGallerySection images={[]} onSelect={vi.fn()} />);

    expect(
      screen.getByText('No photos yet for this plant.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Open photo/ })).toBeNull();
  });
});
