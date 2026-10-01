import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import i18next from '../i18n/i18n';
import reference from '../constants/dashboardLayout.reference.json';
import Terms from './Terms';

function renderPage() {
  return render(
    <MemoryRouter>
      <Terms />
    </MemoryRouter>
  );
}

describe('Terms (SMA-35)', () => {
  beforeEach(async () => {
    await i18next.changeLanguage('en');
  });

  it('renders title, sections and the real date in English', () => {
    const { container } = renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Terms of Use' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Governing law' })
    ).toBeInTheDocument();
    // The Terms' own date (SMA-448): the day of their change for the formulas.
    expect(screen.getByText(/October 1, 2026/)).toBeInTheDocument();
    // SMA-157 regression: no unresolved [À REMPLIR/CONFIRMER/ACTIVER] marker.
    expect(container.textContent).not.toContain('[À');
    expect(container.textContent).not.toContain('[OPTION');
  });

  it('keeps the botanical-data disclaimer (information, not prescription)', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /information, not prescription/ })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Under no circumstances does it constitute medical, veterinary/
      )
    ).toBeInTheDocument();
  });

  it('renders in French with the full disclaimer and the real date', async () => {
    await i18next.changeLanguage('fr');
    const { container } = renderPage();
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: "Conditions générales d'utilisation (CGU)",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /information, pas prescription/ })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /ne constituent en aucun cas un avis médical, vétérinaire/
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/1er octobre 2026/)).toBeInTheDocument();
    expect(container.textContent).not.toContain('[À');
    expect(container.textContent).not.toContain('[OPTION');
  });
});

// SMA-448 — the article « Formules » (03), the text of « SMA-448 - CGU et
// confidentialité - texte final.md » (§ 2). Its limits are READ from the
// reference file — the one the server serves and is tested against
// (`FormulasControllerTests`) —, never copied here: a limit changed in
// `FormulaCatalog.cs` cannot leave the Terms wrong in silence (T6).
describe('the article « Formulas » (SMA-448)', () => {
  const { novice, gardener, expert } = reference.formulas;
  const size = (formula: { maxGardenSize: { width: number; height: number } }) =>
    `${formula.maxGardenSize.width} × ${formula.maxGardenSize.height}`;
  const sections = (container: HTMLElement) =>
    [...container.querySelectorAll('section')].map((section) => ({
      number: section.querySelector('span')?.textContent,
      title: section.querySelector('h2')?.textContent,
    }));

  beforeEach(async () => {
    await i18next.changeLanguage('en');
  });

  it('in English: article 03 says the reference file’s limits, eleven articles numbered 01 to 11, and the date of the change', () => {
    const { container } = renderPage();
    expect(expert.gardenLimit).toBeNull();

    const article = screen.getByRole('heading', { name: 'Formulas' }).closest('section')!;
    expect(article.textContent).toContain(`Novice: up to ${novice.gardenLimit} gardens, each up to ${size(novice)} cells.`);
    expect(article.textContent).toContain(`Gardener: up to ${gardener.gardenLimit} gardens, each up to ${size(gardener)} cells.`);
    expect(article.textContent).toContain(`Expert: an unlimited number of gardens, each up to ${size(expert)} cells.`);
    expect(article.textContent).toContain('Changing formula never deletes a garden, a plan or a placed plant.');
    // Question 1, « oui » (Alexandre, 30/09): the article sends to the policy for the data.
    expect(article.textContent).toContain('The data the formulas record is described in the Privacy Policy.');

    expect(sections(container)).toEqual([
      { number: '01', title: 'Purpose' },
      { number: '02', title: 'Access to the Service' },
      { number: '03', title: 'Formulas' },
      { number: '04', title: 'User account' },
      { number: '05', title: 'User content' },
      { number: '06', title: 'Botanical data — information, not prescription ⚠️' },
      { number: '07', title: 'Intellectual property' },
      { number: '08', title: 'Liability' },
      { number: '09', title: 'Suspension and termination' },
      { number: '10', title: 'Changes to the Terms' },
      { number: '11', title: 'Governing law' },
    ]);
    expect(screen.getByText(/all free \(€0\)/)).toBeInTheDocument();
    expect(screen.getByText(/no formula will become paid without your explicit agreement/)).toBeInTheDocument();
    expect(screen.getByText(/the date shows the latest change/)).toBeInTheDocument();
    expect(screen.getByText(/October 1, 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/September 22, 2026/)).toBeNull();
  });

  it('en français : l’article 03 dit les limites du fichier de référence, onze articles numérotés de 01 à 11, et la date du changement', async () => {
    await i18next.changeLanguage('fr');
    const { container } = renderPage();

    const article = screen.getByRole('heading', { name: 'Formules' }).closest('section')!;
    expect(article.textContent).toContain(`Novice : jusqu'à ${novice.gardenLimit} jardins, chacun jusqu'à ${size(novice)} cases.`);
    expect(article.textContent).toContain(`Jardinier : jusqu'à ${gardener.gardenLimit} jardins, chacun jusqu'à ${size(gardener)} cases.`);
    expect(article.textContent).toContain(`Expert : jardins en nombre illimité, chacun jusqu'à ${size(expert)} cases.`);
    expect(article.textContent).toContain('Changer de formule ne supprime jamais un jardin, ni un plan, ni une plante placée.');
    expect(article.textContent).toContain("Les données qu'enregistrent les formules sont décrites dans la Politique de confidentialité.");

    expect(sections(container).map((section) => section.number)).toEqual(
      ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11']
    );
    expect(sections(container)[2]).toEqual({ number: '03', title: 'Formules' });
    expect(screen.getByText(/toutes gratuites \(0 €\)/)).toBeInTheDocument();
    expect(screen.getByText(/aucune formule ne deviendra payante sans votre accord explicite/)).toBeInTheDocument();
    expect(screen.getByText(/la date indique la dernière modification/)).toBeInTheDocument();
    expect(screen.getByText(/1er octobre 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/22 septembre 2026/)).toBeNull();
  });
});
