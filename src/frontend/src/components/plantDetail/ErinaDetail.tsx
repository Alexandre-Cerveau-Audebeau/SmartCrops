import { memo } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import SectionHeader from './SectionHeader';
import PlantGallerySection from './PlantGallerySection';
import {
  ERINA_ABOUT,
  ERINA_CHARACTERISTICS,
  ERINA_CLOSING,
  ERINA_COMMON_NAMES,
  ERINA_CULTIVATION_ROWS,
  ERINA_DISPLAY_NAME,
  ERINA_DISTRIBUTION,
  ERINA_DORMANCY_BODY,
  ERINA_DORMANCY_TITLE,
  ERINA_FAQ,
  ERINA_GALLERY_EMPTY,
  ERINA_HERO_ROWS,
  ERINA_NATIVE_RANGE,
  ERINA_OBSERVATIONS,
  ERINA_PEST_INTRO,
  ERINA_PEST_OUTRO,
  ERINA_PEST_TREATMENT,
  ERINA_PESTS,
  ERINA_PHASES,
  ERINA_PROPAGATION,
  ERINA_PROTOCOL_BODY,
  ERINA_PROTOCOL_RESPONSE,
  ERINA_PROTOCOL_TITLE,
  ERINA_RESOURCES,
  ERINA_ROUTE,
  ERINA_ROUTE_CAPTION,
  ERINA_SCIENTIFIC_NAME,
  ERINA_SIMILAR_BODY,
  ERINA_SIMILAR_TITLE,
  ERINA_SPACING,
  ERINA_SYNONYMS,
  ERINA_WATER,
  JP_FONT_STACK,
} from '../../constants/erina';
import type { ErinaRich, ErinaRow } from '../../constants/erina';

/**
 * SMA-394 — the hidden plant page, rendered entirely from `constants/erina.ts`.
 *
 * Deliberately NOT a variant of PlantDetail: that page is 1547 lines, serves
 * the site's busiest route and fetches its plant by id. This composes the same
 * visual grammar (SectionHeader + the bordered card used by Characteristics /
 * Culture) from local content, so the real page is untouched.
 *
 * Three sections of the real page are absent on purpose: no image (the gallery
 * only accepts Trefle/PlantNet sources and would ship a fabricated credit), no
 * external-resources block (it builds real GBIF/WFO/POWO links from the
 * binomial, which would be seven dead searches here), and no "plan my garden"
 * CTA (the planner's catalogue comes from GET /api/plants, so this plant can
 * never be planted).
 */

// The bordered content card used by Characteristics and Culture on the real
// page — reused verbatim so the easter egg introduces no new visual language.
const cardSx = {
  bgcolor: 'background.paper',
  border: '1px solid',
  borderColor: 'borderSubtle',
  borderRadius: '12px',
  p: '22px 24px',
  boxShadow: '0 1px 3px rgba(27,94,58,0.05)',
} as const;

const sectionSx = { mb: 3 } as const;

/** Renders a line of copy, giving every Japanese run the JP font stack. */
function Rich({ line }: { line: ErinaRich }) {
  return (
    <>
      {line.map((seg, idx) => (
        <Box
          key={idx}
          component="span"
          sx={{
            ...(seg.jp && { fontFamily: JP_FONT_STACK }),
            ...(seg.strong && { fontWeight: 700 }),
            ...(seg.italic && { fontStyle: 'italic' }),
          }}
        >
          {seg.text}
        </Box>
      ))}
    </>
  );
}

/** Label / value row, the definition-list grammar of the real fact cards. */
function FactRow({ row }: { row: ErinaRow }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        gap: { xs: '2px', sm: '16px' },
        py: '10px',
        borderBottom: '1px solid',
        borderColor: 'borderSubtle',
        '&:last-of-type': { borderBottom: 'none', pb: 0 },
        '&:first-of-type': { pt: 0 },
      }}
    >
      <Typography
        component="dt"
        sx={{
          flexShrink: 0,
          width: { sm: 200 },
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: 'text.secondary',
          pt: { sm: '2px' },
        }}
      >
        {row.label}
      </Typography>
      <Typography
        component="dd"
        sx={{ m: 0, flex: 1, fontSize: 14.5, lineHeight: 1.6 }}
      >
        <Rich line={row.value} />
      </Typography>
    </Box>
  );
}

