import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useUnitSystem } from '../../hooks/useUnitSystem';
import type { Plant } from '../../types/Plant';
import { buildFaqItems } from '../../utils/plantDetailFaq';
import { Sym } from '../Sym';

const F = 'plantDetail.faq';

/**
 * Auto-generated FAQ section for Plant Detail v2 (SMA-78, PR C). Accordions built
 * from {@link buildFaqItems}; one open at a time, the first open by default. The
 * parent mounts it only when at least one item exists (TOC entry 14 = live).
 */
export default function FaqSection({ plant }: { plant: Plant }) {
  const { t } = useTranslation();
  const { system } = useUnitSystem();
  const items = buildFaqItems(plant, t, system);
  const [open, setOpen] = useState(0);

  if (items.length === 0) return null;

  return (
    <Box id="faq" sx={{ scrollMarginTop: '80px', mb: 3 }}>
      {/* Header (outside the cards). */}
      <Typography
        component="h2"
        sx={{
          m: 0,
          mb: '4px',
          fontSize: '23px',
          fontWeight: 800,
          color: '#1B5E3A',
          letterSpacing: '-0.01em',
        }}
      >
        {t(`${F}.sectionTitle`)}
      </Typography>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          mb: '14px',
          fontSize: 13,
          color: '#7a857f',
        }}
      >
        <Sym name="bolt" size={15} color="#7a857f" />
        {t(`${F}.caption`)}
      </Box>

      <Stack spacing="10px">
        {items.map((item, i) => {
          const isOpen = open === i;
          return (
            <Box
              key={item.q}
              sx={{
                bgcolor: '#fff',
                border: '1px solid #ECF1EA',
                borderRadius: '12px',
                boxShadow: '0 1px 3px rgba(27,94,58,0.05)',
                overflow: 'hidden',
              }}
            >
              <Box
                component="button"
                type="button"
                onClick={() => setOpen(isOpen ? -1 : i)}
                aria-expanded={isOpen}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  p: '16px 18px',
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  font: 'inherit',
                }}
              >
                <Box
                  sx={{
                    flex: 1,
                    fontSize: 15,
                    fontWeight: 700,
                    color: '#1B5E3A',
                  }}
                >
                  {item.q}
                </Box>
                <Box
                  sx={{
                    display: 'flex',
                    transition: 'transform 0.2s',
                    transform: isOpen ? 'rotate(180deg)' : 'none',
                  }}
                >
                  <Sym name="expand_more" size={22} color="#9aa5a0" />
                </Box>
              </Box>
              {isOpen && (
                <Box
                  sx={{
                    p: '0 18px 18px',
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: '#4a564d',
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
