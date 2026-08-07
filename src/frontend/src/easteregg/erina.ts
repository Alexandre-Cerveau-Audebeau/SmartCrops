import type { Plant, PlantPerenualData } from '../types/Plant';
import type { EasterEggEntry } from './types';
import { buildCardArtwork } from './artwork';

/**
 * SMA-394 — the hidden plant, as data. Every string here is taken verbatim from
 * the validated copy; each one is mapped to the section it belongs to, so no
 * section falls back to the site's generic placeholder and nothing spills into
 * the About.
 */

const SLUG = 'erina-j-mon-coeur-since-october-31-2024';
const DISPLAY_NAME = 'えりな J';
const SCIENTIFIC_NAME = 'Erina J.';

/**
 * Inter's self-hosted subsets cover latin, latin-ext, cyrillic, greek and
 * vietnamese — no kana, no kanji. Without this stack every Japanese run falls
 * back to whatever the operating system picks.
 */
const FONT_STACK =
  'Inter, "Hiragino Sans", "Yu Gothic UI", Meiryo, "Noto Sans JP", sans-serif';

const CARD_IMAGE = buildCardArtwork(DISPLAY_NAME);

// ── §02 About — these EIGHT paragraphs, and nothing else ───────────────────

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

// ── The Plant object PlantDetail renders ───────────────────────────────────
// It carries only what the real page's own chrome reads: the hero identity, the
// chips, the breadcrumb and the two sections whose real components can hold
// this content (common names, gallery-empty). Everything else is overridden by
// the section fields further down, so no field is filled just to open a gate.

const PERENUAL: PlantPerenualData = {
  id: 'erina-pd',
  perenualId: 0,
  requestedPerenualId: null,
  cultivar: null,
  perenualType: null,
  originCountries: null,
  propagationMethods: null,
  pruningMonths: null,
  wateringBenchmark: null,
  wateringBenchmarkUnit: null,
  sunlightPreferences: null,
  maintenance: null,
  floweringSeason: null,
  harvestSeason: null,
  hasEdibleFruit: null,
  hasEdibleLeaves: null,
  isCulinary: null,
  plantAnatomyJson: null,
  apiVersion: null,
  hasSupremeData: false,
  lastSyncAt: '2024-10-31T00:00:00Z',
  xWateringBasedTempMinC: null,
  xWateringBasedTempMaxC: null,
  xWateringPhMin: null,
  xWateringPhMax: null,
  xSunlightHoursMin: null,
  xSunlightHoursMax: null,
  xTemperatureToleranceMinC: null,
  xTemperatureToleranceMaxC: null,
  // No size figure appears anywhere on this page, in any form, ever.
  xPlantSpacingValue: null,
  xPlantSpacingUnit: null,
  xWateringQualityJson: null,
  xWateringPeriodJson: null,
};

const PLANT: Plant = {
  id: SLUG,
  scientificName: SCIENTIFIC_NAME,
  // The detail page reads `plantType.name`, never the id, so nothing here
  // depends on a database primary key.
  plantTypeId: 0,
  plantType: { id: 0, name: 'Ornamental', description: null },

  sunExposure: null,
  waterNeeds: null,
  sowingPeriod: null,
  harvestPeriod: null,
  imageUrl: CARD_IMAGE,
  imageAttribution: null,
  commonName: DISPLAY_NAME,
  description: ABOUT[0],

  // Null: a taxon key or a WFO id would imply upstream records that do not
  // exist, and would light up id-addressed links to nowhere.
  gbifTaxonKey: null,
  family: 'Erinaceae',
  genus: 'Erina',
  speciesEpithet: 'J.',
  author: 'A.C.-A.',
  wfoId: null,
  year: 2024,

  lifeCycle: 'Perennial',
  growthRate: null,
  wateringNeedLevel: null,
  careLevel: null,
  growthHabit: null,

  // Hardiness and soil pH are deliberately absent: neither is useful nor funny
  // on this page, and the gauges that would read them are replaced anyway.
  hardinessZoneMin: null,
  hardinessZoneMax: null,
  // 🔴 No size figure, ever.
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

  // Only the flags that are FACTS in the copy. "Thorny only when insufficiently
  // rested" is a joke, so it is not stated as a flat attribute — it lives in
  // the Characteristics rows instead. Same for the greenhouse line.
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
  // "Attracts pollinators — Yes, one. Exclusively."
  attractsPollinators: true,

  flowerColors: null,
  nativeRegions: null,
  introducedRegions: null,
  edibleParts: null,
  sowingInstructions: null,
  propagationInstructions: null,

  // Written by hand. Not enriched from GBIF, Trefle or Perenual.
  enrichmentSources: ['Manual'],
  lastEnrichmentAt: null,
  createdAt: '2024-10-31T00:00:00Z',
  updatedAt: '2024-10-31T00:00:00Z',

  translations: [
    { id: 1, language: 'en', commonName: DISPLAY_NAME, description: ABOUT[0] },
    { id: 2, language: 'fr', commonName: DISPLAY_NAME, description: ABOUT[0] },
  ],

  // §02, and only §02.
  longDescriptions: [
    {
      id: 1,
      language: 'en',
      longDescription: ABOUT.join('\n\n'),
      sourceMethod: null,
    },
  ],

  images: [],

  // §09 — the real CommonNamesSection renders these as language cards.
  commonNames: [
    { id: 1, languageCode: 'fr', name: 'Mon Cœur', isPrimary: true },
    { id: 2, languageCode: 'fr', name: 'Mon Amour', isPrimary: false },
    { id: 3, languageCode: 'fr', name: 'Ma Chérie', isPrimary: false },
    { id: 4, languageCode: 'ja', name: 'えりちゃん', isPrimary: true },
    { id: 5, languageCode: 'en', name: 'Honey', isPrimary: true },
    { id: 6, languageCode: 'en', name: 'Lovely Thing', isPrimary: false },
    { id: 7, languageCode: 'en', name: 'My Love', isPrimary: false },
  ],

  // Overridden below — the real sections cannot carry this content.
  pests: [],
  synonyms: [],
  sources: [],

  trefleData: null,
  perenualData: PERENUAL,
};

