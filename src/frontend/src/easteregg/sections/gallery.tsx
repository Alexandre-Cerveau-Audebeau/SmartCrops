import { memo } from 'react';
import Box from '@mui/material/Box';
import { useTranslation } from 'react-i18next';
import SectionHeader from '../../components/plantDetail/SectionHeader';
import type { EasterEggEntry } from '../types';
import { EggNotes } from './shared';

/**
 * Section 02 for an easter egg. The catalogue's gallery renders a filmstrip, or
 * its own generic "no photos yet" state when a plant has none; this entry has no
 * photograph and says so in its own words instead, so the shared component is
 * not involved at all.
 */
/*
 * EXEMPTION from the mode-aware half of the section-component guideline, on
 * purpose: this section owns no colour at all. It renders a SectionHeader and
 * an EggNotes card, both of which read theme tokens themselves, and it declares
 * no hex literal, no rgba() and no palette lookup — verified by grep. Reading
 * `palette.mode` here would add a subscription to a value nothing consumes.
 * Add a colour to this file and the rule applies again.
 */
export const EggGallery = memo(function EggGallery({
  egg,
}: {
  egg: EasterEggEntry;
}) {
  const { t } = useTranslation();
  return (
    <Box id="gallery" sx={{ mb: 3 }}>
      <SectionHeader title={t('plantDetail.sections.gallery')} />
      <EggNotes notes={egg.notes.gallery} />
    </Box>
  );
});
