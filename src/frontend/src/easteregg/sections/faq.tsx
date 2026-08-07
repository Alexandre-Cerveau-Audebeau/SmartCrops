import { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { useTranslation } from 'react-i18next';
import SectionHeader from '../../components/plantDetail/SectionHeader';
import { Sym } from '../../components/Sym';
import type { EasterEggEntry } from '../types';

const F = 'plantDetail.faq';

/**
 * Section 14 for an easter egg: FaqSection's accordions, verbatim, one open at
 * a time with the first open by default. The catalogue's caption says the
 * questions are auto-generated from the plant's data fields; these are written,
 * so the caption would be a false claim and is not rendered.
 */
export function EggFaq({ egg }: { egg: EasterEggEntry }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<number | null>(0);
  const items = egg.faq;

  return (
    <Box id="faq" sx={{ scrollMarginTop: '80px', mb: 3 }}>
      <SectionHeader title={t(`${F}.sectionTitle`)} mb="14px" />

      <Stack spacing="10px">
        {items.map((item, i) => {
          const isOpen = open === i;
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
                component="button"
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                id={`faq-q-${i}`}
                aria-controls={`faq-panel-${i}`}
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
                    color: 'heading',
                  }}
                >
                  {item.q}
                </Box>
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
              </Box>
              {isOpen && (
                <Box
                  id={`faq-panel-${i}`}
                  role="region"
                  aria-labelledby={`faq-q-${i}`}
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
