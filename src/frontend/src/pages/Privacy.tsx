import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import LegalList from '../components/Legal/LegalList';
import LegalPageLayout from '../components/Legal/LegalPageLayout';
import LegalParagraph from '../components/Legal/LegalParagraph';
import LegalSection from '../components/Legal/LegalSection';
import ResponsiveLegalTable from '../components/Legal/ResponsiveLegalTable';

const DATA_ROW_KEYS = [
  'account',
  'google',
  'profile',
  'content',
  'session',
  'language',
  'logs',
  'contact',
] as const;

const COOKIE_ROW_KEYS = [
  'auth',
  'binding',
  'language',
  'colorMode',
  'unitSystem',
  'choice',
] as const;

/** SMA-35: /privacy — Politique de confidentialité (trame §2 + tableau cookies §4.3). */
export default function Privacy() {
  const { t } = useTranslation();

  return (
    <LegalPageLayout title={t('legal.privacy.title')}>
      <LegalSection number="01" title={t('legal.privacy.s01.title')}>
        <LegalParagraph text={t('legal.privacy.s01.body')} />
      </LegalSection>

      <LegalSection number="02" title={t('legal.privacy.s02.title')}>
        <ResponsiveLegalTable
          ariaLabel={t('legal.privacy.s02.tableAriaLabel')}
          columns={[
            t('legal.privacy.s02.cols.processing'),
            t('legal.privacy.s02.cols.data'),
            t('legal.privacy.s02.cols.purpose'),
            t('legal.privacy.s02.cols.basis'),
          ]}
          rows={DATA_ROW_KEYS.map((key) => [
            t(`legal.privacy.s02.rows.${key}.name`),
            t(`legal.privacy.s02.rows.${key}.data`),
            t(`legal.privacy.s02.rows.${key}.purpose`),
            t(`legal.privacy.s02.rows.${key}.basis`),
          ])}
        />
        <LegalParagraph text={t('legal.privacy.s02.note')} />
      </LegalSection>

      <LegalSection number="03" title={t('legal.privacy.s03.title')}>
        <LegalList
          items={[
            t('legal.privacy.s03.editor'),
            t('legal.privacy.s03.subcontractorsIntro'),
          ]}
        />
        <Box sx={{ pl: 3 }}>
          <LegalList
            items={[t('legal.privacy.s03.ovh'), t('legal.privacy.s03.google')]}
          />
        </Box>
        <LegalParagraph text={t('legal.privacy.s03.noThirdParties')} />
      </LegalSection>

      <LegalSection number="04" title={t('legal.privacy.s04.title')}>
        <LegalParagraph text={t('legal.privacy.s04.body')} />
      </LegalSection>

      <LegalSection number="05" title={t('legal.privacy.s05.title')}>
        <LegalParagraph text={t('legal.privacy.s05.intro')} />
        <LegalList
          items={[
            t('legal.privacy.s05.items.account'),
            t('legal.privacy.s05.items.logs'),
            t('legal.privacy.s05.items.contact'),
          ]}
        />
      </LegalSection>

      <LegalSection number="06" title={t('legal.privacy.s06.title')}>
        <LegalParagraph text={t('legal.privacy.s06.body')} />
      </LegalSection>

      <LegalSection number="07" title={t('legal.privacy.s07.title')}>
        <LegalParagraph text={t('legal.privacy.s07.p1')} />
        <LegalParagraph text={t('legal.privacy.s07.p2')} />
        <LegalParagraph text={t('legal.privacy.s07.p3')} />
      </LegalSection>

      <LegalSection number="08" title={t('legal.privacy.s08.title')}>
        <LegalParagraph text={t('legal.privacy.s08.body')} />
      </LegalSection>

      <LegalSection number="09" title={t('legal.privacy.s09.title')}>
        <LegalParagraph text={t('legal.privacy.s09.intro')} />
        <ResponsiveLegalTable
          ariaLabel={t('legal.privacy.s09.tableAriaLabel')}
          columns={[
            t('legal.privacy.s09.cols.name'),
            t('legal.privacy.s09.cols.type'),
            t('legal.privacy.s09.cols.purpose'),
            t('legal.privacy.s09.cols.duration'),
          ]}
          rows={COOKIE_ROW_KEYS.map((key) => [
            t(`legal.privacy.s09.rows.${key}.name`),
            t(`legal.privacy.s09.rows.${key}.type`),
            t(`legal.privacy.s09.rows.${key}.purpose`),
            t(`legal.privacy.s09.rows.${key}.duration`),
          ])}
        />
      </LegalSection>

      <LegalSection number="10" title={t('legal.privacy.s10.title')}>
        <LegalParagraph text={t('legal.privacy.s10.body')} />
      </LegalSection>
    </LegalPageLayout>
  );
}
