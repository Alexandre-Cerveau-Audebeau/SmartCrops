import type { Plant, PlantPerenualData } from '../types/Plant';

/**
 * SMA-394 — the hidden plant, as DATA.
 *
 * There is no bespoke page: `PlantDetail` recognises {@link ERINA_SLUG} and
 * serves {@link ERINA_PLANT} instead of fetching, so the table of contents, the
 * growing-condition gauges, the section gates, the accordions and every
 * responsive rule apply to it unchanged. The job of this file is therefore to
 * FILL a data structure, not to compose markup.
 *
 * Nothing here touches the server: no database row, no seed entry, no Typesense
 * document. The catalogue count, the facet counts, the planner catalogue and the
 * home statistics all derive from the API, which knows nothing about this plant.
 *
 * Placed in `constants/` following `techStack.ts`, the existing convention for
 * local content modules.
 */

/**
 * The page's URL slug — and, deliberately, the CARD object's `id`. PlantCard
 * renders `to={`/library/${plant.id}`}`, so making the id BE the slug is what
 * links card to page with zero change to PlantCard, and what lets the EXISTING
 * dynamic `/library/:id` route serve it with no new route at all.
 */
export const ERINA_SLUG = 'erina-j-mon-coeur-since-october-31-2024';

/**
 * Our own artwork (`public/images/plants/erina-j.svg`) — same 400×400 box as
 * PLANT_HERO_PLACEHOLDER so the card grid cannot shift. No photograph, no
 * third-party asset, therefore no credit and no licence line.
 */
export const ERINA_CARD_IMAGE = '/images/plants/erina-j.svg';

/**
 * Accepted search keys, already normalised (trimmed, lower-cased, internal
 * whitespace collapsed). Matching is EXACT against this set — never fuzzy,
 * never prefix — which is why the plant can never be reached by browsing.
 */
export const SECRET_KEYS: ReadonlySet<string> = new Set([
  'erina_j',
  'erina j',
  'erinaj',
  'えりな j',
]);

/**
 * True when the raw search text is one of {@link SECRET_KEYS}. Normalises the
 * input the same way the set was written: trim, lower-case, then collapse
 * internal whitespace runs so a double space still matches.
 */
export function isSecretKey(raw: string): boolean {
  return SECRET_KEYS.has(raw.trim().toLowerCase().replace(/\s+/g, ' '));
}

/**
 * Font stack for the Japanese runs. Applied through ONE scoped CSS rule
 * (`.erina-jp` in index.css, set by PlantDetail on its Container for this slug)
 * rather than by editing each section component: the self-hosted Inter subsets
 * carry no kana or kanji, so without it every Japanese string falls back to
 * whatever the operating system happens to pick.
 */
export const JP_FONT_STACK =
  'Inter, "Hiragino Sans", "Yu Gothic UI", Meiryo, "Noto Sans JP", sans-serif';

/** Class name carrying {@link JP_FONT_STACK}; see `index.css`. */
export const ERINA_JP_CLASS = 'erina-jp';

/**
 * The gallery is empty BY DESIGN and says so in its own words. The page carries
 * no image: the gallery only keeps images sourced from Trefle or PlantNet, and
 * `creditLine()` falls back to a hard-coded 'Trefle · CC-BY-SA', so any picture
 * here would ship a fabricated credit and licence.
 */
export const ERINA_GALLERY_EMPTY: readonly string[] = [
  'No photographs on record.',
  'Some specimens are better seen in person, and this one is worth the trip.',
];

const DISPLAY_NAME = 'えりな J';
const SCIENTIFIC_NAME = 'Erina J.';

// Two values the library CARD also shows (PlantCard reads `sunExposure` and
// `waterNeeds`), named so the card and the page cannot drift apart.
const SUN_EXPOSURE = 'Full sun · 8+ hours';
const WATER_NEEDS = 'Frequent, and particular';

// ── The About prose ────────────────────────────────────────────────────────
// Rendered by AboutSection inside the hero card (long description preferred,
// truncated at 360 chars behind a read-more toggle).

const ABOUT: readonly string[] = [
  'The most beautiful plant on this site, and — the author is prepared to defend this — the most beautiful plant in the world.',
  'Native to Japan, and a remarkably successful export. First recorded travelling through Dubai, then Boston, then San Francisco, then Los Angeles. Reliable reports place a Paris appearance in the near future.',
  'Known to charm absolutely anyone within range, with no effort on her part. Observers in San Francisco noted that the 月 has looked unusually beautiful ever since she was found there — and considerably more so after an evening at the White Rabbit.',
  'Elegant. Radiant. Sensitive to changes in temperature, in both directions.',
  'She is fond of ice — not the kind you would assume, and essentially only the kind made by アレックス.',
  'Requires a great deal of water. Not boring tap water: mostly sparkling water, the sort you find at Daiso. A matcha will brighten her whole day.',
  'She loves dogs. Unreasonably. Immediately. Every single one.',
  'A bit messy, yet somehow always very clean — a combination botanists have not managed to explain.',
];

