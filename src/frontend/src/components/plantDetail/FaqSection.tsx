import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { useUnitSystem } from '../../hooks/useUnitSystem';
import type { Plant } from '../../types/Plant';
import { buildFaqItems, type FaqItem } from '../../utils/plantDetailFaq';
import SectionHeader from './SectionHeader';
import { Sym } from '../Sym';

const F = 'plantDetail.faq';

/**
 * Auto-generated FAQ section for Plant Detail v2 (SMA-78, PR C). Accordions built
 * from {@link buildFaqItems}; one open at a time, the first open by default. The
 * parent mounts it only when at least one item exists (TOC entry 14 = live).
 */
export default function FaqSection({
  plant,
  // --- SMA-394 easter eggs — delete this line to remove ---
  items: writtenItems,
  // --- end SMA-394 ---
}: {
  plant: Plant;
  /** Written questions, replacing the ones derived from the plant's fields. */
  items?: readonly FaqItem[];
}) {
  const { t } = useTranslation();
  const { system } = useUnitSystem();
  const items = writtenItems ?? buildFaqItems(plant, t, system);
  const [open, setOpen] = useState<number | null>(0);

  if (items.length === 0) return null;

  return (
    <Box id="faq" sx={{ scrollMarginTop: '80px', mb: 3 }}>
      {/* Header (outside the cards). */}
      <SectionHeader
        title={t(`${F}.sectionTitle`)}
        mb={writtenItems ? '14px' : '4px'}
      />
      {/* --- SMA-394 easter eggs — delete `!writtenItems && ` to remove ---
          The caption says the questions are auto-generated from the plant's
          data fields; written questions are not, so it would be a false claim. */}
      {!writtenItems && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            mb: '14px',
            fontSize: 13,
            color: 'text.secondary',
          }}
        >
          <Sym name="bolt" size={15} color="inherit" />
          {t(`${F}.caption`)}
        </Box>
      )}
      {/* --- end SMA-394 --- */}

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
