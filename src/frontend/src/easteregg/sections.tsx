import { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import SectionHeader from '../components/plantDetail/SectionHeader';
import { Sym } from '../components/Sym';
import type { EasterEggEntry, EggFaqItem, EggGauge, EggRow } from './types';

/**
 * SMA-394 — the section bodies an easter-egg entry supplies.
 *
 * These reuse the real page's shared primitives (`SectionHeader`, `Sym`) and
 * copy its card grammar verbatim, but they are OWNED BY THIS FOLDER: the real
 * section components compute their content from the plant DTO and cannot be
 * handed a written block, so overriding them from outside would have meant
 * threading override props through nine live components on the site's busiest
 * page. Keeping the markup here means the application files carry only the
 * switch, and deleting this folder removes every trace.
 */

/** The bordered content card used by Characteristics / Culture / Scientific. */
const cardSx = {
  bgcolor: 'background.paper',
  border: '1px solid',
  borderColor: 'borderSubtle',
  borderRadius: '12px',
  p: '22px 24px',
  boxShadow: '0 1px 3px rgba(27,94,58,0.05)',
} as const;

const sectionSx = { mb: 3, scrollMarginTop: '80px' } as const;

/** Label / value row, the definition-list grammar of the real fact cards. */
function FactRow({ row }: { row: EggRow }) {
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
          width: { sm: 210 },
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
        {row.value}
      </Typography>
    </Box>
  );
}

function FactList({ rows }: { rows: readonly EggRow[] }) {
  return (
    <Box component="dl" sx={{ m: 0 }}>
      {rows.map((row) => (
        <FactRow key={row.label} row={row} />
      ))}
    </Box>
  );
}

/**
 * The hero gauge row. Markup and styling are the real PlantHeroGauges', so the
 * cards are visually the same object; only where the values come from differs.
 */
export function EggGauges({ gauges }: { gauges: readonly EggGauge[] }) {
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
        Growing conditions
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

export function EggCalendar({ egg }: { egg: EasterEggEntry }) {
  const c = egg.calendar;
  return (
    <Box id="lifecycle" sx={sectionSx}>
      <SectionHeader title="Seasonal calendar & timeline" />
      <Box sx={cardSx}>
        <Typography
          sx={{ fontSize: 15, fontWeight: 700, color: 'heading', mb: '8px' }}
        >
          {c.title}
        </Typography>
        <Typography sx={{ lineHeight: 1.7, mb: '20px' }}>{c.body}</Typography>

        <Typography
          sx={{ fontSize: 15, fontWeight: 700, color: 'heading', mb: '8px' }}
        >
          {c.protocolTitle}
        </Typography>
        <Typography sx={{ lineHeight: 1.7, mb: '12px' }}>
          {c.protocolBody}
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
            fontSize: 22,
            fontWeight: 700,
            color: 'heading',
            textAlign: 'center',
          }}
        >
          {c.protocolResponse}
        </Box>

        <FactList
          rows={c.phases.map((p) => ({
            label: p.phase,
            value: p.notes ? `${p.period} — ${p.notes}` : p.period,
          }))}
        />
      </Box>
    </Box>
  );
}

export function EggScientific({ egg }: { egg: EasterEggEntry }) {
  const s = egg.scientific;
  return (
    <Box id="scientific-data" sx={sectionSx}>
      <SectionHeader title="Scientific data · cultivation / greenhouse" />
      <Box sx={cardSx}>
        <Box component="dl" sx={{ m: 0, mb: '18px' }}>
          <FactRow row={{ label: s.spacingLabel, value: s.spacing }} />
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
          {s.waterTitle}
        </Typography>
        <Box
          component="ul"
          sx={{ m: 0, mb: '18px', pl: '20px', lineHeight: 1.9 }}
        >
          {s.water.map((w) => (
            <Box component="li" key={w} sx={{ fontSize: 14.5 }}>
              {w}
            </Box>
          ))}
        </Box>

        <FactList rows={s.rows} />
      </Box>
    </Box>
  );
}

export function EggCharacteristics({ egg }: { egg: EasterEggEntry }) {
  return (
    <Box id="characteristics" sx={sectionSx}>
      <SectionHeader title="Characteristics" />
      <Box sx={cardSx}>
        <FactList rows={egg.characteristics} />
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '20px',
            borderTop: '1px solid',
            borderColor: 'borderSubtle',
            pt: '16px',
            mt: '16px',
          }}
        >
          <RegionPill
            label="Native range"
            text={egg.nativeRange}
            icon="public"
          />
          <RegionPill
            label="Distribution"
            text={egg.distribution}
            icon="travel_explore"
          />
        </Box>
      </Box>
    </Box>
  );
}

function RegionPill({
  label,
  text,
  icon,
}: {
  label: string;
  text: string;
  icon: string;
}) {
  return (
    <Box>
      <Typography
        sx={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'text.secondary',
          fontWeight: 700,
          mb: '6px',
        }}
      >
        {label}
      </Typography>
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          bgcolor: 'brandTintBg',
          color: 'heading',
          borderRadius: '999px',
          px: '12px',
          py: '6px',
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        <Sym name={icon} size={16} color="inherit" />
        {text}
      </Box>
    </Box>
  );
}

