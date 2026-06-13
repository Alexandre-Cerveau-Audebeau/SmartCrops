import { useTranslation } from 'react-i18next';
import LegalList from '../components/Legal/LegalList';
import LegalPageLayout from '../components/Legal/LegalPageLayout';
import LegalParagraph from '../components/Legal/LegalParagraph';
import LegalSection from '../components/Legal/LegalSection';

/** SMA-35: /terms — Conditions générales d'utilisation (trame §3). */
export default function Terms() {
  const { t } = useTranslation();

  return (
    <LegalPageLayout title={t('legal.terms.title')}>
      <LegalSection number="01" title={t('legal.terms.s01.title')}>
        <LegalParagraph text={t('legal.terms.s01.body')} />
      </LegalSection>

      <LegalSection number="02" title={t('legal.terms.s02.title')}>
        <LegalList
          items={[
            t('legal.terms.s02.items.free'),
            t('legal.terms.s02.items.asIs'),
          ]}
        />
      </LegalSection>

      <LegalSection number="03" title={t('legal.terms.s03.title')}>
        <LegalList
          items={[
            t('legal.terms.s03.items.accuracy'),
            t('legal.terms.s03.items.signup'),
          ]}
        />
      </LegalSection>

      <LegalSection number="04" title={t('legal.terms.s04.title')}>
        <LegalList
          items={[
            t('legal.terms.s04.items.ownership'),
            t('legal.terms.s04.items.conduct'),
            t('legal.terms.s04.items.removal'),
          ]}
        />
      </LegalSection>

      <LegalSection number="05" title={t('legal.terms.s05.title')}>
        <LegalParagraph text={t('legal.terms.s05.p1')} />
        <LegalParagraph text={t('legal.terms.s05.p2')} />
      </LegalSection>

      <LegalSection number="06" title={t('legal.terms.s06.title')}>
        <LegalParagraph text={t('legal.terms.s06.body')} />
      </LegalSection>

      <LegalSection number="07" title={t('legal.terms.s07.title')}>
        <LegalList
          items={[
            t('legal.terms.s07.items.bestEffort'),
            t('legal.terms.s07.items.links'),
            t('legal.terms.s07.items.liability'),
          ]}
        />
      </LegalSection>

      <LegalSection number="08" title={t('legal.terms.s08.title')}>
        <LegalParagraph text={t('legal.terms.s08.body')} />
      </LegalSection>

      <LegalSection number="09" title={t('legal.terms.s09.title')}>
        <LegalParagraph text={t('legal.terms.s09.body')} />
      </LegalSection>

      <LegalSection number="10" title={t('legal.terms.s10.title')}>
        <LegalParagraph text={t('legal.terms.s10.body')} />
      </LegalSection>
    </LegalPageLayout>
  );
}