/**
 * Everything in the validated copy that the plant DTO has no dedicated field
 * for. It is appended to the long description rather than dropped, so nothing
 * from the frozen content is lost: the migration path, the dormancy trait, the
 * morning protocol, the phase table, the greenhouse notes, the observation
 * log, the resources, the "no similar plants" verdict, the questions the
 * auto-generated FAQ cannot carry, and the closing line.
 */
const UNPLACED: readonly string[] = [
  'Recorded migration path, in order: Japan → Dubai → Boston → San Francisco → Los Angeles → Paris (pending).',
  'Dormancy — the defining trait of the species. This plant sleeps. Substantially, and with real conviction. Field observations confirm successful dormancy achieved while eating, while riding in a car, and — documented, verified — during a live classical concert.',
  'Morning contact protocol. The specimen’s recorded response to an early call is, reliably and almost without variation: ごろごろベッド.',
  'Phases. Dormancy: year-round, opportunistic — can occur anywhere, without warning; do not disturb. Morning emergence: delayed — see the contact protocol above, patience required. Peak radiance: late morning onward, requires prior completion of dormancy. Feeding: continuous, extensive. Travel season: whenever possible. Flowering: on sight of a dog, immediate and involuntary.',
  'Preferred climate: Los Angeles — never too hot, and never, ever cold. Habit: a bit messy, yet very clean. Thorny only when insufficiently rested. Not edible; fond of eating, though.',
  'Recommended spacing: 80 % of the bed, minimum. Non-negotiable. Any attempt to reduce this allocation will fail.',
  'Feeding: enthusiastic and continuous. A genuinely serious food enthusiast, with excellent taste and firm opinions. Topical care: responds exceptionally well to skincare; Shiseido and La Roche-Posay give documented results. Greenhouse conditions: mild and stable — bright light, low humidity, no draughts, and absolutely no frost.',
  'Primary threat: insects. Tolerance: zero. Recommended treatment in all three cases: complete removal of the pest by another party, ideally アレックス, ideally before she sees it. No known diseases. Remarkably robust, provided she has slept.',
  'Observations and phenology. Japan: type locality. Dubai: in transit, thrived. Boston: summer only. San Francisco: key observation — the 月 recorded as unusually beautiful from this date onward. San Francisco, White Rabbit: effect intensified, considered decisive by the observer. Los Angeles: optimal conditions, specimen at peak. Paris: anticipated, preparations under way.',
  'Things she loves — never routes to her. Studio Ghibli: essential viewing, repeatedly. Shiseido and La Roche-Posay: see topical care. Daiso: primary sparkling-water source. The White Rabbit, San Francisco: see observations.',
  'Similar plants: none. There are no similar plants in the world. This one is entirely unique — only one like her exists. And someone very happy knows it.',
  'Frequently asked. Can you make some crêpes, or ratatouille, or ice cream? Did you sleep well? Do you love me? Did you wash your hands? げんき？ Where do you want to go? Do you like my nails? What did you eaaaat? Can we share?',
  'Propagation by division is not possible and has never been attempted. This specimen does not divide. Best results are consistently reported when grown together, in the same place, over a long period. Light, warmth, matcha, dogs, and sleep. A job she genuinely loves, with generous leave — five weeks minimum, French standard. Nothing else is required.',
  'Nobody loves her more than アレックス.',
  'Would you like to live with me?',
];

/** The full validated copy, in reading order. Paragraph-separated. */
const LONG_DESCRIPTION = [...ABOUT, ...UNPLACED].join('\n\n');

// ── Perenual-shaped data ───────────────────────────────────────────────────
// Drives the hero gauges, section 05 (Scientific data) and section 07 (Culture).

