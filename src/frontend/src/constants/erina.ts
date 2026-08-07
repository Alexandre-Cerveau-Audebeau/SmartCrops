/**
 * SMA-394 — content module for the hidden plant page.
 *
 * Everything the easter-egg page renders lives here as typed constants: there
 * is NO database row, NO seed entry and NO Typesense document, so the
 * catalogue count, the facet counts, the planner catalogue and the home
 * statistics are structurally untouched (they all derive from the server).
 * Deleting this file and its two call sites removes the feature entirely.
 *
 * Placed in `constants/` rather than a new `data/` folder because that is the
 * existing convention for local content modules (`techStack.ts` is the same
 * shape: literal project content, `as const`, consumed by one or two pages).
 *
 * Copy is ENGLISH. Japanese appears only where it carries meaning, and every
 * Japanese run is flagged `jp` so the renderer can give it JP_FONT_STACK —
 * the self-hosted Inter subsets carry no kana or kanji (latin, latin-ext,
 * cyrillic, greek, vietnamese only), so unflagged Japanese would fall back to
 * an arbitrary system font.
 */

import type { Plant } from '../types/Plant';

/**
 * The hidden page's URL slug — and, deliberately, the CARD object's `id`.
 * PlantCard renders `to={`/library/${plant.id}`}`, so making the id BE the slug
 * is what links the card to the page with zero change to PlantCard, and what
 * lets App.tsx carry a plain static route. Load-bearing: changing one without
 * the other breaks the link silently.
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
 * never prefix — which is why the page can never be reached by browsing.
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
 * Font stack for Japanese runs. Inter first so latin characters inside a mixed
 * run keep the page's typeface, then the platform CJK faces, then the
 * self-hostable Noto fallback, then the generic.
 */
export const JP_FONT_STACK =
  'Inter, "Hiragino Sans", "Yu Gothic UI", Meiryo, "Noto Sans JP", sans-serif';

/** One run of text. `jp` marks a run that must render with JP_FONT_STACK. */
export interface ErinaSegment {
  readonly text: string;
  readonly jp?: boolean;
  readonly strong?: boolean;
  readonly italic?: boolean;
}

/** A line of copy, split into runs so inline Japanese can be styled. */
export type ErinaRich = readonly ErinaSegment[];

/** A labelled row of a definition-style table. */
export interface ErinaRow {
  readonly label: string;
  readonly value: ErinaRich;
}

/** A three-column observation row. */
export interface ErinaObservation {
  readonly date: string;
  readonly location: string;
  readonly note: ErinaRich;
  /** Marks the row the content calls out as the key observation. */
  readonly key?: boolean;
}

// Segment builders — keep the literals below readable.
const s = (text: string): ErinaSegment => ({ text });
const jp = (text: string): ErinaSegment => ({ text, jp: true });
const b = (text: string): ErinaSegment => ({ text, strong: true });
const i = (text: string): ErinaSegment => ({ text, italic: true });

// ── 01 · Hero ──────────────────────────────────────────────────────────────

/** Displayed common name. Japanese — needs JP_FONT_STACK. */
export const ERINA_DISPLAY_NAME = 'えりな J';

/** Binomial shown under the title, in italics like a real plant page. */
export const ERINA_SCIENTIFIC_NAME = 'Erina J.';

// Two hero values the library CARD also shows (PlantCard reads `sunExposure`
// and `waterNeeds`). Named constants so the card and the page cannot drift.
const SUN_EXPOSURE = 'Full sun · 8+ hours';
const WATER_NEEDS = 'Frequent, and particular';

/**
 * Hero trait table. Height and spread are deliberately absent, so the page
 * renders no size gauges at all.
 */
