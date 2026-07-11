import { useTranslation } from 'react-i18next';
import LegalList from '../components/Legal/LegalList';
import LegalPageLayout from '../components/Legal/LegalPageLayout';
import LegalParagraph from '../components/Legal/LegalParagraph';
import LegalSection from '../components/Legal/LegalSection';

/** SMA-35: /legal-notice — Mentions légales (trame §1). */
export default function LegalNotice() {
  const { t } = useTranslation();

  return (
    <LegalPageLayout
      title={t('legal.mentions.title')}
      subtitle={t('legal.mentions.subtitle')}
    >
      <LegalSection number="01" title={t('legal.mentions.s01.title')}>
        <LegalParagraph text={t('legal.mentions.s01.p1')} />
        <LegalParagraph text={t('legal.mentions.s01.p2')} />
        <LegalParagraph text={t('legal.mentions.s01.p3')} />
      </LegalSection>

      <LegalSection number="02" title={t('legal.mentions.s02.title')}>
        <LegalParagraph text={t('legal.mentions.s02.body')} />
      </LegalSection>

      <LegalSection number="03" title={t('legal.mentions.s03.title')}>
        <LegalParagraph text={t('legal.mentions.s03.body')} />
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
