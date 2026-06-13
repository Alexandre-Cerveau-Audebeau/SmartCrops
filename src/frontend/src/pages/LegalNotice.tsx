import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LegalList from '../components/Legal/LegalList';
import LegalPageLayout from '../components/Legal/LegalPageLayout';
import LegalParagraph from '../components/Legal/LegalParagraph';
import LegalSection from '../components/Legal/LegalSection';

/** Framed box for the two LCEN publisher options (trame §1.1). */
function OptionBox({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        border: '1px solid rgba(46,139,87,0.35)',
        borderRadius: 2,
        bgcolor: 'rgba(46,139,87,0.04)',
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

/** SMA-35: /legal-notice — Mentions légales (trame §1). */
export default function LegalNotice() {
  const { t } = useTranslation();

  return (
    <LegalPageLayout
      title={t('legal.mentions.title')}
      subtitle={t('legal.mentions.subtitle')}
    >
      <LegalSection number="01" title={t('legal.mentions.s01.title')}>
        <LegalParagraph text={t('legal.mentions.s01.intro')} />
        <OptionBox title={t('legal.mentions.s01.optionA.title')}>
          <LegalParagraph text={t('legal.mentions.s01.optionA.body')} />
          <Typography
            variant="body2"
            sx={{ color: 'text.secondary', fontStyle: 'italic' }}
          >
            {t('legal.mentions.s01.optionA.note')}
          </Typography>
        </OptionBox>
        <OptionBox title={t('legal.mentions.s01.optionB.title')}>
          <LegalParagraph text={t('legal.mentions.s01.optionB.body')} />
        </OptionBox>
        <LegalParagraph text={t('legal.mentions.s01.recommendation')} />
      </LegalSection>

      <LegalSection number="02" title={t('legal.mentions.s02.title')}>
        <LegalParagraph text={t('legal.mentions.s02.body')} />
      </LegalSection>

      <LegalSection number="03" title={t('legal.mentions.s03.title')}>
        <LegalParagraph text={t('legal.mentions.s03.body')} />
        <LegalParagraph text={t('legal.mentions.s03.option')} />
      </LegalSection>

      <LegalSection number="04" title={t('legal.mentions.s04.title')}>
        <LegalParagraph text={t('legal.mentions.s04.p1')} />
        <LegalParagraph text={t('legal.mentions.s04.p2')} />
        <LegalList
          items={[
            t('legal.mentions.s04.credits.gbif'),
            t('legal.mentions.s04.credits.trefle'),
            t('legal.mentions.s04.credits.perenual'),
            t('legal.mentions.s04.credits.unsplash'),
          ]}
        />
        <LegalParagraph text={t('legal.mentions.s04.p3')} />
      </LegalSection>

      <LegalSection number="05" title={t('legal.mentions.s05.title')}>
        <LegalParagraph text={t('legal.mentions.s05.body')} />
      </LegalSection>
    </LegalPageLayout>
  );
}