export const ERINA_HERO_ROWS: readonly ErinaRow[] = [
  {
    label: 'Plant type',
    value: [s('Ornamental — though the label undersells it')],
  },
  { label: 'Sun exposure', value: [s(SUN_EXPOSURE)] },
  { label: 'Water needs', value: [s(WATER_NEEDS)] },
  {
    label: 'Care level',
    value: [s("Easy, if you pay attention. Impossible, if you don't.")],
  },
  { label: 'Life cycle', value: [s('Perennial')] },
  { label: 'Growth rate', value: [s('Radiant')] },
  { label: 'Hardiness zone', value: [s('10b – 11a')] },
  { label: 'Min / max temperature', value: [s('16 °C / 27 °C')] },
  {
    label: 'Soil pH',
    value: [s('6.8 – 7.2 (perfectly balanced, like everything about her)')],
  },
  {
    label: 'Attracts pollinators',
    value: [
      b('Yes — one. Exclusively.'),
      s(
        ' A blond, blue-eyed French specimen. Highly territorial. Shows no interest in any other plant.'
      ),
    ],
  },
];

// ── 02 · About (folded into the hero card, as on the real page) ────────────

export const ERINA_ABOUT: readonly ErinaRich[] = [
  [
    s(
      'The most beautiful plant on this site, and — the author is prepared to defend this — the most beautiful plant in the world.'
    ),
  ],
  [
    s(
      'Native to Japan, and a remarkably successful export. First recorded travelling through Dubai, then Boston, then San Francisco, then Los Angeles. Reliable reports place a Paris appearance in the near future.'
    ),
  ],
  [
    s(
      'Known to charm absolutely anyone within range, with no effort on her part. Observers in San Francisco noted that the '
    ),
    jp('月'),
    s(
      ' has looked unusually beautiful ever since she was found there — and considerably more so after an evening at the White Rabbit.'
    ),
  ],
  [
    s(
      'Elegant. Radiant. Sensitive to changes in temperature, in both directions.'
    ),
  ],
  [
    s(
      'She is fond of ice — not the kind you would assume, and essentially only the kind made by '
    ),
    jp('アレックス'),
    s('.'),
  ],
  [
    s(
      'Requires a great deal of water. Not boring tap water: mostly sparkling water, the sort you find at Daiso. A matcha will brighten her whole day.'
    ),
  ],
  [s('She loves dogs. Unreasonably. Immediately. Every single one.')],
  [
    s(
      'A bit messy, yet somehow always very clean — a combination botanists have not managed to explain.'
    ),
  ],
];

/** Flatten a rich line to plain text, for the places that need a bare string. */
export const flattenRich = (line: ErinaRich): string =>
  line.map((seg) => seg.text).join('');

// ── 02b · The library card ─────────────────────────────────────────────────

/**
 * The object handed to PlantCard when the key is typed, so the hidden plant
 * appears as an ordinary result in the grid and links to its own page.
 *
 * Typed as a full `Plant` on purpose: the compiler then guarantees the shape
 * stays valid if the DTO changes. Only the fields PlantCard actually reads
 * carry content —
 *   `id`               → `to={`/library/${plant.id}`}`   ⭐ the link
 *   `commonName`       → the card title (via capitalizeFirst)
 *   `scientificName`   → the italic subtitle, and the title's fallback
 *   `imageUrl`         → CardMedia
 *   `description`      → the 2-line clamped blurb
 *   `sunExposure`      → the "Sun: …" footer half
 *   `waterNeeds`       → the "Water: …" footer half
 *   `imageAttribution` → LEFT NULL: our own artwork carries no credit line
 * — everything else is the neutral empty value.
 *
 * `plantTypeId` is 0 deliberately: it matches no row of `/api/planttypes`, so
 * the type chip simply does not render and the card never depends on a
 * database primary key. Hard-coding a real id here would silently mislabel the
 * card if plant types were ever reseeded.
 */
