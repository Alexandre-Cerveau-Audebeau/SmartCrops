import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '../../i18n/i18n';
import type { PlantImage } from '../../types/Plant';
import PlantGalleryDialog from './PlantGalleryDialog';

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
  } as unknown as PlantImage;
}

const tileButtons = () => screen.getAllByRole('button', { name: /Open photo/ });

describe('PlantGalleryDialog (SMA-154)', () => {
  it('renders a thumbnail button per image plus the dialog title', () => {
    const images = [
      makeImg(1, 'Habit'),
      makeImg(2, 'Flower'),
      makeImg(3, 'Flower'),
    ];
    render(
      <PlantGalleryDialog
        open
        images={images}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText('All photos')).toBeInTheDocument();
    expect(tileButtons()).toHaveLength(3);
  });

  it('shows a chip only for the ImageTypes present, plus All, and filters on click', async () => {
    const user = userEvent.setup();
    const images = [
      makeImg(1, 'Habit'),
      makeImg(2, 'Flower'),
      makeImg(3, 'Flower'),
      makeImg(4, 'Fruit'),
    ];
    render(
      <PlantGalleryDialog
        open
        images={images}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />
    );

    // Present types + All; an absent type (Leaf) must not appear.
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Habit')).toBeInTheDocument();
    expect(screen.getByText('Flower')).toBeInTheDocument();
    expect(screen.getByText('Fruit')).toBeInTheDocument();
    expect(screen.queryByText('Leaf')).toBeNull();
    expect(tileButtons()).toHaveLength(4);

    // Filtering to Fruit leaves a single tile.
    await user.click(screen.getByText('Fruit'));
    expect(tileButtons()).toHaveLength(1);
  });

  it('hands the filtered subset and index back to onSelect when a thumbnail is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const images = [
      makeImg(1, 'Habit'),
      makeImg(2, 'Flower'),
      makeImg(3, 'Fruit'),
    ];
    render(
      <PlantGalleryDialog
        open
        images={images}
        onClose={vi.fn()}
        onSelect={onSelect}
      />
    );

    // Filter to Flower → the subset is a single image; clicking it passes that
    // subset (length 1) at index 0, so the lightbox navigates the filtered set.
    await user.click(screen.getByText('Flower'));
    await user.click(tileButtons()[0]);

    expect(onSelect).toHaveBeenCalledTimes(1);
    const [passedImages, index] = onSelect.mock.calls[0];
    expect(passedImages).toHaveLength(1);
    expect(passedImages[0].imageType).toBe('Flower');
    expect(index).toBe(0);
  });

  it('hides the filter chips when only one type is present', () => {
    const images = [makeImg(1, 'Flower'), makeImg(2, 'Flower')];
    render(
      <PlantGalleryDialog
        open
        images={images}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />
    );

    expect(screen.queryByText('All')).toBeNull();
    expect(tileButtons()).toHaveLength(2);
  });
});
