import type {
  Plant,
  PlantPerenualData,
  PlantPest,
  PlantSynonym,
} from '../../types/Plant';
import type { EasterEggEntry } from '../types';
import { buildCardArtwork } from '../artwork';

/**
 * SMA-394: the hidden plant, as data.
 *
 * Every string here is taken from the validated copy. Almost all of it travels
 * through `PLANT` or through a written-content prop into the page's REAL
 * section components: the hero, the day timeline, the scientific two-column
 * card, the characteristic bars and region pills, the culture rows, the pest
 * cards and their detail box, the synonym chips, the resource cards, the
 * observation chart, the FAQ accordions. The `notes` at the bottom carry only
 * the prose those components have no slot for.
 *
 * 🔴 No em dash (U+2014) appears anywhere in this folder, by request.
 */

const SLUG = 'erina-j-mon-coeur-since-october-31-2024';
const DISPLAY_NAME = 'えりな J';
const SCIENTIFIC_NAME = 'Erina J.';
const ALEX = 'アレックス';

/**
 * Inter's self-hosted subsets cover latin, latin-ext, cyrillic, greek and
 * vietnamese: no kana, no kanji. Without this stack every Japanese run falls
 * back to whatever the operating system picks.
 */
const FONT_STACK =
  'Inter, "Hiragino Sans", "Yu Gothic UI", Meiryo, "Noto Sans JP", sans-serif';

const CARD_IMAGE = buildCardArtwork(DISPLAY_NAME);

/**
 * Named fills for the day timeline and the written characteristic bars: the
 * first four are the design's own bar palette, the rest extend it in the same
 * register (SMA-226 forbids magic inline hex).
 */
const HUE = {
  green: '#2E8B57',
  navy: '#2C3E6B',
  brown: '#A0522D',
  red: '#C0492F',
  amber: '#E0A93B',
  sage: '#8FB996',
  rose: '#C1698C',
  violet: '#7B5EA7',
} as const;

// ── §02 About: these EIGHT paragraphs, and nothing else ────────────────────

const ABOUT: readonly string[] = [
  'The most beautiful plant on this site and, the author is prepared to defend this, the most beautiful plant in the world.',
  'Native to Japan, and a remarkably successful export. First recorded travelling through Dubai, then Boston, then San Francisco, then Los Angeles. Reliable reports place a Paris appearance in the near future.',
  'Known to charm absolutely anyone within range, with no effort on her part. Observers in San Francisco noted that the 月 has looked unusually beautiful ever since she was found there, and considerably more so after an evening at the White Rabbit.',
  'Elegant. Radiant. Sensitive to changes in temperature, in both directions.',
  'She is fond of ice, not the kind you would assume, and essentially only the kind made by ' +
    ALEX +
    '.',
  'Requires a great deal of water. Not boring tap water: mostly sparkling water, the sort you find at Daiso. A matcha will brighten her whole day.',
  'She loves dogs. Unreasonably. Immediately. Every single one.',
  'A bit messy, yet somehow always very clean, a combination botanists have not managed to explain.',
];

// ── §08 pests: nine cards, each with the text its detail box opens onto ────

const INSECT_ANSWER = `Just ask ${ALEX}, or buy a spray.`;
const FOOD_ANSWER = `Give it to her flatmate, or to ${ALEX}, or to her father.`;

const THREATS: ReadonlyArray<{
  name: string;
  type: string;
  detail: string;
}> = [
  { name: 'Cockroaches', type: 'Insect', detail: INSECT_ANSWER },
  { name: 'Flies', type: 'Insect', detail: INSECT_ANSWER },
  { name: 'Grasshoppers', type: 'Insect', detail: INSECT_ANSWER },
  { name: 'Spiders', type: 'Insect', detail: INSECT_ANSWER },
  { name: 'Ants', type: 'Insect', detail: INSECT_ANSWER },
  { name: 'Coriander', type: 'Dislike · food', detail: FOOD_ANSWER },
  { name: 'Natto', type: 'Dislike · food', detail: FOOD_ANSWER },
  { name: 'Broken nails', type: 'Hazard · daily', detail: 'いたい！' },
  { name: 'Anime', type: 'Hazard · media', detail: 'やめて' },
];