export const ERINA_CARD: Plant = {
  id: ERINA_SLUG,
  scientificName: ERINA_SCIENTIFIC_NAME,
  plantTypeId: 0,
  plantType: null,

  sunExposure: SUN_EXPOSURE,
  waterNeeds: WATER_NEEDS,
  sowingPeriod: null,
  harvestPeriod: null,
  imageUrl: ERINA_CARD_IMAGE,
  imageAttribution: null,
  commonName: ERINA_DISPLAY_NAME,
  description: flattenRich(ERINA_ABOUT[0]),

  gbifTaxonKey: null,
  family: null,
  genus: null,
  speciesEpithet: null,
  author: null,
  wfoId: null,
  year: null,

  lifeCycle: null,
  growthRate: null,
  wateringNeedLevel: null,
  careLevel: null,
  growthHabit: null,

  hardinessZoneMin: null,
  hardinessZoneMax: null,
  minHeightCm: null,
  maxHeightCm: null,
  minSpreadCm: null,
  maxSpreadCm: null,
  soilPhMin: null,
  soilPhMax: null,
  lightLevel: null,
  soilNutriments: null,
  minTempC: null,
  maxTempC: null,

  isEdible: null,
  isVegetable: null,
  isMedicinal: null,
  isIndoor: null,
  isDroughtTolerant: null,
  isSaltTolerant: null,
  isThorny: null,
  isInvasive: null,
  isTropical: null,
  isToxicToHumans: null,
  isToxicToPets: null,
  attractsPollinators: null,

  flowerColors: null,
  nativeRegions: null,
  introducedRegions: null,
  edibleParts: null,
  sowingInstructions: null,
  propagationInstructions: null,

  enrichmentSources: [],
  lastEnrichmentAt: null,

  createdAt: '',
  updatedAt: '',

  images: [],
  longDescriptions: [],
  commonNames: [],
  pests: [],
  synonyms: [],
  sources: [],

  trefleData: null,
  perenualData: null,
};

// ── 03 · Photo gallery ─────────────────────────────────────────────────────

/**
 * The gallery is empty BY DESIGN. The page carries no image: the gallery only
 * keeps images sourced from Trefle or PlantNet, and `creditLine()` falls back
 * to a hard-coded 'Trefle · CC-BY-SA' — so any picture here would ship a
 * fabricated credit and licence.
 */
export const ERINA_GALLERY_EMPTY: readonly string[] = [
  'No photographs on record.',
  'Some specimens are better seen in person, and this one is worth the trip.',
];

// ── 04 · World distribution ────────────────────────────────────────────────

export const ERINA_NATIVE_RANGE = 'Japan';
export const ERINA_DISTRIBUTION = 'Japan · California · France (soon)';
export const ERINA_ROUTE_CAPTION = 'Recorded migration path, in order:';

/** Six labelled stops. The last one has not happened yet. */
export const ERINA_ROUTE: readonly { name: string; pending?: boolean }[] = [
  { name: 'Japan' },
  { name: 'Dubai' },
  { name: 'Boston' },
  { name: 'San Francisco' },
  { name: 'Los Angeles' },
  { name: 'Paris', pending: true },
];

// ── 05 · Calendar & dormancy ───────────────────────────────────────────────

export const ERINA_DORMANCY_TITLE =
  'Dormancy — the defining trait of the species.';

export const ERINA_DORMANCY_BODY: ErinaRich = [
  s(
    'This plant sleeps. Substantially, and with real conviction. Field observations confirm successful dormancy achieved while eating, while riding in a car, and — documented, verified — during a live classical concert.'
  ),
];

export const ERINA_PROTOCOL_TITLE = 'Morning contact protocol.';
export const ERINA_PROTOCOL_BODY =
  "The specimen's recorded response to an early call is, reliably and almost without variation:";
/** Japanese — needs JP_FONT_STACK. */
export const ERINA_PROTOCOL_RESPONSE = 'ごろごろベッド';

export interface ErinaPhase {
  readonly phase: string;
  readonly period: string;
  readonly notes: string;
}

export const ERINA_PHASES: readonly ErinaPhase[] = [
  {
    phase: 'Dormancy',
    period: 'Year-round, opportunistic',
    notes: 'Can occur anywhere, without warning. Do not disturb.',
  },
  {
    phase: 'Morning emergence',
    period: 'Delayed',
    notes: 'See contact protocol above. Patience required.',
  },
  {
    phase: 'Peak radiance',
    period: 'Late morning onward',
    notes: 'Requires prior completion of dormancy',
  },
  { phase: 'Feeding', period: 'Continuous', notes: 'Extensive.' },
  {
    phase: 'Travel season',
    period: 'Whenever possible',
    notes: 'See distribution',
  },
  {
    phase: 'Flowering',
    period: 'On sight of a dog',
    notes: 'Immediate, involuntary',
  },
];

