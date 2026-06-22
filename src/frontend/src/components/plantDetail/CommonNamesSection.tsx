import { memo, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import InputBase from '@mui/material/InputBase';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import SectionHeader from './SectionHeader';
import StatusBadge from './StatusBadge';
import { Sym } from '../Sym';
import { groupCommonNamesByLanguage } from '../../utils/plantDetail';
import type { PlantCommonName } from '../../types/Plant';

const S = 'plantDetail.commonNames';

interface CommonNamesSectionProps {
  commonNames: readonly PlantCommonName[];
}

// Case-insensitive dedupe, preserving the helper's primary-first order.
function dedupeNames(names: readonly PlantCommonName[]): PlantCommonName[] {
  const seen = new Set<string>();
  const out: PlantCommonName[] = [];
  for (const n of names) {
    const key = n.name.trim().toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(n);
    }
  }
  return out;
}

// Localised language name via Intl.DisplayNames; fall back to the
// uppercased code when the runtime can't resolve it.
function languageDisplayName(code: string, uiLang: string): string {
  try {
    const label = new Intl.DisplayNames([uiLang], { type: 'language' }).of(
      code
    );
    if (label && label.toLowerCase() !== code.toLowerCase()) {
      return label.charAt(0).toUpperCase() + label.slice(1);
    }
  } catch {
    /* fall through to code */
  }
  return code.toUpperCase();
}

/**
 * Vernacular (common) names for Plant Detail v2 (SMA-223, section 09). A
 * horizontal carousel of language cards (code chip + localised language name
 * + pin on the page language + that language's names), with a live language
 * filter. Real data only (grouped by `groupCommonNamesByLanguage`, then
 * case-insensitively de-duplicated for display). BUILD NOW badge. Mounted
 * only when >1 name exists (gating preserved); TOC entry stays live/empty
 * accordingly. Colours are mode-aware.
 */
export const CommonNamesSection = memo(function CommonNamesSection({
  commonNames,
}: CommonNamesSectionProps) {
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const dark = palette.mode === 'dark';
  const uiLang = i18n.language.split('-')[0];
  const [query, setQuery] = useState('');

  const languages = useMemo(() => {
    const grouped = groupCommonNamesByLanguage(commonNames, uiLang);
    return Array.from(grouped.entries()).map(([code, names]) => ({
      code,
      label: languageDisplayName(code, uiLang),
      names: dedupeNames(names),
    }));
  }, [commonNames, uiLang]);

  const q = query.trim().toLowerCase();
  const visible = q
    ? languages.filter(
        (l) =>
          l.label.toLowerCase().includes(q) || l.code.toLowerCase().includes(q)
      )
    : languages;

  const activeBg = dark ? 'rgba(79,179,124,0.12)' : '#E9F4EE';
  const activeBorder = dark ? 'rgba(79,179,124,0.40)' : '#B7D8C4';
  const chipInactiveBg = dark ? 'rgba(255,255,255,0.08)' : '#EDF1ED';
  const pinColor = dark ? '#E2885C' : '#C0512E';
  const searchBg = dark ? 'rgba(255,255,255,0.04)' : '#F6F8F6';

  return (
    <Box id="common-names" sx={{ mb: 3, scrollMarginTop: '80px' }}>
      <SectionHeader
        title={t('plantDetail.sections.commonNames')}
        badge={<StatusBadge variant="build" />}
        mb="4px"
      />
      <Typography
        sx={{ m: 0, mb: '12px', fontSize: 13, color: 'text.secondary' }}
      >
        {t(`${S}.caption`, { count: languages.length })}
      </Typography>

      {/* language filter */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 0.75,
          mb: 1.5,
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'borderSubtle',
          bgcolor: searchBg,
        }}
      >
        <Sym name="search" size={18} color={palette.text.secondary} />
        <InputBase
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t(`${S}.searchPlaceholder`)}
          sx={{ flex: 1, fontSize: 14 }}
          inputProps={{ 'aria-label': t(`${S}.searchPlaceholder`) }}
        />
      </Box>

      {visible.length === 0 ? (
        <Typography sx={{ fontSize: 13, color: 'text.secondary', py: 1 }}>
          {t(`${S}.noResults`)}
        </Typography>
      ) : (
        <Box
          role="region"
          aria-label={t('plantDetail.sections.commonNames')}
          tabIndex={0}
          sx={{
            display: 'flex',
            gap: 1.5,
            overflowX: 'auto',
            pb: 1.5,
            scrollbarWidth: 'thin',
            scrollbarColor: dark
              ? 'rgba(255,255,255,0.2) transparent'
              : '#cdded0 transparent',
            '&::-webkit-scrollbar': { height: 8 },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: 'borderSubtle',
              borderRadius: 4,
            },
            '&::-webkit-scrollbar-track': { backgroundColor: 'transparent' },
            '&:focus-visible': {
              outline: '2px solid',
              outlineColor: palette.primary.main,
              outlineOffset: 2,
            },
          }}
        >
          {visible.map((lang) => {
            const active = lang.code === uiLang;
            return (
              <Box
                key={lang.code}
                sx={{
                  flex: '0 0 auto',
                  width: 210,
                  border: '1px solid',
                  borderColor: active ? activeBorder : 'borderSubtle',
                  bgcolor: active ? activeBg : palette.background.paper,
                  borderRadius: 2.5,
                  p: 1.5,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0.75,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Box
                    sx={{
                      px: 0.75,
                      py: 0.25,
                      borderRadius: 1,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      bgcolor: active ? palette.primary.main : chipInactiveBg,
                      color: active ? '#fff' : 'text.secondary',
                    }}
                  >
                    {lang.code.toUpperCase()}
                  </Box>
                  <Typography
                    sx={{
                      flex: 1,
                      fontSize: 14,
                      fontWeight: 700,
                      color: 'heading',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {lang.label}
                  </Typography>
                  {active && (
                    <Sym
                      name="push_pin"
                      size={15}
                      color={pinColor}
                      ariaLabel={t(`${S}.pinnedLabel`)}
                    />
                  )}
                </Box>
                <Typography
                  sx={{
                    fontSize: 13,
                    color: 'text.secondary',
                    lineHeight: 1.5,
                  }}
                >
                  {lang.names.map((n) => n.name).join(' · ')}
                </Typography>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
});
