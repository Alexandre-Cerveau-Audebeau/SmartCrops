/**
 * SMA-394: every piece of markup this feature owns.
 *
 * Each file here is the easter-egg counterpart of one plantDetail section: its
 * JSX copied verbatim from the shared component, wired to an entry instead of
 * to the catalogue's DTO derivations. The shared components carry no trace of
 * this feature, and deleting this folder deletes the whole thing.
 */
export { EggCard, EggFinalLine, EggGauges, EggNotes } from './shared';
export { EggGallery } from './gallery';
export { EggDistribution } from './distribution';
export { EggLifecycle } from './lifecycle';
export { EggScientific } from './scientific';
export { EggCharacteristics } from './characteristics';
export { EggCulture } from './culture';
export { EggPests } from './pests';
export { EggObservations } from './observations';
export { EggResources } from './resources';
export { EggSimilar } from './similar';
export { EggFaq } from './faq';
