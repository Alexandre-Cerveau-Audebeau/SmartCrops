import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useLanguage } from '../../hooks/useLanguage';
import type { Plant } from '../../types/Plant';
import { pickLongDescription } from '../../utils/plantDetail';
import { resolveTranslatedField } from '../../utils/getTranslation';

const DESCRIPTION_TRUNCATE_CHARS = 360;

/**
 * "About" description block for Plant Detail v2 (SMA-178 part A). Extracted from
 * the standalone `about` card and folded into the Overview card, so it renders
 * just the content (a discreet "About" subtitle + the description) rather than a
 * full section header. Prefers the rich long description (truncated with a
 * read-more toggle + source attribution) and falls back to the short translated
 * description. Pure: the parent only mounts it when a description exists, keeping
 * the TOC in sync.
 */
export default function AboutSection({ plant }: { plant: Plant }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [descExpanded, setDescExpanded] = useState(false);

  const longDescription = useMemo(
    () => pickLongDescription(plant.longDescriptions, language),
    [plant.longDescriptions, language]
  );
  const shortDescription = resolveTranslatedField(
    plant,
    language,
    'description'
  );

  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
        {t('plantDetail.sections.about')}
      </Typography>
      {longDescription ? (
        <>
          <Typography
            id="about-description"
            variant="body1"
            sx={{ lineHeight: 1.8, whiteSpace: 'pre-wrap' }}
          >
            {descExpanded ||
            longDescription.longDescription.length <= DESCRIPTION_TRUNCATE_CHARS
              ? longDescription.longDescription
              : `${longDescription.longDescription.slice(0, DESCRIPTION_TRUNCATE_CHARS).trimEnd()}…`}
          </Typography>
          {longDescription.longDescription.length >
            DESCRIPTION_TRUNCATE_CHARS && (
            <Button
              size="small"
              onClick={() => setDescExpanded((v) => !v)}
              aria-expanded={descExpanded}
              aria-controls="about-description"
              sx={{ mt: 1, textTransform: 'none' }}
            >
              {descExpanded
                ? t('plantDetail.description.readLess')
                : t('plantDetail.description.readMore')}
            </Button>
          )}
          {longDescription.sourceMethod && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mt: 1.5, display: 'block' }}
            >
              {t('plantDetail.description.sourceLabel', {
                source: longDescription.sourceMethod,
              })}
            </Typography>
          )}
        </>
      ) : shortDescription ? (
        <Typography variant="body1" sx={{ lineHeight: 1.8 }}>
          {shortDescription}
        </Typography>
      ) : null}
    </Box>
  );
}