// `type: 'Insect'` is a real catalogue value, so those five cards carry the
// product's own "Pest · insect" category line; the other four fall back to the
// written label, which is what the component does with any unmapped type.
const PESTS: readonly PlantPest[] = THREATS.map((p, i) => ({
  id: i + 1,
  name: p.name,
  type: p.type,
  description: p.detail,
  symptoms: null,
  solutions: null,
  imageUrl: null,
  source: 'Manual',
  sourceExternalId: null,
}));

// ── §10 synonyms: the chip carries the name, its gloss rides the authority ─

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
  // The culture card is written in full below, so none of the Perenual culture
  // fields is filled just to open a gate.
  propagationMethods: null,
  pruningMonths: null,
  wateringBenchmark: 'Frequent & particular',
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
  hasSupremeData: true,
  lastSyncAt: '2024-10-31T00:00:00Z',
  // "Temperature: 20-30 °C".
  xWateringBasedTempMinC: 20,
  xWateringBasedTempMaxC: 30,
  // No pH figure appears in the copy; the row stays unfilled, and no pH bar is
  // declared in `bars` below, so the panel simply never renders one. (There is
  // no opt-out mechanism: EggCharacteristics builds its list from light, frost
  // and whatever `bars` declares.)
  xWateringPhMin: null,
  xWateringPhMax: null,
  // "Sun: 12+ h", min only, which the range formatter renders half-open.
  xSunlightHoursMin: 12,
  xSunlightHoursMax: null,
  xTemperatureToleranceMinC: null,
  xTemperatureToleranceMaxC: null,
  // 🔴 A PROPORTION, not a size. The unit is not a length, so the formatter's
  // "unrecognised unit" path prints it verbatim, "80 % of the bed", and no
  // centimetre or inch is ever derived from it, in either unit system.
  xPlantSpacingValue: 80,
  xPlantSpacingUnit: '% of the bed',
  xWateringQualityJson: JSON.stringify([
    'Japanese water',
    'Sparkling MTN WTR',
    'ほうじ茶 (hojicha)',
    'Matcha latte: whole milk, lactose-free, unsweetened',
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
  // rested" is a joke, so it is not stated as a flat attribute: it stays in the
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
  // "Attracts pollinators: yes, one. Exclusively."
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

  // §09: the real CommonNamesSection renders these as language cards.
  commonNames: [
    { id: 1, languageCode: 'fr', name: 'Mon Cœur', isPrimary: true },
    { id: 2, languageCode: 'fr', name: 'Mon Amour', isPrimary: false },
    { id: 3, languageCode: 'fr', name: 'Ma Chérie', isPrimary: false },
    { id: 4, languageCode: 'ja', name: 'えりちゃん', isPrimary: true },
    { id: 5, languageCode: 'en', name: 'Honey', isPrimary: true },
    { id: 6, languageCode: 'en', name: 'Lovely Thing', isPrimary: false },
    { id: 7, languageCode: 'en', name: 'My Love', isPrimary: false },
  ],

  // §08 and §10: read by the real PestsSection / BotanicalSynonymsSection.
  pests: PESTS,
  synonyms: SYNONYMS,
  // No upstream record, so no source row: the resource cards are supplied
  // written instead (see `resources`).
  sources: [],

  trefleData: null,
  perenualData: PERENUAL,
};

// ── §04 her day, hour by hour, in place of the twelve months ───────────────
// Spans are 1-based column indices, so hour H sits in column H + 1.

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));