export function EggCultivation({ egg }: { egg: EasterEggEntry }) {
  return (
    <Box id="edible" sx={sectionSx}>
      <SectionHeader title="Cultivation & propagation" />
      <Box sx={cardSx}>
        {egg.cultivation.map((para, i) => (
          <Typography
            key={para}
            sx={{
              lineHeight: 1.8,
              mb: i === egg.cultivation.length - 1 ? 0 : 2,
            }}
          >
            {para}
          </Typography>
        ))}
      </Box>
    </Box>
  );
}

export function EggPests({ egg }: { egg: EasterEggEntry }) {
  return (
    <Box id="pests" sx={sectionSx}>
      <SectionHeader title="Diseases & pests" />
      <Box sx={cardSx}>
        <Typography
          sx={{ fontSize: 15, fontWeight: 700, color: 'heading', mb: '14px' }}
        >
          {egg.pestIntro}
        </Typography>
        <Box component="dl" sx={{ m: 0, mb: '18px' }}>
          {egg.pests.map((p) => (
            <FactRow key={p.name} row={{ label: p.name, value: p.response }} />
          ))}
        </Box>
        <Typography sx={{ lineHeight: 1.7, mb: '10px' }}>
          {egg.pestTreatment}
        </Typography>
        <Typography sx={{ lineHeight: 1.7, color: 'text.secondary' }}>
          {egg.pestOutro}
        </Typography>
      </Box>
    </Box>
  );
}

export function EggSynonyms({ egg }: { egg: EasterEggEntry }) {
  return (
    <Box id="synonyms" sx={sectionSx}>
      <SectionHeader title="Botanical synonyms" />
      <Box sx={cardSx}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {egg.synonyms.map((s) => (
            <Box
              key={s.label}
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
                {s.label}
              </Box>
              <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
                {s.value}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

export function EggObservations({ egg }: { egg: EasterEggEntry }) {
  return (
    <Box id="plantnet" sx={sectionSx}>
      <SectionHeader title="Observations & phenology" />
      <Box sx={cardSx}>
        <FactList
          rows={egg.observations.map((o) => ({
            label: `${o.date} · ${o.location}`,
            value: o.starred ? `★ ${o.note}` : o.note,
          }))}
        />
      </Box>
    </Box>
  );
}

export function EggResources({ egg }: { egg: EasterEggEntry }) {
  return (
    <Box id="sources" sx={sectionSx}>
      <SectionHeader title="External resources" />
      <Box sx={cardSx}>
        <FactList
          rows={egg.resources.map((r) => ({
            label: r.label,
            value: r.note,
          }))}
        />
      </Box>
    </Box>
  );
}

export function EggSimilar({ egg }: { egg: EasterEggEntry }) {
  return (
    <Box id="similar" sx={sectionSx}>
      <SectionHeader title="Similar plants" />
      <Box sx={cardSx}>
        <Typography
          sx={{ fontSize: 20, fontWeight: 800, color: 'heading', mb: '10px' }}
        >
          {egg.similar.title}
        </Typography>
        {egg.similar.body.map((para, i) => (
          <Typography
            key={para}
            sx={{
              lineHeight: 1.7,
              mb: i === egg.similar.body.length - 1 ? 0 : 1,
            }}
          >
            {para}
          </Typography>
        ))}
      </Box>
    </Box>
  );
}

/**
 * The FAQ. Card grammar and open/close behaviour are the real FaqSection's; a
 * question whose entry supplies no answer renders without the chevron and
 * cannot be opened, rather than expanding onto an empty panel.
 */
export function EggFaq({ items }: { items: readonly EggFaqItem[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (items.length === 0) return null;

  return (
    <Box id="faq" sx={sectionSx}>
      <SectionHeader title="Frequently asked questions" mb="14px" />
      <Stack spacing="10px">
        {items.map((item, i) => {
          const isOpen = open === i;
          const answerable = Boolean(item.a);
          return (
            <Box
              key={item.q}
              sx={{
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'borderSubtle',
                borderRadius: '12px',
                boxShadow: '0 1px 3px rgba(27,94,58,0.05)',
                overflow: 'hidden',
              }}
            >
              <Box
                component={answerable ? 'button' : 'div'}
                type={answerable ? 'button' : undefined}
                onClick={
                  answerable ? () => setOpen(isOpen ? null : i) : undefined
                }
                aria-expanded={answerable ? isOpen : undefined}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  p: '16px 18px',
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  cursor: answerable ? 'pointer' : 'default',
                  textAlign: 'left',
                  font: 'inherit',
                }}
              >
                <Box
                  sx={{
                    flex: 1,
                    fontSize: 15,
                    fontWeight: 700,
                    color: 'heading',
                  }}
                >
                  {item.q}
                </Box>
                {answerable && (
                  <Box
                    sx={{
                      display: 'flex',
                      color: 'text.secondary',
                      transition: 'transform 0.2s',
                      transform: isOpen ? 'rotate(180deg)' : 'none',
                    }}
                  >
                    <Sym name="expand_more" size={22} color="inherit" />
                  </Box>
                )}
              </Box>
              {answerable && isOpen && (
                <Box
                  sx={{
                    p: '0 18px 18px',
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: 'text.primary',
                  }}
                >
                  {item.a}
                </Box>
              )}
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}

/** The last thing on the page, alone and centred. */
export function EggFinalLine({ text }: { text: string }) {
  return (
    <Box sx={{ textAlign: 'center', py: 6 }}>
      <Typography
        component="p"
        sx={{
          fontSize: { xs: 22, md: 28 },
          fontWeight: 700,
          fontStyle: 'italic',
          color: 'heading',
        }}
      >
        {text}
      </Typography>
    </Box>
  );
}