// ── 06 · Characteristics ───────────────────────────────────────────────────

export const ERINA_CHARACTERISTICS: readonly ErinaRow[] = [
  { label: 'Humidity', value: [b('Low')] },
  { label: 'Light', value: [b('High'), s(' — a great deal of it')] },
  {
    label: 'Frost tolerance',
    value: [b('Very low.'), s(' Gets cold easily. Keep her warm.')],
  },
  {
    label: 'Preferred climate',
    value: [s('Los Angeles: never too hot, and never, ever cold')],
  },
  { label: 'Habit', value: [s('A bit messy, yet very clean')] },
  { label: 'Toxic to humans', value: [s('No')] },
  {
    label: 'Toxic to pets',
    value: [s('No — actively adores them, dogs above all')],
  },
  { label: 'Thorny', value: [s('Only when insufficiently rested')] },
  { label: 'Edible', value: [s('No. Fond of eating, though.')] },
];

// ── 07 · Cultivation & greenhouse ──────────────────────────────────────────

export const ERINA_SPACING: ErinaRich = [
  s(
    '80 % of the bed, minimum. Non-negotiable. Any attempt to reduce this allocation will fail.'
  ),
];

/** Preferred water quality. The third entry is Japanese. */
export const ERINA_WATER: readonly ErinaRich[] = [
  [s('Japanese water')],
  [s('Sparkling MTN WTR')],
  [jp('ほうじ茶'), s(' (hojicha)')],
  [s('Matcha latte — whole milk, lactose-free, unsweetened')],
  [s('Strawberry jam')],
  [s('Tiramisu, and matcha tiramisu above all')],
];

export const ERINA_CULTIVATION_ROWS: readonly ErinaRow[] = [
  {
    label: 'Feeding',
    value: [
      s(
        'Enthusiastic and continuous. A genuinely serious food enthusiast, with excellent taste and firm opinions.'
      ),
    ],
  },
  {
    label: 'Topical care',
    value: [
      s(
        'Responds exceptionally well to skincare. Shiseido and La Roche-Posay give documented results.'
      ),
    ],
  },
  {
    label: 'Greenhouse conditions',
    value: [
      s(
        'Mild and stable. Bright light, low humidity, no draughts, and absolutely no frost.'
      ),
    ],
  },
];

// ── 08 · Diseases & pests ──────────────────────────────────────────────────

export const ERINA_PEST_INTRO = 'Primary threat: insects. Tolerance: zero.';

export const ERINA_PESTS: readonly ErinaRow[] = [
  {
    label: 'Cockroaches',
    value: [
      s(
        'The single greatest documented threat. Presence triggers an immediate and total defensive response.'
      ),
    ],
  },
  {
    label: 'Grasshoppers',
    value: [s('Not welcome. Unpredictable trajectory considered aggravating.')],
  },
  { label: 'Flies', value: [s('Persistent, and therefore unforgivable.')] },
];

export const ERINA_PEST_TREATMENT: ErinaRich = [
  s(
    'Recommended treatment in all three cases: complete removal of the pest by another party, ideally '
  ),
  jp('アレックス'),
  s(', ideally before she sees it.'),
];

export const ERINA_PEST_OUTRO =
  'No known diseases. Remarkably robust, provided she has slept.';

// ── 09 · Common names ──────────────────────────────────────────────────────

export interface ErinaCommonName {
  readonly language: string;
  readonly names: ErinaRich;
}

export const ERINA_COMMON_NAMES: readonly ErinaCommonName[] = [
  { language: 'French', names: [s('Mon Cœur · Mon Amour · Ma Chérie')] },
  { language: 'Japanese', names: [jp('えりちゃん')] },
  { language: 'English', names: [s('Honey · Lovely Thing · My Love')] },
];

