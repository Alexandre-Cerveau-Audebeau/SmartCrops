import { memo } from 'react';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface PlantBreadcrumbProps {
  libraryLabel: string;
  libraryHref: string;
  typeLabel?: string | null;
  currentLabel: string;
}

/**
 * Hierarchical breadcrumb for Plant Detail v2 (SMA-246): Library › Type › Plant.
 * Replaces the redundant "back to library" button when the user arrives from the
 * Library. The middle Type segment is omitted when the plant has no type. The
 * Library segment is a RouterLink (the page's idiomatic navigation); the Type and
 * current segments are plain text, the current one carrying `aria-current="page"`.
 * Mode-aware via theme tokens (primary / text.secondary / heading) — no literal
 * colors. The aria-label is localized to match the rest of the page (e.g. the
 * sibling TOC nav).
 */
export const PlantBreadcrumb = memo(function PlantBreadcrumb({
  libraryLabel,
  libraryHref,
  typeLabel,
  currentLabel,
}: PlantBreadcrumbProps) {
  const { t } = useTranslation();

  return (
    <Breadcrumbs
      separator="›"
      aria-label={t('plantDetail.breadcrumb.ariaLabel')}
      sx={{ mb: 3, fontSize: 13 }}
    >
      <Link
        component={RouterLink}
        to={libraryHref}
        underline="hover"
        sx={{ fontSize: 13, fontWeight: 500, color: 'primary.main' }}
      >
        {libraryLabel}
      </Link>
      {typeLabel ? (
        <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
          {typeLabel}
        </Typography>
      ) : null}
      <Typography
        aria-current="page"
        sx={{ fontSize: 13, fontWeight: 700, color: 'heading' }}
      >
        {currentLabel}
      </Typography>
    </Breadcrumbs>
  );
});
