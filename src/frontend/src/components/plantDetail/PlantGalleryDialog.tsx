import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import CloseIcon from '@mui/icons-material/Close';
import type { PlantImage } from '../../types/Plant';

interface PlantGalleryDialogProps {
  open: boolean;
  onClose: () => void;
  /** The stable (non-Perenual), canonically-sorted gallery images. */
  images: PlantImage[];
  /**
   * Open the lightbox on the currently-filtered subset at `index`, so its
   * prev/next arrows navigate exactly what the grid is showing.
   */
  onSelect: (images: PlantImage[], index: number) => void;
}

const ALL = 'all';

/**
 * Full photo-gallery view for Plant Detail v2 (SMA-154). A responsive Dialog
 * over the stable gallery pool with filter chips for the ImageTypes actually
 * present (Perenual images are already filtered upstream, so "Main" never shows).
 * Clicking a thumbnail hands the FILTERED subset + index back to the page, which
 * reuses the existing PhotoLightbox.
 */
export default function PlantGalleryDialog({
  open,
  onClose,
  images,
  onSelect,
}: PlantGalleryDialogProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<string>(ALL);

  // Distinct ImageTypes present, in canonical gallery order — `images` is already
  // canonically sorted, so first-seen order is the canonical type order.
  const presentTypes = useMemo(() => {
    const seen: string[] = [];
    for (const img of images) {
      if (!seen.includes(img.imageType)) seen.push(img.imageType);
    }
    return seen;
  }, [images]);

  // Guard against a filter whose type is no longer present (e.g. plant changed).
  const activeFilter =
    filter !== ALL && !presentTypes.includes(filter) ? ALL : filter;

  const filtered = useMemo(
    () =>
      activeFilter === ALL
        ? images
        : images.filter((i) => i.imageType === activeFilter),
    [images, activeFilter]
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      scroll="paper"
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          pr: 1,
        }}
      >
        {t('plantDetail.gallery.dialogTitle')}
        <IconButton
          onClick={onClose}
          aria-label={t('plantDetail.gallery.lightboxClose')}
          edge="end"
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {/* Filter chips only when there's more than one type to choose between. */}
        {presentTypes.length > 1 && (
          <Stack
            direction="row"
            spacing={1}
            flexWrap="wrap"
            useFlexGap
            sx={{ mb: 2 }}
          >
            <Chip
              label={t('plantDetail.gallery.types.all')}
              color={activeFilter === ALL ? 'primary' : 'default'}
              variant={activeFilter === ALL ? 'filled' : 'outlined'}
              onClick={() => setFilter(ALL)}
              size="small"
            />
            {presentTypes.map((type) => (
              <Chip
                key={type}
                label={t(`plantDetail.gallery.types.${type}`, type)}
                color={activeFilter === type ? 'primary' : 'default'}
                variant={activeFilter === type ? 'filled' : 'outlined'}
                onClick={() => setFilter(type)}
                size="small"
              />
            ))}
          </Stack>
        )}

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(2, 1fr)',
              sm: 'repeat(3, 1fr)',
              md: 'repeat(4, 1fr)',
            },
            gap: 1.5,
          }}
        >
          {filtered.map((img, idx) => (
            <Tooltip
              key={img.id}
              title={
                [img.credit, img.licenseName].filter(Boolean).join(' · ') || ''
              }
              placement="top"
              arrow
            >
              <Box
                component="button"
                type="button"
                onClick={() => onSelect(filtered, idx)}
                aria-label={t('plantDetail.gallery.openTile', {
                  index: idx + 1,
                })}
                sx={{
                  position: 'relative',
                  aspectRatio: '1 / 1',
                  borderRadius: 2,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  bgcolor: 'grey.100',
                  p: 0,
                  border: 0,
                  width: '100%',
                  display: 'block',
                  '&:focus-visible': {
                    outline: '2px solid',
                    outlineColor: 'primary.main',
                    outlineOffset: 2,
                  },
                }}
              >
                <Box
                  component="img"
                  src={img.thumbnailUrl ?? img.url}
                  alt={img.imageType}
                  loading="lazy"
                  width={img.width ?? undefined}
                  height={img.height ?? undefined}
                  sx={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
              </Box>
            </Tooltip>
          ))}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