// ── 10 · Botanical synonyms ────────────────────────────────────────────────

export interface ErinaSynonym {
  readonly name: string;
  readonly gloss: ErinaRich;
}

export const ERINA_SYNONYMS: readonly ErinaSynonym[] = [
  { name: 'Erina japonica', gloss: [s('syn. '), jp('えりちゃん')] },
  { name: 'Cordis mei', gloss: [s('syn. Mon Cœur')] },
  { name: 'Amor meus', gloss: [s('syn. Mon Amour')] },
  { name: 'Cara mea', gloss: [s('syn. Ma Chérie')] },
  {
    name: 'Erina j. var. hikari',
    gloss: [s('the radiant variety; the only one ever recorded')],
  },
];

// ── 11 · Observations & phenology ──────────────────────────────────────────

export const ERINA_OBSERVATIONS: readonly ErinaObservation[] = [
  { date: 'Origin', location: 'Japan', note: [s('Type locality')] },
  { date: '—', location: 'Dubai', note: [s('In transit. Thrived.')] },
  { date: '—', location: 'Boston', note: [s('Summer only.')] },
  {
    date: '—',
    location: 'San Francisco',
    note: [
      s('Key observation. The '),
      jp('月'),
      s(' recorded as unusually beautiful from this date onward.'),
    ],
    key: true,
  },
  {
    date: '—',
    location: 'San Francisco — White Rabbit',
    note: [s('Effect intensified. Considered decisive by the observer.')],
  },
  {
    date: '—',
    location: 'Los Angeles',
    note: [s('Optimal conditions. Specimen at peak.')],
  },
  {
    date: 'Soon',
    location: 'Paris',
    note: [s('Anticipated. Preparations under way.')],
  },
];

// ── 12 · Resources ─────────────────────────────────────────────────────────

/**
 * Things she loves — never routes to her. Deliberately label-only: this page
 * and this repository are public, the specimen is a real person, and no URL
 * here has been verified, so none is invented.
 */
export const ERINA_RESOURCES: readonly ErinaRow[] = [
  { label: 'Studio Ghibli', value: [s('essential viewing, repeatedly')] },
  { label: 'Shiseido', value: [s('see cultivation — topical care')] },
  { label: 'La Roche-Posay', value: [s('idem')] },
  { label: 'Daiso', value: [s('primary sparkling-water source')] },
  {
    label: 'The White Rabbit, San Francisco',
    value: [s('see observations')],
  },
];

// ── 13 · Similar plants ────────────────────────────────────────────────────

export const ERINA_SIMILAR_TITLE = 'None.';
export const ERINA_SIMILAR_BODY: readonly ErinaRich[] = [
  [
    s(
      'There are no similar plants in the world. This one is entirely unique — only one like her exists.'
    ),
  ],
  [s('And someone very happy knows it.')],
];

// ── 14 · FAQ ───────────────────────────────────────────────────────────────

/** Nine questions. The fifth is Japanese. */
export const ERINA_FAQ: readonly ErinaRich[] = [
  [s('Can you make some crêpes, or ratatouille, or ice cream?')],
  [s('Did you sleep well?')],
  [s('Do you love me?')],
  [s('Did you wash your hands?')],
  [jp('げんき？')],
  [s('Where do you want to go?')],
  [s('Do you like my nails?')],
  [s('What did you eaaaat?')],
  [s('Can we share?')],
];

// ── 15 · Propagation notes ─────────────────────────────────────────────────

export const ERINA_PROPAGATION: readonly ErinaRich[] = [
  [
    s(
      'Propagation by division is not possible and has never been attempted. This specimen does not divide.'
    ),
  ],
  [
    s(
      'Best results are consistently reported when grown together, in the same place, over a long period. Light, warmth, matcha, dogs, and sleep. A job she genuinely loves, with generous leave — five weeks minimum, French standard. Nothing else is required.'
    ),
  ],
  [s('Nobody loves her more than '), jp('アレックス'), s('.')],
];

/** The last line on the page, standing alone. */
export const ERINA_CLOSING: ErinaRich = [i('Would you like to live with me?')];
