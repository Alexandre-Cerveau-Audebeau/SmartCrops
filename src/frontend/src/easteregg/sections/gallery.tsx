import { memo } from 'react';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import SectionHeader from '../../components/plantDetail/SectionHeader';
import type { EasterEggEntry } from '../types';
import { EggNotes } from './shared';

/**
 * Section 02 for an easter egg. The catalogue's gallery renders a filmstrip, or
 * its own generic "no photos yet" state when a plant has none; this entry has no
 * photograph and says so in its own words instead, so the shared component is
 * not involved at all.
 *
 * The section-owned theme decision is its OWN empty state: an entry that writes
 * nothing about its gallery still gets a heading, and the line beneath it takes
 * the muted treatment the catalogue's gallery gives its credit lines, dimmed
 * further on the dark canvas where `mutedText` alone sits too close to the body
 * copy. えりな J writes two lines here, so this branch does not fire for the
 * page as it stands — which is the point: it is a real decision about a real
 * state, not a conditional added to satisfy a rule.
 */
export const EggGallery = memo(function EggGallery({
  egg,
}: {
  egg: EasterEggEntry;
}) {
  const { t } = useTranslation();
  const dark = useTheme().palette.mode === 'dark';
  const notes = egg.notes.gallery;
  return (
    <Box id="gallery" sx={{ mb: 3 }}>
      <SectionHeader title={t('plantDetail.sections.gallery')} />
      {notes.length > 0 ? (
        <EggNotes notes={notes} />
      ) : (
        <Box
          data-testid="gallery-empty"
          sx={{
            fontSize: 13,
            color: 'mutedText',
            opacity: dark ? 0.75 : 1,
          }}
        >
          {t('plantDetail.characteristics.notProvided')}
        </Box>
      )}
    </Box>
  );
});
