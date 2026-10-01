import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { visuallyHidden } from '@mui/utils';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import GridOnOutlinedIcon from '@mui/icons-material/GridOnOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import YardOutlinedIcon from '@mui/icons-material/YardOutlined';
import ReconnectButton from '../ReconnectButton';
import { formulaRefusalText } from './formulaRefusal';
import { useFormulas } from '../../hooks/useFormulas';
import { DASHBOARD_SPACING, DASHBOARD_TYPE } from '../../theme/dashboardTokens';
import { useDashboardTokens } from '../../theme/useDashboardTokens';
import type {
  DashboardLevel,
  FormulaAvailability,
  FormulaCapabilities,
  FormulaRefusal,
  FormulaRefusalReason,
  FormulasCatalog,
} from '../../types/Dashboard';

interface Props {
  /** The id of the screen's title — what the dialog is named by. */
  titleId: string;
  /** The choice is mandatory (first visit, N18): the welcome, no way out. */
  mandatory: boolean;
  /** A switch is on the wire (S5): every button inert. */
  switching: boolean;
  /** The last switch that did not go through, said under the offers (A1, R3-E1). */
  refusal: FormulaRefusal | null;
  /** The choice: « Choisir X », or « Garder X » for the formula the account is on. */
  onChoose: (level: DashboardLevel) => void;
}

/**
 * The tone of a cell of the comparison (SMA-448, PR #297, fix round 1, S3 —
 * GitHub G2): « Oui » in green, « Non » muted, a figure or a name as it is —
 * decided by the cell's MEANING, never by its text. Read from the text, the
 * English « No limit » took the tone of a « No »: the best value of its row
 * drawn as the worst, and the two languages apart.
 */
type Tone = 'yes' | 'no' | 'neutral';

/** The comparison's ten static rows, in the order of V3-01 — its two limit rows come from the catalogue —, each cell's meaning per formula. */
const STATIC_ROWS: Array<{ key: string; tones: Record<DashboardLevel, Tone> }> = [
  { key: 'home', tones: { novice: 'neutral', gardener: 'neutral', expert: 'neutral' } },
  { key: 'task', tones: { novice: 'neutral', gardener: 'neutral', expert: 'neutral' } },
  { key: 'weather', tones: { novice: 'neutral', gardener: 'neutral', expert: 'neutral' } },
  { key: 'month', tones: { novice: 'no', gardener: 'yes', expert: 'yes' } },
  { key: 'tips', tones: { novice: 'no', gardener: 'yes', expert: 'yes' } },
  { key: 'counters', tones: { novice: 'no', gardener: 'yes', expert: 'yes' } },
  { key: 'stats', tones: { novice: 'no', gardener: 'no', expert: 'yes' } },
  { key: 'keyfigures', tones: { novice: 'no', gardener: 'no', expert: 'yes' } },
  { key: 'resize', tones: { novice: 'no', gardener: 'yes', expert: 'yes' } },
  { key: 'widgets', tones: { novice: 'no', gardener: 'yes', expert: 'yes' } },
];

/** An i18n array, checked: `returnObjects` is typed as a string. */
function stringsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/**
 * SMA-448, lot F3, step L5 — THE CHOICE SCREEN (V3-01; contract v3 § 4.2):
 * the three formulas as OFFERS, all free, each saying what it adds to the one
 * before, their limits AS THE SERVER SERVES THEM (`GET /api/formulas` — what
 * is shown is what is applied, V3), the reasons a formula is too small for
 * the account's gardens, and the comparison line by line. The content of
 * `FormulaChooserDialog`, which decides how it opens; this decides what it
 * says.
 *
 * The rules of the screen, from the sources:
 * - « Conseillé pour vous » is the smallest formula that holds every garden
 *   — one card, never « la plus choisie » —, shown to an account that never
 *   chose, and HIDDEN when it would advise going down from the formula the
 *   account chose (Alexandre, 22/09 18:02, decision 3);
 * - a formula too small is « Indisponible » and EXPLAINED, in words, its
 *   button inert — never imposed; nothing is ever deleted;
 * - the formula the account is on stays available beyond its own limits —
 *   « Votre formule — conservée » — and says what it keeps (decision 2);
 * - an account that never chose and has no garden is a first visit: no
 *   formula of its own yet, three « Choisir » (V3-01, situation 1);
 * - R7: an offer lists only what exists today — never Récolte (Alexandre,
 *   26/09, question 3), never the weather per city nor the sorting of the
 *   gardens, which lots F4 and F5 will deliver;
 * - V2: no price above 0, no promise of a future price;
 * - V1: NO weather warning here — the screen draws no weather figure, its
 *   previews are schemas without data. Do not « fix » this.
 */