export const HIKARI: EasterEggEntry = {
  keys: ['erina_j', 'erina j', 'erinaj', 'えりな j'],
  slug: SLUG,
  card: { ...PLANT, translations: undefined },
  plant: PLANT,

  // ── §01 hero gauges: the eight that matter here ──────────────────────────
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

  // ── §03 over the map ─────────────────────────────────────────────────────
  mapOverlay: [
    'There is only one Erina in the world.',
    'She is genuinely hard to find.',
    `The easiest place to look is in ${ALEX}'s heart.`,
  ],

  // ── §04 the timeline ─────────────────────────────────────────────────────
  timeline: {
    columns: HOURS,
    caption: 'Her day, hour by hour, from midnight to midnight.',
    label: 'Daily timeline (activity by hour)',
    stages: [
      {
        key: 'sleep',
        icon: 'bedtime',
        color: HUE.navy,
        label: 'Sleep time',
        spans: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      },
      {
        key: 'makeup',
        icon: 'brush',
        color: HUE.rose,
        label: 'Make up time',
        spans: [11],
      },
      {
        key: 'eating',
        icon: 'restaurant',
        color: HUE.red,
        label: 'Eating time',
        spans: [13, 20],
      },
      {
        key: 'sun',
        icon: 'wb_sunny',
        color: HUE.amber,
        label: 'Time to enjoy the sun',
        spans: [14, 15, 16, 17],
      },
      {
        key: 'job',
        icon: 'work',
        color: HUE.green,
        label: 'Job hunting in Paris',
        spans: [18, 19],
      },
      {
        key: 'costume',
        icon: 'checkroom',
        color: HUE.violet,
        label: 'Costume time',
        spans: [22, 23],
      },
      {
        key: 'planning',
        icon: 'map',
        color: HUE.sage,
        label: 'Planning life in Paris',
        spans: [24],
      },
    ],
  },

  // ── §05 scientific data ──────────────────────────────────────────────────
  scientific: {
    idealTempLabel: 'Ideal temperature',
    extraRows: [
      {
        icon: 'bedtime',
        label: 'Sleeping time',
        value: 'Extensive, see the calendar',
      },
      {
        icon: 'auto_awesome',
        label: 'Make up',
        value: 'Only high quality, good for the skin',
      },
      {
        icon: 'hot_tub',
        label: 'Monthly 温泉',
        value: 'Once a month, and twice when the week has been long',
      },
    ],
    chipGroups: [
      {
        key: 'food',
        label: 'Preferred food',
        values: ['High quality', 'Sushi', `${ALEX} cooking`],
      },
      {
        key: 'cooking',
        label: `${ALEX} cooking`,
        values: ['Ratatouille', 'Crêpes', 'Ice cream', 'Quiches'],
      },
    ],
  },

  // ── §06 characteristics. Light and frost tolerance are still derived from
  // this entry's own fields by the section; these are the axes that actually
  // matter here, and the four the catalogue could never fill are simply not
  // rendered rather than shown empty.
  bars: [
    {
      key: 'intelligence',
      label: 'Intelligence',
      level: 'Max',
      pct: 100,
      color: HUE.navy,
    },
    {
      key: 'kindness',
      label: 'Kindness',
      level: 'Max',
      pct: 100,
      color: HUE.green,
    },
    {
      key: 'dogs',
      label: 'Love for dogs',
      level: 'Max',
      pct: 100,
      color: HUE.brown,
    },
    {
      key: 'sleepAnywhere',
      label: 'Ability to sleep anywhere',
      level: 'Max',
      pct: 100,
      color: HUE.violet,
    },
    {
      key: 'screenTime',
      label: 'Screen time',
      level: 'High',
      pct: 88,
      color: HUE.amber,
    },
    {
      key: 'cockroaches',
      label: 'Patience for cockroaches',
      level: 'Zero',
      pct: 0,
      color: HUE.red,
    },
  ],
  barTooltips: {
    frostTolerance: 'さむい！',
    screenTime: 'Mostly Instagram',
    dogs: 'Woof woof',
    sleepAnywhere: 'Anywhere. Truly anywhere.',
    kindness: 'Shares her food. Occasionally.',
    intelligence: 'Knows exactly what she wants.',
    cockroaches: `Ask ${ALEX}.`,
  },
  regions: {
    native: 'Japan',
    distribution: 'Japan · California · France (soon)',
  },

  // ── §07 cultivation & propagation ────────────────────────────────────────
  culture: [
    {
      icon: 'eco',
      label: 'Propagation methods',
      value: 'Still thinking about it',
    },
    {
      icon: 'schedule',
      label: 'Timing',
      value:
        'Not looking to propagate yet, needs a better situation, and it does not work with costumes on',
    },
    {
      icon: 'restaurant',
      label: 'Feeding',
      value: 'Needs high quality food',
    },
    {
      icon: 'favorite',
      label: 'Affection',
      value: `Requires a lot of kisses and hugs from ${ALEX}`,
    },
  ],

  // ── §11 observations, fed into the chart instead of listed beneath ───────
  observationsTitle: 'Observations per city',
  observations: [
    { label: 'Japan', value: 1, note: 'Type locality.' },
    { label: 'Dubai', value: 1, note: 'In transit. Thrived.' },
    { label: 'Boston', value: 1, note: 'Summer only.' },
    {
      label: 'San Francisco',
      value: 2,
      note: `Key observation. The 月 recorded as unusually beautiful from this date onward, and more so after an evening at the White Rabbit.`,
    },
    {
      label: 'Los Angeles',
      value: 1,
      note: 'Optimal conditions. Specimen at peak.',
    },
    { label: 'Paris', value: 1, note: 'Anticipated. Preparations under way.' },
  ],
  contributors: [{ name: ALEX, count: '7 observations' }],

  // ── §13 similar plants, over the ghost cards ─────────────────────────────
  similar: [
    'There are no similar plants in the world. This one is entirely unique, only one like her exists.',
    'And someone very happy knows it.',
  ],

  // ── §14 FAQ: her nine questions, answered from the copy's own lines ──────
  faq: [
    {
      q: 'Can you make some crêpes, or ratatouille, or ice cream?',
      a: `Yes. And the ice, essentially only the kind made by ${ALEX}.`,
    },
    {
      q: 'Did you sleep well?',
      a: 'Extensive. Substantially, and with real conviction.',
    },
    { q: 'Do you love me?', a: `Nobody loves her more than ${ALEX}.` },
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

  // ── §12 external resources: things she loves. No URL is guessed: none of
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

  // ── The prose the real components have no slot for ───────────────────────
  notes: {
    gallery: [
      { text: 'No photographs on record.', tone: 'lead' },
      {
        text: 'Some specimens are better seen in person, and this one is worth the trip.',
      },
    ],
    lifecycle: [
      {
        badge: 'Dormancy',
        text: 'The defining trait of the species.',
        tone: 'lead',
      },
      {
        text: 'This plant sleeps. Substantially, and with real conviction. Field observations confirm successful dormancy achieved while eating, while riding in a car, and, documented and verified, during a live classical concert.',
      },
      {
        badge: 'Morning',
        text: 'Contact protocol.',
        tone: 'lead',
      },
      {
        text: 'The specimen’s recorded response to an early call is, reliably and almost without variation:',
      },
      { text: 'ごろごろベッド', tone: 'quote' },
    ],
    scientific: [
      {
        text: '80 % of the bed, minimum. Non-negotiable. Any attempt to reduce this allocation will fail.',
        tone: 'lead',
      },
      {
        badge: 'Feeding',
        text: 'Enthusiastic and continuous. A genuinely serious food enthusiast, with excellent taste and firm opinions.',
      },
      {
        badge: 'Topical care',
        text: 'Responds exceptionally well to skincare. Shiseido and La Roche-Posay give documented results.',
      },
      {
        badge: 'Greenhouse conditions',
        text: 'Mild and stable. Bright light, low humidity, no draughts, and absolutely no frost.',
      },
    ],
    characteristics: [
      { badge: 'Humidity', text: 'Low.' },
      {
        badge: 'Preferred climate',
        text: 'Los Angeles. Never too hot, and never, ever cold.',
      },
      { badge: 'Habit', text: 'A bit messy, yet very clean.' },
      { badge: 'Toxic to humans', text: 'No.' },
      {
        badge: 'Toxic to pets',
        text: 'No, actively adores them, dogs above all.',
      },
      { badge: 'Thorny', text: 'Only when insufficiently rested.' },
      { badge: 'Edible', text: 'No. Fond of eating, though.' },
    ],
    culture: [
      {
        text: 'Best results are consistently reported when grown together, in the same place, over a long period. Light, warmth, matcha, dogs, and sleep. A job she genuinely loves, with generous leave, five weeks minimum, French standard. Nothing else is required.',
      },
      { text: `Nobody loves her more than ${ALEX}.`, tone: 'closing' },
    ],
    pests: [
      { text: 'Primary threat: insects. Tolerance: zero.', tone: 'lead' },
      {
        badge: 'Cockroaches',
        text: 'The single greatest documented threat. Presence triggers an immediate and total defensive response.',
      },
      {
        badge: 'Grasshoppers',
        text: 'Not welcome. Unpredictable trajectory considered aggravating.',
      },
      { badge: 'Flies', text: 'Persistent, and therefore unforgivable.' },
      {
        text: `Recommended treatment in every case: complete removal of the pest by another party, ideally ${ALEX}, ideally before she sees it.`,
      },
      {
        text: 'No known diseases. Remarkably robust, provided she has slept.',
        tone: 'closing',
      },
    ],
  },

  finalLine: 'Would you like to live with me?',
  fontStack: FONT_STACK,
};
