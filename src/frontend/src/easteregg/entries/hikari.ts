import type {
  Plant,
  PlantPerenualData,
  PlantPest,
  PlantSynonym,
} from '../../types/Plant';
import type { EasterEggEntry, EggNote } from '../types';
import { buildCardArtwork } from '../artwork';

/**
 * SMA-394 — the hidden plant, as data.
 *
 * Every string here is taken verbatim from the validated copy. Almost all of it
 * travels through `PLANT` into the page's REAL section components — the hero,
 * the gauges' neighbours, the seasonal timeline, the scientific two-column card,
 * the characteristic bars and region pills, the culture rows, the pest cards,
 * the synonym chips, the resource cards, the FAQ accordions — so the page is the
 * product's own page with this entry's data in it. The `notes` below carry only
 * the prose those components have no slot for.
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

// ── §08 pests — one source for the cards and for the prose under them ──────

const THREATS: ReadonlyArray<{ name: string; response: string }> = [
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
];

// `type` is a real catalogue value: the copy names insects as the primary
// threat, so the cards carry the product's own "Pest · insect" category line.
const PESTS: readonly PlantPest[] = THREATS.map((p, i) => ({
  id: i + 1,
  name: p.name,
  type: 'Insect',
  description: p.response,
  symptoms: null,
  solutions: null,
  imageUrl: null,
  source: 'Manual',
  sourceExternalId: null,
}));

// ── §10 synonyms — the chip carries the name, its gloss rides the authority ─

const SYNONYMS: readonly PlantSynonym[] = [
  { id: 1, synonym: 'Erina japonica', authority: 'syn. えりちゃん' },
  { id: 2, synonym: 'Cordis mei', authority: 'syn. Mon Cœur' },
  { id: 3, synonym: 'Amor meus', authority: 'syn. Mon Amour' },
  { id: 4, synonym: 'Cara mea', authority: 'syn. Ma Chérie' },
  {
    id: 5,
    synonym: 'Erina j. var. hikari',
    authority: 'the radiant variety; the only one ever recorded',
  },
];

// ── The Plant object the REAL sections read ────────────────────────────────

const PERENUAL: PlantPerenualData = {
  id: 'egg-pd',
  perenualId: 0,
  requestedPerenualId: null,
  cultivar: null,
  perenualType: null,
  originCountries: null,
  // No propagation method and no pruning month appear in the copy, so those two
  // culture rows stay absent — exactly as they do for a catalogue plant that
  // lacks them. Inventing either would be inventing content.
  propagationMethods: null,
  pruningMonths: null,
  wateringBenchmark: 'Frequent & particular',
  wateringBenchmarkUnit: null,
  sunlightPreferences: null,
  maintenance: null,
  // "Flowering — on sight of a dog. Immediate, involuntary." Dogs occur all
  // year, so the timeline's flowering bar spans the year.
  floweringSeason: 'year-round',
  harvestSeason: null,
  hasEdibleFruit: null,
  hasEdibleLeaves: null,
  isCulinary: null,
  plantAnatomyJson: null,
  apiVersion: null,
  hasSupremeData: true,
  lastSyncAt: '2024-10-31T00:00:00Z',
  // "Temperature — 20-30 °C".
  xWateringBasedTempMinC: 20,
  xWateringBasedTempMaxC: 30,
  // No pH figure appears in the copy; the row and the bar stay unfilled.
  xWateringPhMin: null,
  xWateringPhMax: null,
  // "Sun — 12+ h": min only, which the range formatter renders half-open.
  xSunlightHoursMin: 12,
  xSunlightHoursMax: null,
  xTemperatureToleranceMinC: null,
  xTemperatureToleranceMaxC: null,
  // 🔴 A PROPORTION, not a size. The unit is not a length, so the formatter's
  // "unrecognised unit" path prints it verbatim — "80 % of the bed" — and no
  // centimetre or inch is ever derived from it, in either unit system.
  xPlantSpacingValue: 80,
  xPlantSpacingUnit: '% of the bed',
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

  // Zone 11 is the frost-free end of the scale: it drives the frost-tolerance
  // bar to its lowest bucket, which is what "gets cold easily, no frost" means
  // in the product's own vocabulary.
  hardinessZoneMin: 11,
  hardinessZoneMax: 11,
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
  // rested" is a joke, so it is not stated as a flat attribute — it stays in the
  // characteristics prose instead.
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
  // The written ranges reach the pills through `regions` below: these coded
  // columns would be flattened to continents ("Asia").
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

  // §08 and §10 — read by the real PestsSection / BotanicalSynonymsSection.
  pests: PESTS,
  synonyms: SYNONYMS,
  // No upstream record, so no source row: the resource cards are supplied
  // written instead (see `resources`).
  sources: [],

  trefleData: null,
  perenualData: PERENUAL,
};

// ── The six phases of §05, as the section's prose under the timeline ───────
// The timeline's five stages are the product's own (seed, growth, flowering,
// fruits, harvest); only flowering has a written counterpart here, so the rest
// of the copy's phases read as prose rather than being forced onto a bar.

const PHASE_NOTES: readonly EggNote[] = [
  { text: 'Dormancy — the defining trait of the species.', tone: 'lead' },
  {
    text: 'This plant sleeps. Substantially, and with real conviction. Field observations confirm successful dormancy achieved while eating, while riding in a car, and — documented, verified — during a live classical concert.',
  },
  {
    text: 'Dormancy is year-round and opportunistic: it can occur anywhere, without warning. Do not disturb. Morning emergence is delayed, peak radiance arrives late morning onward and requires prior completion of dormancy, feeding is continuous, travel season is whenever possible, and flowering is immediate and involuntary on sight of a dog.',
  },
  { text: 'Morning contact protocol.', tone: 'lead' },
  {
    text: 'The specimen’s recorded response to an early call is, reliably and almost without variation:',
  },
  { text: 'ごろごろベッド', tone: 'quote' },
];

export const HIKARI: EasterEggEntry = {
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

  // ── §06 region pills — written as the copy writes them ───────────────────
  regions: {
    native: 'Japan',
    distribution: 'Japan · California · France (soon)',
  },

  // ── §14 FAQ — her nine questions, answered from the copy's own lines ─────
  faq: [
    {
      q: 'Can you make some crêpes, or ratatouille, or ice cream?',
      a: 'Yes. And the ice, essentially only the kind made by アレックス.',
    },
    {
      q: 'Did you sleep well?',
      a: 'Extensive. Substantially, and with real conviction.',
    },
    { q: 'Do you love me?', a: 'Nobody loves her more than アレックス.' },
    { q: 'Did you wash your hands?', a: 'Yes.' },
    { q: 'げんき？', a: 'げんき！' },
    {
      q: 'Where do you want to go?',
      a: 'Paris. Anticipated. Preparations under way.',
    },
    { q: 'Do you like my nails?', a: 'Yes.' },
    {
      q: 'What did you eaaaat?',
      a: 'Enthusiastic and continuous. A genuinely serious food enthusiast, with excellent taste and firm opinions.',
    },
    { q: 'Can we share?', a: 'Always.' },
  ],

  // ── §12 external resources — things she loves. No URL is guessed: none of
  // these has a public page this entry can point at with certainty, so each
  // card renders without a link rather than sending her somewhere wrong.
  resources: [
    {
      key: 'ghibli',
      abbrev: 'SG',
      label: 'Studio Ghibli',
      description: 'essential viewing, repeatedly',
    },
    {
      key: 'shiseido',
      abbrev: 'SH',
      label: 'Shiseido',
      description: 'see topical care',
    },
    {
      key: 'larocheposay',
      abbrev: 'LR',
      label: 'La Roche-Posay',
      description: 'idem',
    },
    {
      key: 'daiso',
      abbrev: 'DA',
      label: 'Daiso',
      description: 'primary sparkling-water source',
    },
    {
      key: 'whiterabbit',
      abbrev: 'WR',
      label: 'The White Rabbit, San Francisco',
      description: 'see observations',
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

  // ── The prose the real components have no slot for ───────────────────────
  notes: {
    lifecycle: PHASE_NOTES,
    scientific: [
      {
        text: '80 % of the bed, minimum. Non-negotiable. Any attempt to reduce this allocation will fail.',
        tone: 'lead',
      },
      {
        text: 'Feeding — Enthusiastic and continuous. A genuinely serious food enthusiast, with excellent taste and firm opinions.',
      },
      {
        text: 'Topical care — Responds exceptionally well to skincare. Shiseido and La Roche-Posay give documented results.',
      },
      {
        text: 'Greenhouse conditions — Mild and stable. Bright light, low humidity, no draughts, and absolutely no frost.',
      },
    ],
    characteristics: [
      { text: 'Humidity — Low.' },
      {
        text: 'Preferred climate — Los Angeles: never too hot, and never, ever cold.',
      },
      { text: 'Habit — A bit messy, yet very clean.' },
      { text: 'Toxic to humans — No.' },
      { text: 'Toxic to pets — No, actively adores them, dogs above all.' },
      { text: 'Thorny — Only when insufficiently rested.' },
      { text: 'Edible — No. Fond of eating, though.' },
    ],
    culture: [
      {
        text: 'Propagation by division is not possible and has never been attempted. This specimen does not divide.',
      },
      {
        text: 'Best results are consistently reported when grown together, in the same place, over a long period. Light, warmth, matcha, dogs, and sleep. A job she genuinely loves, with generous leave — five weeks minimum, French standard. Nothing else is required.',
      },
      { text: 'Nobody loves her more than アレックス.', tone: 'closing' },
    ],
    pests: [
      { text: 'Primary threat: insects. Tolerance: zero.', tone: 'lead' },
      ...THREATS.map((p) => ({ text: `${p.name} — ${p.response}` })),
      {
        text: 'Recommended treatment in all three cases: complete removal of the pest by another party, ideally アレックス, ideally before she sees it.',
      },
      {
        text: 'No known diseases. Remarkably robust, provided she has slept.',
        tone: 'closing' as const,
      },
    ],
    // ── §13 similar plants ─────────────────────────────────────────────────
    similar: [
      { text: 'None.', tone: 'lead' },
      {
        text: 'There are no similar plants in the world. This one is entirely unique — only one like her exists.',
      },
      { text: 'And someone very happy knows it.', tone: 'closing' },
    ],
  },

  hiddenSections: ['cta', 'planMyGarden'],
  finalLine: 'Would you like to live with me?',
  fontStack: FONT_STACK,
};