const ERINA_PERENUAL: PlantPerenualData = {
  id: 'erina-pd',
  perenualId: 0,
  requestedPerenualId: null,
  cultivar: null,
  perenualType: null,
  originCountries: null,
  // Section 07 — "Best results are reported when grown together, in the same
  // place, over a long period", and the plant does not divide.
  propagationMethods: 'Grown together',
  pruningMonths: null,
  // Section 07 — "Requires a great deal of water."
  wateringBenchmark: 'Frequent, and particular',
  wateringBenchmarkUnit: null,
  sunlightPreferences: null,
  maintenance: null,
  // Section 04 — "Flowering: on sight of a dog, immediate and involuntary" has
  // no month token, so the calendar's flowering track stays empty by design.
  floweringSeason: null,
  harvestSeason: null,
  hasEdibleFruit: null,
  hasEdibleLeaves: null,
  isCulinary: null,
  plantAnatomyJson: null,
  apiVersion: null,
  // Gate for section 05, together with at least one x* field below.
  hasSupremeData: true,
  lastSyncAt: '2024-10-31T00:00:00Z',
  // "Full sun · 8+ hours" → an open-ended 8+ range, which also drives the
  // Characteristics light bar (avg ≥ 6 → "Full sun").
  xSunlightHoursMin: 8,
  xSunlightHoursMax: null,
  // "Soil pH 6.8 – 7.2 (perfectly balanced, like everything about her)"
  xWateringPhMin: 6.8,
  xWateringPhMax: 7.2,
  // "Min / max temperature 16 °C / 27 °C"
  xWateringBasedTempMinC: 16,
  xWateringBasedTempMaxC: 27,
  // "Frost tolerance: very low. Gets cold easily. Keep her warm."
  xTemperatureToleranceMinC: 16,
  xTemperatureToleranceMaxC: 27,
  // Spacing is "80 % of the bed, minimum" — a proportion, not a length. Left
  // null rather than inventing a centimetre figure: no size number appears
  // anywhere on this page, and the frozen copy contains none.
  xPlantSpacingValue: null,
  xPlantSpacingUnit: null,
  // Section 05 — the preferred-water list.
  xWateringQualityJson: JSON.stringify([
    'Japanese water',
    'Sparkling MTN WTR',
    'ほうじ茶 (hojicha)',
    'Matcha latte — whole milk, lactose-free, unsweetened',
    'Strawberry jam',
    'Tiramisu, and matcha tiramisu above all',
  ]),
  xWateringPeriodJson: null,
};

// ── The plant ──────────────────────────────────────────────────────────────

/**
 * The object PlantDetail renders for {@link ERINA_SLUG}. Same shape as the
 * `makePlant` factory that PlantDetail.test.tsx already builds by hand and
 * renders the whole page with — which is the existing proof that a
 * locally-constructed Plant drives every section.
 *
 * Height and spread are ALL null on purpose: no size figure appears anywhere on
 * this page, so the height gauge is deliberately dark. Nothing is filled merely
 * to light a gauge up.
 */