export default function FormulaChoice({ titleId, mandatory, switching, refusal, onChoose }: Props) {
  const { t } = useTranslation();
  const { catalog, loading, loadError, reload } = useFormulas();

  // The screen opens on its TITLE, without scrolling (measured in Chrome by
  // the page harness, L7): the dialog left to focus its paper scrolled the
  // overlay to the paper's top — the panel is taller than the viewport —
  // and the header the panel descends from was gone the instant it opened.
  // A focus, no state: the trap of the dialog stays.
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  const nameOf = (level: DashboardLevel) => t(`dashboard.levels.${level}.name`);

  return (
    <Box data-formula-choice sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Box>
        <Typography
          component="h2"
          id={titleId}
          ref={titleRef}
          tabIndex={-1}
          sx={{ m: 0, fontSize: { xs: 26, sm: 34 }, lineHeight: 1.2, fontWeight: 800, color: 'primary.main', pr: mandatory ? 0 : '56px', outline: 'none' }}
        >
          {t('dashboard.choice.title')}
        </Typography>
        <Typography sx={{ mt: '10px', fontSize: { xs: 15, sm: 17 }, lineHeight: 1.55, color: 'text.primary', maxWidth: 760 }}>
          {t('dashboard.choice.lead')}
        </Typography>
        {/* SMA-448 — the notice article 10 of the Terms promises, on the
            screen shown once (the final text of the Terms and the policy,
            § 4.1): in the header, so it is read while the offers load and
            on an error too; « les lire » opens the Terms in a new tab, the
            mandatory choice — no close, no Escape — left in view. */}
        {mandatory && (
          <Typography
            data-formula-choice-terms
            sx={{ mt: '8px', fontSize: `${DASHBOARD_TYPE.secondary}px`, lineHeight: 1.5, color: 'text.secondary', maxWidth: 760 }}
          >
            {t('dashboard.choice.termsNotice')}{' '}
            <Link component={RouterLink} to="/terms" target="_blank" rel="noopener noreferrer">
              {t('dashboard.choice.termsLink')}
              <Box component="span" sx={visuallyHidden}>
                {' '}
                {t('dashboard.choice.termsNewTab')}
              </Box>
            </Link>
          </Typography>
        )}
      </Box>

      {loading && (
        <Box data-formula-choice-loading sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Typography role="status" sx={{ fontSize: `${DASHBOARD_TYPE.secondary}px`, color: 'text.secondary' }}>
            {t('dashboard.choice.loading')}
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: `${DASHBOARD_SPACING.gutter}px` }}>
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} variant="rounded" height={320} sx={{ borderRadius: '14px' }} />
            ))}
          </Box>
        </Box>
      )}

      {!loading && loadError && (
        <Box data-formula-choice-error sx={{ py: 4, textAlign: 'center' }}>
          <Typography sx={{ mb: 2, color: 'text.secondary' }}>{t('dashboard.choice.loadError')}</Typography>
          <Button variant="contained" onClick={reload}>
            {t('dashboard.retry')}
          </Button>
        </Box>
      )}

      {!loading && catalog && <Offers catalog={catalog} mandatory={mandatory} switching={switching} onChoose={onChoose} nameOf={nameOf} />}

      {/* The last switch that did not go through (A1, R3-E1), in a live region
          born EMPTY and kept mounted: a region inserted already filled is not
          announced. `polite`, never `assertive`. The way back, when the
          session expired, outside the region — words only in it. */}
      <Typography
        role="status"
        aria-live="polite"
        data-formula-chooser-refusal
        sx={{ fontSize: `${DASHBOARD_TYPE.secondary}px`, color: 'error.main', '&:empty': { display: 'block', minHeight: 0 } }}
      >
        {formulaRefusalText(refusal, t)}
      </Typography>
      {refusal?.kind === 'unauthorized' && (
        <Box>
          <ReconnectButton />
        </Box>
      )}

      {!loading && catalog && <Comparison catalog={catalog} nameOf={nameOf} />}
    </Box>
  );
}

