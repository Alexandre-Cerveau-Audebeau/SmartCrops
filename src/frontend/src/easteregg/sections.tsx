import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { Sym } from '../components/Sym';
import type { EggGauge, EggNote, EggObservation } from './types';

/**
 * SMA-394 — the ONLY markup this feature owns.
 *
 * Every section of the page is rendered by the product's own component, fed
 * with the entry's data. What is left over is here, and only because the real
 * components have no slot for it:
 *
 * - `EggGauges`   — the hero gauge row, whose real version reads eight fixed
 *                   DTO fields; this entry's eight conditions are not those.
 * - `EggNotes`    — written paragraphs attached under a section whose component
 *                   renders facts, never prose.
 * - `EggTravelLog`— one more card under section 11, in the same card grammar.
 * - `EggCard`     — the shared card shell those two sit in.
 * - `EggFinalLine`— the closing line, alone at the foot of the page.
 *
 * Markup follows the real components it sits beside (`PlantHeroGauges`,
 * `ObservationsSection`) so nothing here reads as a foreign block.
 */

/** The bordered content card the page uses for every fact panel. */
const cardSx = {
  bgcolor: 'background.paper',
  border: '1px solid',
  borderColor: 'borderSubtle',
  borderRadius: '12px',
  p: '22px 24px',
  boxShadow: '0 1px 3px rgba(27,94,58,0.05)',
} as const;

/** Card shell, spaced like the section it follows. */
export function EggCard({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ ...cardSx, mt: -1, mb: 3 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {children}
      </Box>
    </Box>
  );
}

/**
 * Hero "growing conditions" row — same grid, same tinted icon tile, same label
 * and value type scale as {@link PlantHeroGauges}, driven by written values
 * instead of the eight DTO fields the real one formats.
 */
export function EggGauges({ gauges }: { gauges: readonly EggGauge[] }) {
  const { t } = useTranslation();
  if (gauges.length === 0) return null;
  return (
    <Box sx={{ mt: 2.5 }}>
      <Typography
        component="h2"
        sx={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          color: 'text.secondary',
          fontWeight: 700,
          mb: '10px',
        }}
      >
        {t('plantDetail.gauges.title')}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
          gap: '12px',
        }}
      >
        {gauges.map((g) => (
          <Box
            key={g.key}
            sx={{
              bgcolor: 'background.paper',
              border: '1px solid',
              borderColor: 'borderSubtle',
              borderRadius: '12px',
              padding: '14px',
              display: 'flex',
              gap: '11px',
              alignItems: 'flex-start',
              boxShadow: '0 1px 3px rgba(27,94,58,0.05)',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                flexShrink: 0,
                bgcolor: 'brandTintBg',
                color: 'primary.main',
                borderRadius: '9px',
              }}
            >
              <Sym name={g.icon} size={21} color="inherit" />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                sx={{
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'text.secondary',
                  fontWeight: 700,
                }}
              >
                {g.label}
              </Typography>
              <Typography
                sx={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: 'heading',
                  lineHeight: 1.2,
                  mt: '1px',
                }}
              >
                {g.value}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/** One written paragraph, in the page's own body type scale. */
function Note({ note }: { note: EggNote }) {
  if (note.tone === 'quote') {
    return (
      <Typography
        sx={{
          textAlign: 'center',
          fontSize: 20,
          fontWeight: 700,
          color: 'heading',
          py: '6px',
        }}
      >
        {note.text}
      </Typography>
    );
  }
  return (
    <Typography
      sx={{
        fontSize: note.tone === 'lead' ? 15 : 14.5,
        fontWeight: note.tone === 'lead' ? 700 : 400,
        fontStyle: note.tone === 'closing' ? 'italic' : 'normal',
        color:
          note.tone === 'lead' || note.tone === 'closing'
            ? 'heading'
            : 'text.primary',
        lineHeight: 1.65,
      }}
    >
      {note.text}
    </Typography>
  );
}

/**
 * The written prose of a section, in the same card the section's own facts sit
 * in — never a label/value grid, which is what the real components are for.
 */
export function EggNotes({ notes }: { notes: readonly EggNote[] }) {
  if (notes.length === 0) return null;
  return (
    <EggCard>
      {notes.map((n) => (
        <Note key={n.text} note={n} />
      ))}
    </EggCard>
  );
}

/**
 * The travel log under section 11 — additional content in the observation
 * section's card grammar, sitting beside its charts rather than replacing them.
 */
export function EggTravelLog({
  observations,
}: {
  observations: readonly EggObservation[];
}) {
  if (observations.length === 0) return null;
  return (
    <EggCard>
      {observations.map((o) => (
        <Box
          key={`${o.date}-${o.location}`}
          sx={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}
        >
          <Typography
            sx={{
              flexShrink: 0,
              width: 64,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'text.secondary',
            }}
          >
            {o.date}
          </Typography>
          <Typography sx={{ fontSize: 14.5, lineHeight: 1.6 }}>
            <Box
              component="span"
              sx={{ fontWeight: 700, color: 'heading', mr: '6px' }}
            >
              {o.starred ? `★ ${o.location}` : o.location}
            </Box>
            {o.note}
          </Typography>
        </Box>
      ))}
    </EggCard>
  );
}

/** The last thing on the page, alone and centred. */
export function EggFinalLine({ text }: { text: string }) {
  return (
    <Box sx={{ textAlign: 'center', py: '48px' }}>
      <Typography
        sx={{
          fontSize: { xs: 22, sm: 26 },
          fontWeight: 800,
          color: 'heading',
          letterSpacing: '-0.01em',
        }}
      >
        {text}
      </Typography>
    </Box>
  );
}
