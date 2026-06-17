import type { PlantImage } from '../types/Plant';

/**
 * Compose a gallery image's attribution line from its raw fields, in the approved
 * design format "© credit · source · license" (3 parts, middle-dot). Single source
 * of truth for both the inline gallery (PlantGallerySection) and the lightbox.
 *
 * Deliberately NOT the server-composed {@link PlantImage.attribution}: that ships
 * a different shape ("© credit — license", 2 parts, no source) than the design.
 * Aligning the backend `ImageAttribution.Compose` to this format is tracked in
 * SMA-180; until then the frontend owns its own format. Parts that are absent are
 * skipped, so a missing credit/license never leaves a dangling separator.
 */
export function composeImageAttribution(img: PlantImage): string {
  return [img.credit ? `© ${img.credit}` : null, img.source, img.licenseName]
    .filter(Boolean)
    .join(' · ');
}