// ── The three offers ─────────────────────────────────────────────────────

interface OffersProps {
  catalog: FormulasCatalog;
  mandatory: boolean;
  switching: boolean;
  onChoose: (level: DashboardLevel) => void;
  nameOf: (level: DashboardLevel) => string;
}

function Offers({ catalog, mandatory, switching, onChoose, nameOf }: OffersProps) {
  const { t } = useTranslation();
  const tk = useDashboardTokens();
  const { account, formulas } = catalog;
  const availabilityOf = (level: DashboardLevel): FormulaAvailability =>
    account.availability.find((entry) => entry.formula === level) ?? { formula: level, current: false, available: true, reasons: [] };

  // A first visit: nothing chosen, nothing planted — no formula of its own yet.
  const newAccount = !account.chosen && account.gardenCount === 0;
  const currentIndex = formulas.findIndex((formula) => formula.key === account.formula);
  const fitIndex = formulas.findIndex((formula) => availabilityOf(formula.key).reasons.length === 0);
  // The smallest formula that holds every garden — and never a step down
  // from the formula the account is on (decision 3): only a first visit,
  // with no formula of its own yet, is recommended the smallest one.
  const recommended = fitIndex >= 0 && (newAccount || fitIndex >= currentIndex) ? formulas[fitIndex]!.key : null;

  const context = mandatory
    ? newAccount
      ? t('dashboard.choice.welcome')
      : t('dashboard.choice.existing', { count: account.gardenCount })
    : account.gardenCount === 0
      ? t('dashboard.choice.context_zero', { formula: nameOf(account.formula) })
      : t('dashboard.choice.context', { formula: nameOf(account.formula), count: account.gardenCount });

  return (
    <>
      <Box
        data-formula-choice-context
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '11px',
          bgcolor: tk.invBg,
          border: '1px solid',
          borderColor: tk.invBd,
          borderRadius: '12px',
          px: '15px',
          py: '12px',
          maxWidth: 860,
        }}
      >
        <InfoOutlinedIcon aria-hidden sx={{ fontSize: 20, color: 'primary.main', mt: '1px', flexShrink: 0 }} />
        <Typography sx={{ fontSize: `${DASHBOARD_TYPE.secondary}px`, lineHeight: 1.5 }}>{context}</Typography>
      </Box>

      <Box
        component="ul"
        aria-label={t('dashboard.choice.offers')}
        sx={{
          listStyle: 'none',
          m: 0,
          p: 0,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
          gap: { xs: '16px', md: `${DASHBOARD_SPACING.gutter}px` },
          alignItems: 'stretch',
        }}
      >
        {formulas.map((formula, index) => (
          <OfferCard
            key={formula.key}
            formula={formula}
            previous={index > 0 ? formulas[index - 1]! : null}
            availability={availabilityOf(formula.key)}
            isCurrent={!newAccount && availabilityOf(formula.key).current}
            isRecommended={recommended === formula.key}
            switching={switching}
            onChoose={onChoose}
            nameOf={nameOf}
          />
        ))}
      </Box>
    </>
  );
}

interface OfferCardProps {
  formula: FormulaCapabilities;
  previous: FormulaCapabilities | null;
  availability: FormulaAvailability;
  isCurrent: boolean;
  isRecommended: boolean;
  switching: boolean;
  onChoose: (level: DashboardLevel) => void;
  nameOf: (level: DashboardLevel) => string;
}