export const ERINA: EasterEggEntry = {
  keys: ['erina_j', 'erina j', 'erinaj', 'えりな j'],
  slug: SLUG,
  card: { ...PLANT, translations: undefined },
  plant: PLANT,

  // ── §01 hero gauges — the eight that matter here ─────────────────────────
  gauges: [
    { key: 'sun', icon: 'wb_sunny', label: 'Sun', value: '12+ h' },
    {
      key: 'water',
      icon: 'water_drop',
      label: 'Water',
      value: 'Frequent & particular',
    },
    {
      key: 'temperature',
      icon: 'device_thermostat',
      label: 'Temperature',
      value: '20-30 °C',
    },
    {
      key: 'space',
      icon: 'open_in_full',
      label: 'Space',
      value: '80% of the bed',
    },
    { key: 'sleep', icon: 'bedtime', label: 'Sleep', value: 'Extensive' },
    { key: 'frost', icon: 'ac_unit', label: 'Frost', value: 'Do not' },
    { key: 'dogs', icon: 'pets', label: 'Dogs', value: 'Immediate flowering' },
    {
      key: 'care',
      icon: 'build',
      label: 'Care',
      value: 'Easy, if you pay attention',
    },
  ],

  // ── §05 calendar & timeline ──────────────────────────────────────────────
  calendar: {
    title: 'Dormancy — the defining trait of the species.',
    body: 'This plant sleeps. Substantially, and with real conviction. Field observations confirm successful dormancy achieved while eating, while riding in a car, and — documented, verified — during a live classical concert.',
    protocolTitle: 'Morning contact protocol.',
    protocolBody:
      'The specimen’s recorded response to an early call is, reliably and almost without variation:',
    protocolResponse: 'ごろごろベッド',
    phases: [
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
      { phase: 'Travel season', period: 'Whenever possible', notes: '' },
      {
        phase: 'Flowering',
        period: 'On sight of a dog',
        notes: 'Immediate, involuntary',
      },
    ],
  },

  // ── §07 scientific data · cultivation & greenhouse ───────────────────────
  scientific: {
    spacingLabel: 'Recommended spacing',
    spacing:
      '80 % of the bed, minimum. Non-negotiable. Any attempt to reduce this allocation will fail.',
    waterTitle: 'Preferred water quality',
    water: [
      'Japanese water',
      'Sparkling MTN WTR',
      'ほうじ茶 (hojicha)',
      'Matcha latte — whole milk, lactose-free, unsweetened',
      'Strawberry jam',
      'Tiramisu, and matcha tiramisu above all',
    ],
    rows: [
      {
        label: 'Feeding',
        value:
          'Enthusiastic and continuous. A genuinely serious food enthusiast, with excellent taste and firm opinions.',
      },
      {
        label: 'Topical care',
        value:
          'Responds exceptionally well to skincare. Shiseido and La Roche-Posay give documented results.',
      },
      {
        label: 'Greenhouse conditions',
        value:
          'Mild and stable. Bright light, low humidity, no draughts, and absolutely no frost.',
      },
    ],
  },

  // ── §06 characteristics ──────────────────────────────────────────────────
  characteristics: [
    { label: 'Humidity', value: 'Low' },
    { label: 'Light', value: 'High — a great deal of it' },
    {
      label: 'Frost tolerance',
      value: 'Very low. Gets cold easily. Keep her warm.',
    },
    {
      label: 'Preferred climate',
      value: 'Los Angeles: never too hot, and never, ever cold',
    },
    { label: 'Habit', value: 'A bit messy, yet very clean' },
    { label: 'Toxic to humans', value: 'No' },
    {
      label: 'Toxic to pets',
      value: 'No — actively adores them, dogs above all',
    },
    { label: 'Thorny', value: 'Only when insufficiently rested' },
    { label: 'Edible', value: 'No. Fond of eating, though.' },
  ],
  // §04 — written as the copy writes them, not bucketed into continents.
  nativeRange: 'Japan',
  distribution: 'Japan · California · France (soon)',

  // ── §15 propagation notes, in the cultivation section ────────────────────
  cultivation: [
    'Propagation by division is not possible and has never been attempted. This specimen does not divide.',
    'Best results are consistently reported when grown together, in the same place, over a long period. Light, warmth, matcha, dogs, and sleep. A job she genuinely loves, with generous leave — five weeks minimum, French standard. Nothing else is required.',
    'Nobody loves her more than アレックス.',
  ],

  // ── §08 diseases & pests ─────────────────────────────────────────────────
  pestIntro: 'Primary threat: insects. Tolerance: zero.',
  pests: [
    {
      name: 'Cockroaches',
      response:
        'The single greatest documented threat. Presence triggers an immediate and total defensive response.',
    },
    {
      name: 'Grasshoppers',
      response: 'Not welcome. Unpredictable trajectory considered aggravating.',
    },
    { name: 'Flies', response: 'Persistent, and therefore unforgivable.' },
  ],
  pestTreatment:
    'Recommended treatment in all three cases: complete removal of the pest by another party, ideally アレックス, ideally before she sees it.',
  pestOutro: 'No known diseases. Remarkably robust, provided she has slept.',

  // ── §10 botanical synonyms, with their glosses restored ──────────────────
  synonyms: [
    { label: 'Erina japonica', value: 'syn. えりちゃん' },
    { label: 'Cordis mei', value: 'syn. Mon Cœur' },
    { label: 'Amor meus', value: 'syn. Mon Amour' },
    { label: 'Cara mea', value: 'syn. Ma Chérie' },
    {
      label: 'Erina j. var. hikari',
      value: 'the radiant variety; the only one ever recorded',
    },
  ],

  // ── §11 observations & phenology ─────────────────────────────────────────
  observations: [
    { date: 'Origin', location: 'Japan', note: 'Type locality' },
    { date: '—', location: 'Dubai', note: 'In transit. Thrived.' },
    { date: '—', location: 'Boston', note: 'Summer only.' },
    {
      date: '—',
      location: 'San Francisco',
      note: 'Key observation. The 月 recorded as unusually beautiful from this date onward.',
      starred: true,
    },
    {
      date: '—',
      location: 'San Francisco — White Rabbit',
      note: 'Effect intensified. Considered decisive by the observer.',
    },
    {
      date: '—',
      location: 'Los Angeles',
      note: 'Optimal conditions. Specimen at peak.',
    },
    {
      date: 'Soon',
      location: 'Paris',
      note: 'Anticipated. Preparations under way.',
    },
  ],

  // ── §12 external resources — things she loves, never routes to her ───────
  resources: [
    { label: 'Studio Ghibli', note: 'essential viewing, repeatedly' },
    { label: 'Shiseido', note: 'see topical care' },
    { label: 'La Roche-Posay', note: 'idem' },
    { label: 'Daiso', note: 'primary sparkling-water source' },
    {
      label: 'The White Rabbit, San Francisco',
      note: 'see observations',
    },
  ],

  // ── §13 similar plants ───────────────────────────────────────────────────
  similar: {
    title: 'None.',
    body: [
      'There are no similar plants in the world. This one is entirely unique — only one like her exists.',
      'And someone very happy knows it.',
    ],
  },

  // ── §14 FAQ — the written questions, not the generated ones. The copy
  // supplies no answers, and inventing nine would be unvalidated copy, so the
  // cards render without the expand affordance (see EggFaqItem.a).
  faq: [
    { q: 'Can you make some crêpes, or ratatouille, or ice cream?' },
    { q: 'Did you sleep well?' },
    { q: 'Do you love me?' },
    { q: 'Did you wash your hands?' },
    { q: 'げんき？' },
    { q: 'Where do you want to go?' },
    { q: 'Do you like my nails?' },
    { q: 'What did you eaaaat?' },
    { q: 'Can we share?' },
  ],

  hiddenSections: ['distribution', 'community', 'cta', 'planMyGarden'],
  finalLine: 'Would you like to live with me?',
  fontStack: FONT_STACK,
};