function FactTable({ rows }: { rows: readonly ErinaRow[] }) {
  return (
    <Box component="dl" sx={{ ...cardSx, m: 0 }}>
      {rows.map((row) => (
        <FactRow key={row.label} row={row} />
      ))}
    </Box>
  );
}

export const ErinaDetail = memo(function ErinaDetail() {
  return (
    <Box sx={{ pb: 4 }}>
      {/* ── 01 · Hero — title, binomial, trait table, about ───────────────── */}
      <Card variant="outlined" sx={{ mb: 3, borderRadius: 3 }}>
        <CardContent>
          <Typography
            variant="h3"
            fontWeight={700}
            sx={{ mb: 0.5, color: 'heading', fontFamily: JP_FONT_STACK }}
          >
            {ERINA_DISPLAY_NAME}
          </Typography>
          <Typography
            variant="h6"
            color="text.secondary"
            sx={{ fontStyle: 'italic', mb: 3 }}
          >
            {ERINA_SCIENTIFIC_NAME}
          </Typography>

          <FactTable rows={ERINA_HERO_ROWS} />

          <Box sx={{ mt: 3 }}>
            {ERINA_ABOUT.map((para, idx) => (
              <Typography
                key={idx}
                variant="body1"
                sx={{
                  lineHeight: 1.8,
                  mb: idx === ERINA_ABOUT.length - 1 ? 0 : 2,
                }}
              >
                <Rich line={para} />
              </Typography>
            ))}
          </Box>
        </CardContent>
      </Card>

      {/* ── 02 · Gallery — empty by design ────────────────────────────────── */}
      <Box sx={sectionSx}>
        <SectionHeader title="Photo gallery" />
        <PlantGallerySection
          images={[]}
          onSelect={() => {}}
          emptyMessage={
            <>
              {ERINA_GALLERY_EMPTY.map((line) => (
                <Typography key={line} sx={{ fontStyle: 'italic' }}>
                  {line}
                </Typography>
              ))}
            </>
          }
        />
      </Box>

      {/* ── 03 · Distribution + the six-stop route ────────────────────────── */}
      <Box sx={sectionSx}>
        <SectionHeader title="World distribution" />
        <Box sx={cardSx}>
          <Box component="dl" sx={{ m: 0, mb: '18px' }}>
            <FactRow
              row={{
                label: 'Native range',
                value: [{ text: ERINA_NATIVE_RANGE }],
              }}
            />
            <FactRow
              row={{
                label: 'Distribution',
                value: [{ text: ERINA_DISTRIBUTION }],
              }}
            />
          </Box>
          <Typography
            sx={{ fontSize: 13, color: 'text.secondary', mb: '12px' }}
          >
            {ERINA_ROUTE_CAPTION}
          </Typography>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            {ERINA_ROUTE.map((stop, idx) => (
              <Box
                key={stop.name}
                sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                {idx > 0 && (
                  <Box
                    aria-hidden="true"
                    sx={{ color: 'text.secondary', fontSize: 14 }}
                  >
                    →
                  </Box>
                )}
                <Box
                  sx={{
                    px: '14px',
                    py: '7px',
                    borderRadius: '999px',
                    border: '1px solid',
                    borderColor: stop.pending ? 'borderSubtle' : 'primary.main',
                    bgcolor: stop.pending ? 'transparent' : 'brandTintBg',
                    color: stop.pending ? 'text.secondary' : 'heading',
                    fontSize: 13,
                    fontWeight: 700,
                    fontStyle: stop.pending ? 'italic' : 'normal',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {stop.pending ? `${stop.name} (pending)` : stop.name}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      {/* ── 04 · Calendar & dormancy ──────────────────────────────────────── */}
      <Box sx={sectionSx}>
        <SectionHeader title="Calendar & dormancy" />
        <Box sx={cardSx}>
          <Typography
            sx={{ fontSize: 15, fontWeight: 700, color: 'heading', mb: '8px' }}
          >
            {ERINA_DORMANCY_TITLE}
          </Typography>
          <Typography sx={{ lineHeight: 1.7, mb: '20px' }}>
            <Rich line={ERINA_DORMANCY_BODY} />
          </Typography>

          <Typography
            sx={{ fontSize: 15, fontWeight: 700, color: 'heading', mb: '8px' }}
          >
            {ERINA_PROTOCOL_TITLE}
          </Typography>
          <Typography sx={{ lineHeight: 1.7, mb: '12px' }}>
            {ERINA_PROTOCOL_BODY}
          </Typography>
          <Box
            sx={{
              bgcolor: 'surfaceSubtle',
              border: '1px solid',
              borderColor: 'borderSubtle',
              borderRadius: '10px',
              px: '18px',
              py: '14px',
              mb: '22px',
              fontFamily: JP_FONT_STACK,
              fontSize: 22,
              fontWeight: 700,
              color: 'heading',
              textAlign: 'center',
            }}
          >
            {ERINA_PROTOCOL_RESPONSE}
          </Box>

          <Box component="dl" sx={{ m: 0 }}>
            {ERINA_PHASES.map((phase) => (
              <FactRow
                key={phase.phase}
                row={{
                  label: phase.phase,
                  value: [
                    { text: phase.period, strong: true },
                    { text: ` — ${phase.notes}` },
                  ],
                }}
              />
            ))}
          </Box>
        </Box>
      </Box>

      {/* ── 05 · Characteristics ──────────────────────────────────────────── */}
      <Box sx={sectionSx}>
        <SectionHeader title="Characteristics" />
        <FactTable rows={ERINA_CHARACTERISTICS} />
      </Box>

      {/* ── 06 · Cultivation & greenhouse ─────────────────────────────────── */}
      <Box sx={sectionSx}>
        <SectionHeader title="Cultivation & greenhouse" />
        <Box sx={cardSx}>
          <Box component="dl" sx={{ m: 0, mb: '18px' }}>
            <FactRow
              row={{ label: 'Recommended spacing', value: ERINA_SPACING }}
            />
          </Box>

          <Typography
            sx={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: 'text.secondary',
              mb: '10px',
            }}
          >
            Preferred water quality
          </Typography>
          <Box
            component="ul"
            sx={{ m: 0, mb: '18px', pl: '20px', lineHeight: 1.9 }}
          >
            {ERINA_WATER.map((item, idx) => (
              <Box component="li" key={idx} sx={{ fontSize: 14.5 }}>
                <Rich line={item} />
              </Box>
            ))}
          </Box>

          <Box component="dl" sx={{ m: 0 }}>
            {ERINA_CULTIVATION_ROWS.map((row) => (
              <FactRow key={row.label} row={row} />
            ))}
          </Box>
        </Box>
      </Box>

      {/* ── 07 · Diseases & pests ─────────────────────────────────────────── */}
      <Box sx={sectionSx}>
        <SectionHeader title="Diseases & pests" />
        <Box sx={cardSx}>
          <Typography
            sx={{ fontSize: 15, fontWeight: 700, color: 'heading', mb: '14px' }}
          >
            {ERINA_PEST_INTRO}
          </Typography>
          <Box component="dl" sx={{ m: 0, mb: '18px' }}>
            {ERINA_PESTS.map((row) => (
              <FactRow key={row.label} row={row} />
            ))}
          </Box>
          <Typography sx={{ lineHeight: 1.7, mb: '10px' }}>
            <Rich line={ERINA_PEST_TREATMENT} />
          </Typography>
          <Typography sx={{ lineHeight: 1.7, color: 'text.secondary' }}>
            {ERINA_PEST_OUTRO}
          </Typography>
        </Box>
      </Box>

      {/* ── 08 · Common names ─────────────────────────────────────────────── */}
      <Box sx={sectionSx}>
        <SectionHeader title="Common names" />
        <Box sx={cardSx}>
          <Box component="dl" sx={{ m: 0 }}>
            {ERINA_COMMON_NAMES.map((entry) => (
              <FactRow
                key={entry.language}
                row={{ label: entry.language, value: entry.names }}
              />
            ))}
          </Box>
        </Box>
      </Box>

      {/* ── 09 · Botanical synonyms ───────────────────────────────────────── */}
      <Box sx={sectionSx}>
        <SectionHeader title="Botanical synonyms" />
        <Box sx={cardSx}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {ERINA_SYNONYMS.map((syn) => (
              <Box
                key={syn.name}
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'baseline',
                  gap: '10px',
                }}
              >
                <Box
                  sx={{
                    px: '14px',
                    py: '7px',
                    borderRadius: '999px',
                    border: '1px solid',
                    borderColor: 'borderSubtle',
                    bgcolor: 'surfaceSubtle',
                    fontSize: 13,
                    fontStyle: 'italic',
                    fontWeight: 500,
                  }}
                >
                  {syn.name}
                </Box>
                <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
                  <Rich line={syn.gloss} />
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      {/* ── 10 · Observations & phenology ─────────────────────────────────── */}
      <Box sx={sectionSx}>
        <SectionHeader title="Observations & phenology" />
        <Box sx={cardSx}>
          <Box component="dl" sx={{ m: 0 }}>
            {ERINA_OBSERVATIONS.map((obs) => (
              <FactRow
                key={`${obs.date}-${obs.location}`}
                row={{
                  label: `${obs.date} · ${obs.location}`,
                  value: obs.key
                    ? [{ text: '★ ', strong: true }, ...obs.note]
                    : obs.note,
                }}
              />
            ))}
          </Box>
        </Box>
      </Box>

      {/* ── 11 · Resources — labels only, no invented URLs ────────────────── */}
      <Box sx={sectionSx}>
        <SectionHeader title="Resources" />
        <Box sx={cardSx}>
          <Box component="dl" sx={{ m: 0 }}>
            {ERINA_RESOURCES.map((row) => (
              <FactRow key={row.label} row={row} />
            ))}
          </Box>
        </Box>
      </Box>

      {/* ── 12 · Similar plants ───────────────────────────────────────────── */}
      <Box sx={sectionSx}>
        <SectionHeader title="Similar plants" />
        <Box sx={cardSx}>
          <Typography
            sx={{ fontSize: 20, fontWeight: 800, color: 'heading', mb: '10px' }}
          >
            {ERINA_SIMILAR_TITLE}
          </Typography>
          {ERINA_SIMILAR_BODY.map((para, idx) => (
            <Typography
              key={idx}
              sx={{
                lineHeight: 1.7,
                mb: idx === ERINA_SIMILAR_BODY.length - 1 ? 0 : 1,
              }}
            >
              <Rich line={para} />
            </Typography>
          ))}
        </Box>
      </Box>

      {/* ── 13 · FAQ ──────────────────────────────────────────────────────── */}
      <Box sx={sectionSx}>
        <SectionHeader title="Frequently asked questions" />
        <Box sx={cardSx}>
          <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none' }}>
            {ERINA_FAQ.map((question, idx) => (
              <Box
                component="li"
                key={idx}
                sx={{
                  py: '11px',
                  fontSize: 15,
                  borderBottom: '1px solid',
                  borderColor: 'borderSubtle',
                  '&:last-of-type': { borderBottom: 'none', pb: 0 },
                  '&:first-of-type': { pt: 0 },
                }}
              >
                <Rich line={question} />
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      {/* ── 14 · Propagation notes + the closing line ─────────────────────── */}
      <Box sx={sectionSx}>
        <SectionHeader title="Propagation notes" />
        <Box sx={cardSx}>
          {ERINA_PROPAGATION.map((para, idx) => (
            <Typography
              key={idx}
              sx={{
                lineHeight: 1.8,
                mb: idx === ERINA_PROPAGATION.length - 1 ? 0 : 2,
              }}
            >
              <Rich line={para} />
            </Typography>
          ))}
        </Box>
      </Box>

      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography
          component="p"
          sx={{
            fontSize: { xs: 22, md: 28 },
            fontWeight: 700,
            color: 'heading',
          }}
        >
          <Rich line={ERINA_CLOSING} />
        </Typography>
      </Box>
    </Box>
  );
});