function OfferCard({ formula, previous, availability, isCurrent, isRecommended, switching, onChoose, nameOf }: OfferCardProps) {
  const { t } = useTranslation();
  const tk = useDashboardTokens();
  // SMA-437, the complete review of the v3, M10: `primary.dark` at night
  // read 3.41:1 on a card and 2.96:1 on an unavailable one — `primary.light`
  // there, as `CompactActionBar` does.
  const night = useTheme().palette.mode === 'dark';
  const name = nameOf(formula.key);
  const blocked = !availability.available;
  const kept = isCurrent && availability.reasons.length > 0;
  const recommended = isRecommended && !blocked;
  const features = stringsOf(t(`dashboard.choice.features.${formula.key}`, { returnObjects: true }));

  const reasonText = (reason: FormulaRefusalReason) =>
    reason.kind === 'gardens'
      ? t('dashboard.choice.whyGardens', { count: reason.have, formula: name, limit: reason.limit })
      : t('dashboard.choice.whySize', {
          width: reason.width,
          height: reason.height,
          formula: name,
          maxWidth: reason.maxWidth,
          maxHeight: reason.maxHeight,
        });

  const tagSx = { height: 24, fontSize: DASHBOARD_TYPE.chip, fontWeight: 800, borderRadius: '999px' } as const;

  // SMA-448, PR #297, fix round 1 (A2) — Alexandre, 27/09: the three
  // « Choisir » « visibles dès le début dans la vue desktop ». Measured in
  // Chrome, the card's button stood 1 199 px down in a 1 280-wide window —
  // 479 px under the fold of a common laptop (720), 299 under a larger one
  // (900): no raise of the panel, no tightening of the spacing reaches
  // either. From 900 px, where the three cards stand side by side, the card
  // is DRAWN in another order — its head (tags, name, who, price), then the
  // button, then the reason of an unavailable or kept formula (under the
  // button it explains, so the three buttons stand on one line), then the
  // preview, the limits and what it contains — by CSS order alone: the DOM
  // keeps the mock-up's order, so a screen reader hears the card as V3-01
  // wrote it, and under 900 px nothing changes. Nothing is removed.
  const head = { order: { xs: 0, md: -3 } } as const;
  const choice = { order: { xs: 0, md: -2 } } as const;
  const decision = { order: { xs: 0, md: -1 } } as const;

  return (
    <Box
      component="li"
      data-formula-offer={formula.key}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        minWidth: 0,
        bgcolor: blocked ? 'surfaceSubtle' : 'background.paper',
        border: isCurrent && !blocked ? '2px solid' : '1px solid',
        borderStyle: blocked ? 'dashed' : 'solid',
        borderColor: isCurrent && !blocked ? 'primary.main' : 'borderSubtle',
        borderRadius: '14px',
        boxShadow: blocked ? 'none' : '0 2px 10px rgba(27,94,58,0.07)',
        p: isCurrent && !blocked ? '17px 19px 19px' : '18px 20px 20px',
      }}
    >
      {/* The tags: a reserved zone from 900 px, so the three cards' names align (V3-01, correction 1). */}
      <Box sx={{ ...head, minHeight: { md: 54 }, display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {isCurrent && (
            <Chip
              data-offer-tag={kept ? 'currentKept' : 'current'}
              label={t(kept ? 'dashboard.choice.tag.currentKept' : 'dashboard.choice.tag.current')}
              sx={{ ...tagSx, bgcolor: tk.okBg, color: tk.okText, border: '1px solid', borderColor: tk.invBd }}
            />
          )}
          {recommended && (
            <Chip
              data-offer-tag="recommended"
              label={t('dashboard.choice.tag.recommended')}
              sx={{ ...tagSx, bgcolor: 'primary.main', color: 'primary.contrastText' }}
            />
          )}
          {blocked && (
            <Chip
              data-offer-tag="unavailable"
              label={t('dashboard.choice.tag.unavailable')}
              sx={{ ...tagSx, bgcolor: tk.warnBg, color: tk.warnText, border: '1px solid', borderColor: tk.warnBorder }}
            />
          )}
        </Box>
        {recommended && (
          <Typography sx={{ m: 0, fontSize: `${DASHBOARD_TYPE.secondary}px`, lineHeight: 1.4, color: 'text.secondary' }}>
            {t('dashboard.choice.tag.recommendedWhy')}
          </Typography>
        )}
      </Box>

      <Typography component="h3" sx={{ ...head, m: 0, fontSize: 24, lineHeight: 1.2, fontWeight: 800 }}>
        {name}
      </Typography>
      <Typography sx={{ ...head, m: 0, fontSize: `${DASHBOARD_TYPE.secondary}px`, lineHeight: 1.45, color: 'text.secondary', minHeight: { md: 42 } }}>
        {t(`dashboard.choice.who.${formula.key}`)}
      </Typography>
      {/* V2: « 0 € — Gratuit », and nothing about a price to come. */}
      <Box sx={{ ...head, display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
        <Typography component="span" sx={{ fontSize: 34, lineHeight: 1.05, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
          {t('dashboard.choice.price')}
        </Typography>
        <Typography component="span" sx={{ fontSize: 16, fontWeight: 800, color: night ? 'primary.light' : 'primary.dark' }}>
          {t('dashboard.choice.priceFree')}
        </Typography>
      </Box>
      <Typography sx={{ ...head, m: 0, fontSize: `${DASHBOARD_TYPE.secondary}px`, lineHeight: 1.4, color: 'text.secondary' }}>
        {t('dashboard.choice.free')}
      </Typography>

      <Preview level={formula.key} dim={blocked} />
      <Typography sx={{ m: 0, fontSize: `${DASHBOARD_TYPE.secondary}px`, lineHeight: 1.4, color: 'text.secondary' }}>
        {t(`dashboard.choice.preview.${formula.key}`)}
      </Typography>

      {/* The limits — as the catalogue serves them (R8, V3). */}
      <Box
        component="ul"
        data-offer-limits
        sx={{ m: 0, p: '11px 13px', listStyle: 'none', bgcolor: blocked ? 'background.paper' : tk.tint, borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '7px' }}
      >
        <Box component="li" sx={{ display: 'flex', alignItems: 'flex-start', gap: '9px', fontSize: `${DASHBOARD_TYPE.secondary}px`, lineHeight: 1.4, fontWeight: 700 }}>
          <YardOutlinedIcon aria-hidden sx={{ fontSize: 18, color: 'primary.main', mt: '1px', flexShrink: 0 }} />
          <span>
            {formula.gardenLimit === null
              ? t('dashboard.choice.limitGardensNone')
              : t('dashboard.choice.limitGardens', { count: formula.gardenLimit })}
          </span>
        </Box>
        <Box component="li" sx={{ display: 'flex', alignItems: 'flex-start', gap: '9px', fontSize: `${DASHBOARD_TYPE.secondary}px`, lineHeight: 1.4, fontWeight: 700 }}>
          <GridOnOutlinedIcon aria-hidden sx={{ fontSize: 18, color: 'primary.main', mt: '1px', flexShrink: 0 }} />
          <span>{t('dashboard.choice.limitSize', { width: formula.maxGardenSize.width, height: formula.maxGardenSize.height })}</span>
        </Box>
      </Box>

      <Typography sx={{ m: 0, mt: '4px', fontSize: `${DASHBOARD_TYPE.secondary}px`, lineHeight: 1.45, fontWeight: 800 }}>
        {previous ? t('dashboard.choice.plus', { formula: nameOf(previous.key) }) : t('dashboard.choice.contains')}
      </Typography>
      <Box component="ul" data-offer-features sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '7px' }}>
        {features.map((feature) => (
          <Box key={feature} component="li" sx={{ display: 'flex', alignItems: 'flex-start', gap: '9px', fontSize: `${DASHBOARD_TYPE.secondary}px`, lineHeight: 1.45 }}>
            <CheckCircleOutlineIcon aria-hidden sx={{ fontSize: 18, color: 'primary.main', mt: '2px', flexShrink: 0 }} />
            <span>{feature}</span>
          </Box>
        ))}
      </Box>

      {/* Why a card is unavailable — IN WORDS, never by the colour alone. */}
      {blocked && (
        <Box
          data-offer-why
          sx={{ ...decision, display: 'flex', alignItems: 'flex-start', gap: '10px', bgcolor: tk.warnBg, border: '1px solid', borderColor: tk.warnBorder, borderRadius: '10px', px: '13px', py: '11px' }}
        >
          <WarningAmberRoundedIcon aria-hidden sx={{ fontSize: 20, color: tk.warnIcon, mt: '1px', flexShrink: 0 }} />
          <Box sx={{ fontSize: `${DASHBOARD_TYPE.secondary}px`, lineHeight: 1.5, color: tk.warnText }}>
            {availability.reasons.map((reason, index) => (
              <Typography key={index} component="p" sx={{ m: 0, fontSize: 'inherit', fontWeight: 800, color: 'inherit' }}>
                {reasonText(reason)}
              </Typography>
            ))}
            <Typography component="p" sx={{ m: 0, fontSize: 'inherit', color: 'inherit' }}>
              {t('dashboard.choice.whyKept')}
            </Typography>
          </Box>
        </Box>
      )}

      {/* « Votre formule — conservée » (decision 2, 22/09): what the account keeps, said. */}
      {kept && (
        <Box
          data-offer-kept
          sx={{ ...decision, display: 'flex', alignItems: 'flex-start', gap: '10px', bgcolor: tk.invBg, border: '1px solid', borderColor: tk.invBd, borderRadius: '10px', px: '13px', py: '11px' }}
        >
          <InfoOutlinedIcon aria-hidden sx={{ fontSize: 20, color: 'primary.main', mt: '1px', flexShrink: 0 }} />
          <Box sx={{ fontSize: `${DASHBOARD_TYPE.secondary}px`, lineHeight: 1.5 }}>
            {availability.reasons.map((reason, index) => (
              <Typography key={index} component="p" sx={{ m: 0, fontSize: 'inherit', fontWeight: 800 }}>
                {reasonText(reason)}
              </Typography>
            ))}
            <Typography component="p" sx={{ m: 0, fontSize: 'inherit' }}>
              {t('dashboard.choice.keptNote')}
            </Typography>
          </Box>
        </Box>
      )}

      <Button
        variant={isCurrent ? 'outlined' : 'contained'}
        disabled={blocked || switching}
        onClick={() => onChoose(formula.key)}
        // At the foot of the card under 900 px (`mt: auto` takes the free
        // space of a stretched card); under the price from 900 px (A2).
        sx={{ ...choice, mt: { xs: 'auto', md: 0 }, height: 46, borderRadius: '10px', fontSize: 15, fontWeight: 800, textTransform: 'none' }}
      >
        {t(isCurrent ? 'dashboard.choice.keep' : 'dashboard.choice.choose', { formula: name })}
      </Button>
    </Box>
  );
}

/** The schematic preview of a formula's page: a form, never a content — no data, no figure, no weather. */
function Preview({ level, dim }: { level: DashboardLevel; dim: boolean }) {
  const tk = useDashboardTokens();
  const box = { bgcolor: 'background.paper', border: '1px solid', borderColor: 'borderSubtle', borderRadius: '4px' } as const;
  return (
    <Box
      aria-hidden
      data-offer-preview
      sx={{
        bgcolor: 'surfaceSubtle',
        border: '1px solid',
        borderColor: 'borderSubtle',
        borderRadius: '10px',
        p: '8px',
        height: 122,
        display: 'flex',
        flexDirection: 'column',
        gap: '5px',
        overflow: 'hidden',
        opacity: dim ? 0.55 : 1,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
        <Box sx={{ height: 7, width: 46, borderRadius: '3px', bgcolor: 'primary.main', opacity: 0.75 }} />
        <Box sx={{ height: 7, width: 22, borderRadius: '3px', bgcolor: tk.chipBorder, ml: 'auto' }} />
        {level !== 'novice' && <Box sx={{ height: 7, width: 16, borderRadius: '3px', bgcolor: tk.chipBorder }} />}
      </Box>
      {level === 'novice' && (
        <Box sx={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '5px' }}>
          {[0, 1, 2].map((index) => (
            <Box key={index} sx={{ ...box, borderColor: tk.chipBorder, borderRadius: '5px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ height: 26, bgcolor: tk.thumbCellOn, borderBottom: '1px solid', borderColor: tk.thumbCellFrame, flexShrink: 0 }} />
              <Box sx={{ p: '5px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <Box sx={{ height: 4, width: '70%', borderRadius: '2px', bgcolor: tk.track }} />
                <Box sx={{ height: 4, width: '50%', borderRadius: '2px', bgcolor: 'primary.main', opacity: 0.5 }} />
                <Box sx={{ height: 4, width: '85%', borderRadius: '2px', bgcolor: tk.track }} />
              </Box>
            </Box>
          ))}
        </Box>
      )}
      {level === 'gardener' && (
        <Box sx={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gridAutoRows: 'minmax(0, 1fr)', gap: '5px' }}>
          <Box sx={{ ...box, gridColumn: 'span 2' }} />
          <Box sx={{ ...box, gridColumn: 'span 2', gridRow: 'span 2' }} />
          <Box sx={{ ...box, gridColumn: 'span 2' }} />
          <Box sx={{ ...box, gridColumn: 'span 2' }} />
          <Box sx={{ ...box, gridColumn: 'span 2' }} />
        </Box>
      )}
      {level === 'expert' && (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '5px', flexShrink: 0 }}>
            {[0, 1, 2, 3].map((index) => (
              <Box key={index} sx={{ height: 12, borderRadius: '4px', bgcolor: 'background.paper', border: '1px solid', borderColor: 'primary.main', opacity: 0.85 }} />
            ))}
          </Box>
          <Box sx={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gridAutoRows: 'minmax(0, 1fr)', gap: '5px' }}>
            <Box sx={{ ...box, gridColumn: 'span 2' }} />
            <Box sx={{ ...box, gridColumn: 'span 2' }} />
            <Box sx={{ ...box, gridColumn: 'span 2' }} />
            <Box sx={{ ...box, gridColumn: 'span 2' }} />
          </Box>
        </>
      )}
    </Box>
  );
}

// ── The comparison ───────────────────────────────────────────────────────

interface ComparisonProps {
  catalog: FormulasCatalog;
  nameOf: (level: DashboardLevel) => string;
}

function Comparison({ catalog, nameOf }: ComparisonProps) {
  const { t } = useTranslation();
  // M10 (the complete review): a « Oui » in `primary.dark` read 3.41:1 on the
  // table and 2.96:1 on its even rows at night — `primary.light` there.
  const night = useTheme().palette.mode === 'dark';

  /** The rows: the two limits from the catalogue, then the ten of V3-01, as the language says them — each cell with its meaning. */
  const rows: Array<{ key: string; label: string; cells: Array<{ text: string; tone: Tone }> }> = [
    {
      key: 'gardens',
      label: t('dashboard.choice.compare.rows.gardens'),
      // « Sans limite » is the best value of its row — the tone of a yes; a number is a figure.
      cells: catalog.formulas.map((formula) =>
        formula.gardenLimit === null
          ? { text: t('dashboard.choice.compare.unlimited'), tone: 'yes' as const }
          : { text: t('dashboard.choice.compare.upTo', { count: formula.gardenLimit }), tone: 'neutral' as const }
      ),
    },
    {
      key: 'size',
      label: t('dashboard.choice.compare.rows.size'),
      cells: catalog.formulas.map((formula) => ({
        text: t('dashboard.choice.compare.upToSize', { width: formula.maxGardenSize.width, height: formula.maxGardenSize.height }),
        tone: 'neutral' as const,
      })),
    },
    ...STATIC_ROWS.map(({ key, tones }) => ({
      key,
      label: t(`dashboard.choice.compare.rows.${key}.label`),
      cells: catalog.formulas.map((formula) => ({ text: t(`dashboard.choice.compare.rows.${key}.${formula.key}`), tone: tones[formula.key] })),
    })),
  ];

  /** « Oui » in green, « Non » muted, a figure as it is — as V3-01 colours them, by the cell's MEANING (S3). */
  const cellSx = (tone: Tone) => ({
    fontSize: `${DASHBOARD_TYPE.secondary}px`,
    lineHeight: 1.45,
    fontWeight: tone === 'neutral' ? 500 : 700,
    color: tone === 'yes' ? (night ? 'primary.light' : 'primary.dark') : tone === 'no' ? 'text.secondary' : 'text.primary',
  });

  return (
    <Box component="section" aria-labelledby="formula-compare-title" sx={{ mt: '18px' }}>
      <Typography component="h3" id="formula-compare-title" sx={{ m: 0, mb: '6px', fontSize: { xs: 19, sm: 22 }, lineHeight: 1.3, fontWeight: 800 }}>
        {t('dashboard.choice.compare.title')}
      </Typography>
      <Typography sx={{ m: 0, mb: '16px', fontSize: `${DASHBOARD_TYPE.secondary}px`, lineHeight: 1.5, color: 'text.secondary', maxWidth: 760 }}>
        {t('dashboard.choice.compare.subtitle')}
      </Typography>

      {/* From 900 px: a table. */}
      <Box
        component="table"
        data-formula-compare
        sx={{
          display: { xs: 'none', md: 'table' },
          width: '100%',
          borderCollapse: 'separate',
          borderSpacing: 0,
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'borderSubtle',
          borderRadius: '12px',
          overflow: 'hidden',
          '& th, & td': { p: '12px 14px', textAlign: 'left', verticalAlign: 'top', borderBottom: '1px solid', borderColor: 'borderSubtle' },
          '& thead th': { bgcolor: 'surfaceSubtle', fontSize: 15, fontWeight: 800 },
          '& tbody th': { width: '28%', fontSize: `${DASHBOARD_TYPE.secondary}px`, lineHeight: 1.45, fontWeight: 700 },
          '& tbody tr:nth-of-type(even) th, & tbody tr:nth-of-type(even) td': { bgcolor: 'surfaceSubtle' },
          '& tr:last-of-type th, & tr:last-of-type td': { borderBottom: 0 },
        }}
      >
        <thead>
          <tr>
            <th scope="col" style={{ width: '28%' }}>
              <span aria-hidden>&nbsp;</span>
            </th>
            {catalog.formulas.map((formula) => (
              <th key={formula.key} scope="col">
                {nameOf(formula.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.label}</th>
              {row.cells.map((cell, index) => (
                <Box component="td" key={index} data-compare-tone={cell.tone} sx={cellSx(cell.tone)}>
                  {cell.text}
                </Box>
              ))}
            </tr>
          ))}
        </tbody>
      </Box>

      {/* Under 900 px: ONE LIST PER FORMULA — never a horizontal scroll, never an ellipsis (V3-01). */}
      <Box sx={{ display: { xs: 'flex', md: 'none' }, flexDirection: 'column', gap: '14px' }}>
        {catalog.formulas.map((formula, column) => (
          <Box
            key={formula.key}
            data-formula-compare-list={formula.key}
            sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'borderSubtle', borderRadius: '12px', overflow: 'hidden' }}
          >
            <Typography component="h4" sx={{ m: 0, px: '15px', py: '11px', bgcolor: 'surfaceSubtle', borderBottom: '1px solid', borderColor: 'borderSubtle', fontSize: 16, fontWeight: 800 }}>
              {nameOf(formula.key)}
            </Typography>
            <Box component="dl" sx={{ m: 0, p: 0 }}>
              {rows.map((row) => (
                <Box
                  key={row.key}
                  sx={{ display: 'flex', gap: '12px', alignItems: 'baseline', px: '15px', py: '10px', borderBottom: '1px solid', borderColor: 'borderSubtle', '&:last-of-type': { borderBottom: 0 } }}
                >
                  <Box component="dt" sx={{ flex: '0 0 47%', fontSize: `${DASHBOARD_TYPE.secondary}px`, lineHeight: 1.4, color: 'text.secondary', fontWeight: 600 }}>
                    {row.label}
                  </Box>
                  <Box
                    component="dd"
                    data-compare-tone={row.cells[column]?.tone ?? 'neutral'}
                    sx={{ m: 0, flex: 1, minWidth: 0, ...cellSx(row.cells[column]?.tone ?? 'neutral'), bgcolor: 'transparent' }}
                  >
                    {row.cells[column]?.text}
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