export const ERINA_PLANT: Plant = {
  id: ERINA_SLUG,
  scientificName: SCIENTIFIC_NAME,
  // Ornamental — the type the frozen copy names ("Ornamental — though the label
  // undersells it"), and one of the five types the app knows. The id is 0 on
  // purpose: the detail page reads `plantType.name`, never the id, so nothing
  // here depends on a database primary key.
  plantTypeId: 0,
  plantType: { id: 0, name: 'Ornamental', description: null },

  sunExposure: SUN_EXPOSURE,
  waterNeeds: WATER_NEEDS,
  // Section 04 — "Dormancy: year-round, opportunistic" and "Travel season:
  // whenever possible" are the only two phases the copy states in calendar
  // terms; both map to the full year.
  sowingPeriod: 'year-round',
  harvestPeriod: 'year-round',
  imageUrl: ERINA_CARD_IMAGE,
  imageAttribution: null,
  commonName: DISPLAY_NAME,
  description: ABOUT[0],

  // Null on purpose: a taxon key would imply a GBIF record that does not exist.
  gbifTaxonKey: null,
  family: 'Erinaceae',
  genus: 'Erina',
  speciesEpithet: 'J.',
  author: 'A.C.-A.',
  wfoId: null,
  year: 2024,

  lifeCycle: 'Perennial',
  growthRate: 'High',
  wateringNeedLevel: 'Frequent',
  careLevel: 'Easy',
  growthHabit: null,

  hardinessZoneMin: 10,
  hardinessZoneMax: 11,
  // 🔴 Deliberately null — no size figure appears anywhere on this page.
  minHeightCm: null,
  maxHeightCm: null,
  minSpreadCm: null,
  maxSpreadCm: null,
  soilPhMin: 6.8,
  soilPhMax: 7.2,
  lightLevel: 9,
  soilNutriments: null,
  minTempC: 16,
  maxTempC: 27,

  isEdible: false,
  isVegetable: false,
  isMedicinal: null,
  // "Greenhouse conditions: mild and stable … absolutely no frost."
  isIndoor: true,
  // "Requires a great deal of water."
  isDroughtTolerant: false,
  isSaltTolerant: null,
  // "Thorny: only when insufficiently rested."
  isThorny: true,
  isInvasive: false,
  isTropical: false,
  isToxicToHumans: false,
  // "Toxic to pets: no — actively adores them, dogs above all."
  isToxicToPets: false,
  // "Attracts pollinators: yes — one. Exclusively."
  attractsPollinators: true,

  flowerColors: null,
  // TDWG level-3 tokens, so section 06's region pills resolve to continents.
  // "Boston" has no Massachusetts token in the vocabulary; North America is
  // already carried by California, so the pills are unaffected.
  nativeRegions: JSON.stringify(['Japan']),
  introducedRegions: JSON.stringify(['Gulf States', 'California', 'France']),
  edibleParts: null,
  sowingInstructions: null,
  propagationInstructions: null,

  // Honest provenance: this entry was written by hand. It is NOT enriched from
  // GBIF, Trefle or Perenual, and claiming otherwise would be a false source.
  enrichmentSources: ['Manual'],
  lastEnrichmentAt: null,

  createdAt: '2024-10-31T00:00:00Z',
  updatedAt: '2024-10-31T00:00:00Z',

  translations: [
    {
      id: 1,
      language: 'en',
      commonName: DISPLAY_NAME,
      description: ABOUT[0],
    },
    {
      id: 2,
      language: 'fr',
      commonName: DISPLAY_NAME,
      description: ABOUT[0],
    },
  ],

  longDescriptions: [
    {
      id: 1,
      language: 'en',
      longDescription: LONG_DESCRIPTION,
      sourceMethod: null,
    },
  ],

  // Deliberately empty — see ERINA_GALLERY_EMPTY.
  images: [],

  commonNames: [
    { id: 1, languageCode: 'fr', name: 'Mon Cœur', isPrimary: true },
    { id: 2, languageCode: 'fr', name: 'Mon Amour', isPrimary: false },
    { id: 3, languageCode: 'fr', name: 'Ma Chérie', isPrimary: false },
    { id: 4, languageCode: 'ja', name: 'えりちゃん', isPrimary: true },
    { id: 5, languageCode: 'en', name: 'Honey', isPrimary: true },
    { id: 6, languageCode: 'en', name: 'Lovely Thing', isPrimary: false },
    { id: 7, languageCode: 'en', name: 'My Love', isPrimary: false },
  ],

  pests: [
    {
      id: 1,
      name: 'Cockroaches',
      type: 'Insect',
      description:
        'The single greatest documented threat. Presence triggers an immediate and total defensive response.',
      symptoms: null,
      solutions: null,
      imageUrl: null,
      source: 'Manual',
      sourceExternalId: null,
    },
    {
      id: 2,
      name: 'Grasshoppers',
      type: 'Insect',
      description:
        'Not welcome. Unpredictable trajectory considered aggravating.',
      symptoms: null,
      solutions: null,
      imageUrl: null,
      source: 'Manual',
      sourceExternalId: null,
    },
    {
      id: 3,
      name: 'Flies',
      type: 'Insect',
      description: 'Persistent, and therefore unforgivable.',
      symptoms: null,
      solutions: null,
      imageUrl: null,
      source: 'Manual',
      sourceExternalId: null,
    },
  ],

  synonyms: [
    { id: 1, synonym: 'Erina japonica', authority: 'syn. えりちゃん' },
    { id: 2, synonym: 'Cordis mei', authority: 'syn. Mon Cœur' },
    { id: 3, synonym: 'Amor meus', authority: 'syn. Mon Amour' },
    { id: 4, synonym: 'Cara mea', authority: 'syn. Ma Chérie' },
    {
      id: 5,
      synonym: 'Erina j. var. hikari',
      authority: 'the radiant variety; the only one ever recorded',
    },
  ],

  // No external cross-references: there is no upstream record to point at.
  sources: [],

  trefleData: null,
  perenualData: ERINA_PERENUAL,
};

// ── The library card ───────────────────────────────────────────────────────

/**
 * The object handed to PlantCard when the key is typed, so the hidden plant
 * appears as an ordinary result in the grid and links to its own page.
 *
 * Derived from {@link ERINA_PLANT} so the card and the page can never drift:
 * only the flat list-DTO fields PlantCard reads are overridden. `plantTypeId`
 * is 0, which matches no row of `/api/planttypes`, so the type chip does not
 * render and the card never depends on a database primary key.
 * `imageAttribution` stays null — our own artwork carries no credit line.
 */
export const ERINA_CARD: Plant = {
  ...ERINA_PLANT,
  translations: undefined,
};
